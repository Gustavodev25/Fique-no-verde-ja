import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    return cookieToken;
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
};

const authenticateUser = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    const result = await query(
      `SELECT id, first_name, last_name, email, is_admin
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw new Error("Usuario nao encontrado");
    }

    return user;
  } catch (error) {
    console.error("Falha na autenticacao:", error);
    throw new Error("Falha na autenticacao");
  }
};

const authenticateAdmin = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    const result = await query(
      `SELECT id, first_name, last_name, email, is_admin
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    const adminUser = result.rows[0];
    if (!adminUser || !adminUser.is_admin) {
      throw new Error("Usuario nao possui permissao administrativa");
    }

    return adminUser;
  } catch (error) {
    console.error("Falha na autenticacao do administrador:", error);
    throw new Error("Falha na autenticacao do administrador");
  }
};

// Validar CPF
const isValidCPF = (cpf: string): boolean => {
  const cleanCPF = cpf.replace(/\D/g, "");

  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1+$/.test(cleanCPF)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCPF.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCPF.charAt(10))) return false;

  return true;
};

// Validar CNPJ
const isValidCNPJ = (cnpj: string): boolean => {
  const cleanCNPJ = cnpj.replace(/\D/g, "");

  if (cleanCNPJ.length !== 14) return false;
  if (/^(\d)\1+$/.test(cleanCNPJ)) return false;

  let length = cleanCNPJ.length - 2;
  let numbers = cleanCNPJ.substring(0, length);
  const digits = cleanCNPJ.substring(length);
  let sum = 0;
  let pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  length = length + 1;
  numbers = cleanCNPJ.substring(0, length);
  sum = 0;
  pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
};

