import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;

type DecodedToken = {
  userId: string;
};

const generatePassword = (length = 10) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$!";
  return Array.from({ length }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
};

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

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);

    const users = await query(
      `SELECT id, first_name, last_name, email, phone, is_active, is_admin, created_by_admin, created_at, admin_generated_password
       FROM users
       ORDER BY created_at DESC`
    );

    return NextResponse.json({ users: users.rows }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel carregar os usuarios";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await authenticateAdmin(request);

    const body = await request.json();
    const { firstName, lastName, email, phone } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "Nome, sobrenome e email sao obrigatorios" },
        { status: 400 }
      );
    }

    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Email invalido" }, { status: 400 });
    }

    if (phone && !phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: "Telefone invalido. Use o formato (XX) XXXXX-XXXX" },
        { status: 400 }
      );
    }

    const existingUser = await query("SELECT id FROM users WHERE email = $1", [email]);

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: "Ja existe um usuario com este email" },
        { status: 409 }
      );
    }

    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

    const result = await query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, created_by_admin, admin_generated_password)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, first_name, last_name, email, phone, is_active, created_at, admin_generated_password`,
      [firstName, lastName, email, phone || null, passwordHash, generatedPassword]
    );

    const user = result.rows[0];

    return NextResponse.json(
      {
        user,
        generatedPassword,
        message: "Usuario criado com sucesso",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar usuario admin:", error);
    const message = error instanceof Error ? error.message : "Erro ao criar usuario";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await authenticateAdmin(request);
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "ID do usuario obrigatório" }, { status: 400 });
    }

    if (userId === adminUser.id) {
      return NextResponse.json({ error: "Você não pode excluir a própria conta enquanto autenticado" }, { status: 403 });
    }

    const result = await query("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Usuario não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Usuario removido com sucesso" }, { status: 200 });
  } catch (error) {
    console.error("Erro ao excluir usuario admin:", error);
    const message = error instanceof Error ? error.message : "Erro ao excluir usuario";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
