import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

type AuthenticatedUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_admin: boolean;
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

const authenticateUser = async (request: NextRequest): Promise<AuthenticatedUser> => {
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

// GET - Listar vendas
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);

    // Se o usuário é admin, mostra todas as vendas
    // Caso contrário, mostra apenas as vendas do próprio atendente
    const whereClause = user.is_admin ? "" : "WHERE s.attendant_id = $1";
    const queryParams = user.is_admin ? [] : [user.id];

    const sales = await query(
      `SELECT
        s.id,
        s.client_id,
        s.attendant_id,
        s.sale_date,
        s.observations,
        s.status,
        s.payment_method,
        s.general_discount_type,
        s.general_discount_value,
        s.subtotal,
        s.total_discount,
        s.total,
        s.confirmed_at,
        s.cancelled_at,
        s.created_at,
        s.updated_at,
        c.name as client_name,
        u.first_name || ' ' || u.last_name as attendant_name
       FROM sales s
       JOIN clients c ON s.client_id = c.id
       JOIN users u ON s.attendant_id = u.id
       ${whereClause}
       ORDER BY s.sale_date DESC`,
      queryParams
    );

    // Buscar os itens de cada venda
    const formattedSales = await Promise.all(
      sales.rows.map(async (sale) => {
        const items = await query(
          `SELECT
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            discount_type,
            discount_value,
            subtotal,
            discount_amount,
            total
           FROM sale_items
           WHERE sale_id = $1
           ORDER BY created_at`,
          [sale.id]
        );

        return {
          id: sale.id,
          clientId: sale.client_id,
          clientName: sale.client_name,
          attendantId: sale.attendant_id,
          attendantName: sale.attendant_name,
          saleDate: sale.sale_date,
          observations: sale.observations,
          status: sale.status,
          paymentMethod: sale.payment_method,
          generalDiscountType: sale.general_discount_type,
          generalDiscountValue: sale.general_discount_value,
          subtotal: parseFloat(sale.subtotal),
          totalDiscount: parseFloat(sale.total_discount),
          total: parseFloat(sale.total),
          confirmedAt: sale.confirmed_at,
          cancelledAt: sale.cancelled_at,
          createdAt: sale.created_at,
          updatedAt: sale.updated_at,
          items: items.rows.map((item) => ({
            id: item.id,
            productId: item.product_id,
            productName: item.product_name,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price),
            discountType: item.discount_type,
            discountValue: parseFloat(item.discount_value),
            subtotal: parseFloat(item.subtotal),
            discountAmount: parseFloat(item.discount_amount),
            total: parseFloat(item.total),
          })),
        };
      })
    );

    return NextResponse.json({ sales: formattedSales }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel carregar as vendas";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Criar nova venda
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const body = await request.json();
    const {
      clientId,
      observations,
      paymentMethod,
      items,
      generalDiscountType,
      generalDiscountValue,
      saleType, // "01", "02", ou "03"
      serviceId, // Usado para tipo "02" (Venda de Pacote)
      packageId, // Usado para tipo "03" (Consumo de Pacote)
    } = body;

    // Validações
    if (!clientId) {
      return NextResponse.json(
        { error: "Cliente e obrigatorio" },
        { status: 400 }
      );
    }

    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Metodo de pagamento e obrigatorio" },
        { status: 400 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "A venda deve ter pelo menos um item" },
        { status: 400 }
      );
    }

    // Validação específica para consumo de pacote
    if (saleType === "03" && !packageId) {
      return NextResponse.json(
        { error: "Package ID obrigatorio para consumo de pacote" },
        { status: 400 }
      );
    }

    // Iniciar transação
    await query("BEGIN");

    try {
      // Criar a venda
      const saleResult = await query(
        `INSERT INTO sales (
          client_id,
          attendant_id,
          sale_date,
          observations,
          payment_method,
          general_discount_type,
          general_discount_value,
          status
        ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, 'aberta')
        RETURNING id, sale_date`,
        [
          clientId,
          user.id,
          observations || null,
          paymentMethod,
          generalDiscountType || null,
          generalDiscountValue || 0,
        ]
      );

      const saleId = saleResult.rows[0].id;
      const saleDate = saleResult.rows[0].sale_date;

      let totalSubtotal = 0;
      let totalDiscountAmount = 0;

      // Inserir os itens da venda
      for (const item of items) {
        const {
          productId,
          productName,
          quantity,
          unitPrice,
          calculatedSubtotal,
          discountType,
          discountValue,
        } = item;

        console.log("DEBUG BACKEND - Item recebido:", {
          saleType,
          productName,
          quantity,
          unitPrice,
          calculatedSubtotal,
        });

        // Usar calculatedSubtotal se disponível (para serviços com cálculo progressivo)
        // Caso contrário, calcular normalmente
        const subtotal = calculatedSubtotal !== undefined && calculatedSubtotal !== null
          ? Number(calculatedSubtotal)
          : quantity * unitPrice;

        console.log("DEBUG BACKEND - Subtotal usado:", subtotal);

        let discountAmount = 0;

        if (discountType === "percentage" && discountValue > 0) {
          discountAmount = subtotal * (discountValue / 100);
        } else if (discountType === "fixed" && discountValue > 0) {
          discountAmount = discountValue;
        }

        const itemTotal = subtotal - discountAmount;

        await query(
          `INSERT INTO sale_items (
            sale_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            discount_type,
            discount_value,
            subtotal,
            discount_amount,
            total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            saleId,
            productId,
            productName,
            quantity,
            unitPrice,
            discountType || null,
            discountValue || 0,
            subtotal,
            discountAmount,
            itemTotal,
          ]
        );

        totalSubtotal += subtotal;
        totalDiscountAmount += discountAmount;
      }

      // Aplicar desconto geral se houver
      let generalDiscountAmount = 0;
      if (generalDiscountType === "percentage" && generalDiscountValue > 0) {
        generalDiscountAmount = totalSubtotal * (generalDiscountValue / 100);
      } else if (generalDiscountType === "fixed" && generalDiscountValue > 0) {
        generalDiscountAmount = generalDiscountValue;
      }

      const finalTotal = totalSubtotal - totalDiscountAmount - generalDiscountAmount;

      // Atualizar totais da venda
      await query(
        `UPDATE sales
         SET subtotal = $1, total_discount = $2, total = $3
         WHERE id = $4`,
        [totalSubtotal, totalDiscountAmount + generalDiscountAmount, finalTotal, saleId]
      );

      // ============================================
      // LÓGICA ESPECÍFICA POR TIPO DE VENDA
      // ============================================

      if (saleType === "02" && serviceId) {
        // Tipo 02 - VENDA DE PACOTE: Criar pacote para o cliente
        const firstItem = items[0];
        const totalQuantity = firstItem.quantity;
        const totalPaid = finalTotal;
        const unitPricePackage = totalPaid / totalQuantity;

        await query(
          `INSERT INTO client_packages (
            client_id,
            service_id,
            sale_id,
            initial_quantity,
            consumed_quantity,
            available_quantity,
            unit_price,
            total_paid,
            is_active
          ) VALUES ($1, $2, $3, $4, 0, $4, $5, $6, true)`,
          [clientId, serviceId, saleId, totalQuantity, unitPricePackage, totalPaid]
        );

        console.log(`Pacote criado: ${totalQuantity} créditos para cliente ${clientId}`);
      } else if (saleType === "03" && packageId) {
        // Tipo 03 - CONSUMO DE PACOTE: Consumir do pacote existente
        const firstItem = items[0];
        const quantityToConsume = firstItem.quantity;

        // Usar a função consume_package para garantir atomicidade
        try {
          await query("SELECT consume_package($1, $2, $3)", [
            packageId,
            saleId,
            quantityToConsume,
          ]);

          console.log(
            `Consumido ${quantityToConsume} unidades do pacote ${packageId}`
          );
        } catch (pkgError: any) {
          // Se falhar, reverter tudo
          throw new Error(
            `Erro ao consumir pacote: ${pkgError.message || "Saldo insuficiente ou pacote inválido"}`
          );
        }
      }

      await query("COMMIT");

      return NextResponse.json(
        {
          sale: {
            id: saleId,
            saleDate,
            status: "aberta",
            total: finalTotal,
            saleType,
          },
          message: "Venda criada com sucesso",
        },
        { status: 201 }
      );
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Erro ao criar venda:", error);
    const message = error instanceof Error ? error.message : "Erro ao criar venda";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT - Atualizar venda (apenas vendas abertas)
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const body = await request.json();
    const {
      id,
      clientId,
      observations,
      paymentMethod,
      items,
      generalDiscountType,
      generalDiscountValue,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID da venda e obrigatorio" },
        { status: 400 }
      );
    }

    // Verificar se a venda existe e está aberta
    const saleCheck = await query(
      `SELECT id, attendant_id, status FROM sales WHERE id = $1`,
      [id]
    );

    if (saleCheck.rowCount === 0) {
      return NextResponse.json(
        { error: "Venda nao encontrada" },
        { status: 404 }
      );
    }

    const sale = saleCheck.rows[0];

    if (sale.status !== "aberta") {
      return NextResponse.json(
        { error: "Apenas vendas abertas podem ser editadas" },
        { status: 400 }
      );
    }

    // Verificar permissões: apenas o próprio atendente ou admin pode editar
    if (!user.is_admin && sale.attendant_id !== user.id) {
      return NextResponse.json(
        { error: "Voce nao tem permissao para editar esta venda" },
        { status: 403 }
      );
    }

    await query("BEGIN");

    try {
      // Atualizar a venda
      await query(
        `UPDATE sales
         SET client_id = $1,
             observations = $2,
             payment_method = $3,
             general_discount_type = $4,
             general_discount_value = $5
         WHERE id = $6`,
        [
          clientId,
          observations || null,
          paymentMethod,
          generalDiscountType || null,
          generalDiscountValue || 0,
          id,
        ]
      );

      // Remover itens antigos
      await query("DELETE FROM sale_items WHERE sale_id = $1", [id]);

      let totalSubtotal = 0;
      let totalDiscountAmount = 0;

      // Inserir novos itens
      for (const item of items) {
        const {
          productId,
          productName,
          quantity,
          unitPrice,
          calculatedSubtotal,
          discountType,
          discountValue,
        } = item;

        // Usar calculatedSubtotal se disponível (para serviços com cálculo progressivo)
        // Caso contrário, calcular normalmente
        const subtotal = calculatedSubtotal !== undefined && calculatedSubtotal !== null
          ? Number(calculatedSubtotal)
          : quantity * unitPrice;

        let discountAmount = 0;

        if (discountType === "percentage" && discountValue > 0) {
          discountAmount = subtotal * (discountValue / 100);
        } else if (discountType === "fixed" && discountValue > 0) {
          discountAmount = discountValue;
        }

        const itemTotal = subtotal - discountAmount;

        await query(
          `INSERT INTO sale_items (
            sale_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            discount_type,
            discount_value,
            subtotal,
            discount_amount,
            total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id,
            productId,
            productName,
            quantity,
            unitPrice,
            discountType || null,
            discountValue || 0,
            subtotal,
            discountAmount,
            itemTotal,
          ]
        );

        totalSubtotal += subtotal;
        totalDiscountAmount += discountAmount;
      }

      // Aplicar desconto geral
      let generalDiscountAmount = 0;
      if (generalDiscountType === "percentage" && generalDiscountValue > 0) {
        generalDiscountAmount = totalSubtotal * (generalDiscountValue / 100);
      } else if (generalDiscountType === "fixed" && generalDiscountValue > 0) {
        generalDiscountAmount = generalDiscountValue;
      }

      const finalTotal = totalSubtotal - totalDiscountAmount - generalDiscountAmount;

      // Atualizar totais
      await query(
        `UPDATE sales
         SET subtotal = $1, total_discount = $2, total = $3
         WHERE id = $4`,
        [totalSubtotal, totalDiscountAmount + generalDiscountAmount, finalTotal, id]
      );

      await query("COMMIT");

      return NextResponse.json(
        {
          message: "Venda atualizada com sucesso",
          total: finalTotal,
        },
        { status: 200 }
      );
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Erro ao atualizar venda:", error);
    const message = error instanceof Error ? error.message : "Erro ao atualizar venda";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