// GET - Listar todos os clientes
export async function GET(request: NextRequest) {
  try {
    await authenticateUser(request);

    const clients = await query(
      `SELECT
        c.id,
        c.name,
        c.phone,
        c.birth_date,
        c.email,
        c.cpf_cnpj,
        c.origin_id,
        c.is_active,
        c.created_at,
        c.updated_at,
        co.name as origin_name
       FROM clients c
       LEFT JOIN client_origins co ON c.origin_id = co.id
       ORDER BY c.created_at DESC`
    );

    return NextResponse.json({ clients: clients.rows }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel carregar os clientes";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Criar novo cliente
export async function POST(request: NextRequest) {
  try {
    const requestUser = await authenticateUser(request);

    const body = await request.json();
    const { name, phone, birthDate, email, cpfCnpj, originId } = body;

    // Validações
    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome do cliente e obrigatorio" },
        { status: 400 }
      );
    }

    if (email && !emailRegex.test(email)) {
      return NextResponse.json({ error: "Email invalido" }, { status: 400 });
    }

    if (phone && !phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: "Telefone invalido. Use o formato (XX) XXXXX-XXXX" },
        { status: 400 }
      );
    }

    // Validar CPF/CNPJ
    if (cpfCnpj) {
      const isCPF = cpfRegex.test(cpfCnpj);
      const isCNPJ = cnpjRegex.test(cpfCnpj);

      if (!isCPF && !isCNPJ) {
        return NextResponse.json(
          { error: "CPF/CNPJ invalido. Use o formato XXX.XXX.XXX-XX para CPF ou XX.XXX.XXX/XXXX-XX para CNPJ" },
          { status: 400 }
        );
      }

      if (isCPF && !isValidCPF(cpfCnpj)) {
        return NextResponse.json(
          { error: "CPF invalido" },
          { status: 400 }
        );
      }

      if (isCNPJ && !isValidCNPJ(cpfCnpj)) {
        return NextResponse.json(
          { error: "CNPJ invalido" },
          { status: 400 }
        );
      }

      // Verificar se já existe um cliente com este CPF/CNPJ
      const existingClient = await query(
        "SELECT id FROM clients WHERE cpf_cnpj = $1",
        [cpfCnpj]
      );

      if (existingClient.rows.length > 0) {
        return NextResponse.json(
          { error: "Ja existe um cliente com este CPF/CNPJ" },
          { status: 409 }
        );
      }
    }

    // Validar data de nascimento
    if (birthDate) {
      const date = new Date(birthDate);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: "Data de nascimento invalida" },
          { status: 400 }
        );
      }

      // Verificar se a data não é futura
      if (date > new Date()) {
        return NextResponse.json(
          { error: "Data de nascimento nao pode ser futura" },
          { status: 400 }
        );
      }
    }

    const result = await query(
      `INSERT INTO clients (name, phone, birth_date, email, cpf_cnpj, origin_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, phone, birth_date, email, cpf_cnpj, origin_id, is_active, created_at`,
      [
        name.trim(),
        phone || null,
        birthDate || null,
        email || null,
        cpfCnpj || null,
        originId || null,
        requestUser.id
      ]
    );

    const client = result.rows[0];

    return NextResponse.json(
      {
        client,
        message: "Cliente criado com sucesso",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar cliente:", error);
    const message = error instanceof Error ? error.message : "Erro ao criar cliente";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT - Atualizar cliente existente
export async function PUT(request: NextRequest) {
  try {
    await authenticateAdmin(request);

    const body = await request.json();
    const { id, name, phone, birthDate, email, cpfCnpj, originId, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID do cliente e obrigatorio" },
        { status: 400 }
      );
    }

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome do cliente e obrigatorio" },
        { status: 400 }
      );
    }

    if (email && !emailRegex.test(email)) {
      return NextResponse.json({ error: "Email invalido" }, { status: 400 });
    }

    if (phone && !phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: "Telefone invalido. Use o formato (XX) XXXXX-XXXX" },
        { status: 400 }
      );
    }

    // Validar CPF/CNPJ
    if (cpfCnpj) {
      const isCPF = cpfRegex.test(cpfCnpj);
      const isCNPJ = cnpjRegex.test(cpfCnpj);

      if (!isCPF && !isCNPJ) {
        return NextResponse.json(
          { error: "CPF/CNPJ invalido. Use o formato XXX.XXX.XXX-XX para CPF ou XX.XXX.XXX/XXXX-XX para CNPJ" },
          { status: 400 }
        );
      }

      if (isCPF && !isValidCPF(cpfCnpj)) {
        return NextResponse.json(
          { error: "CPF invalido" },
          { status: 400 }
        );
      }

      if (isCNPJ && !isValidCNPJ(cpfCnpj)) {
        return NextResponse.json(
          { error: "CNPJ invalido" },
          { status: 400 }
        );
      }

      // Verificar se já existe outro cliente com este CPF/CNPJ
      const existingClient = await query(
        "SELECT id FROM clients WHERE cpf_cnpj = $1 AND id != $2",
        [cpfCnpj, id]
      );

      if (existingClient.rows.length > 0) {
        return NextResponse.json(
          { error: "Ja existe outro cliente com este CPF/CNPJ" },
          { status: 409 }
        );
      }
    }

    // Validar data de nascimento
    if (birthDate) {
      const date = new Date(birthDate);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: "Data de nascimento invalida" },
          { status: 400 }
        );
      }

      if (date > new Date()) {
        return NextResponse.json(
          { error: "Data de nascimento nao pode ser futura" },
          { status: 400 }
        );
      }
    }

    const result = await query(
      `UPDATE clients
       SET name = $1, phone = $2, birth_date = $3, email = $4, cpf_cnpj = $5, origin_id = $6, is_active = $7
       WHERE id = $8
       RETURNING id, name, phone, birth_date, email, cpf_cnpj, origin_id, is_active, created_at, updated_at`,
      [
        name.trim(),
        phone || null,
        birthDate || null,
        email || null,
        cpfCnpj || null,
        originId || null,
        isActive !== undefined ? isActive : true,
        id
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Cliente nao encontrado" },
        { status: 404 }
      );
    }

    const client = result.rows[0];

    return NextResponse.json(
      {
        client,
        message: "Cliente atualizado com sucesso",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error);
    const message = error instanceof Error ? error.message : "Erro ao atualizar cliente";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE - Remover cliente
export async function DELETE(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const { clientId } = await request.json();

    if (!clientId) {
      return NextResponse.json(
        { error: "ID do cliente obrigatorio" },
        { status: 400 }
      );
    }

    const result = await query(
      "DELETE FROM clients WHERE id = $1 RETURNING id",
      [clientId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Cliente nao encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Cliente removido com sucesso" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);
    const message = error instanceof Error ? error.message : "Erro ao excluir cliente";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
