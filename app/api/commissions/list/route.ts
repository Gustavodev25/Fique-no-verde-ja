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
  is_admin: boolean;
};

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) return cookieToken;
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
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
      `SELECT id, first_name, last_name, is_admin
       FROM users
       WHERE id = $1`,
      [decoded.userId],
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

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const attendantFilter = searchParams.get("attendantId");
    const status = searchParams.get("status");
    const dayType = searchParams.get("dayType");

    let sql = `
      SELECT
        c.id,
        c.reference_date,
        c.commission_amount,
        c.status,
        c.created_at,
        c.user_id as attendant_id,
        u.first_name,
        u.last_name,
        s.id as sale_id,
        s.sale_number,
        s.subtotal,
        s.total_discount,
        s.total,
        s.refund_total,
        CASE
          WHEN EXTRACT(DOW FROM c.reference_date) IN (0,6)
            OR EXISTS (
              SELECT 1 FROM holidays h
              WHERE h.date = c.reference_date::date
              AND h.is_active = true
            )
          THEN 'non_working'
          ELSE 'weekday'
        END as day_type,
        cl.name as client_name,
        si.product_name,
        si.quantity as item_quantity
      FROM commissions c
      JOIN users u ON c.user_id = u.id
      JOIN sales s ON c.sale_id = s.id
      JOIN clients cl ON s.client_id = cl.id
      LEFT JOIN sale_items si ON c.sale_item_id = si.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    if (!user.is_admin) {
      paramCount++;
      sql += ` AND c.user_id = $${paramCount}`;
      params.push(user.id);
    } else if (attendantFilter) {
      paramCount++;
      sql += ` AND c.user_id = $${paramCount}`;
      params.push(attendantFilter);
    }
    if (startDate) {
      paramCount++;
      sql += ` AND c.reference_date >= $${paramCount}`;
      params.push(startDate);
    }
    if (endDate) {
      paramCount++;
      sql += ` AND c.reference_date <= $${paramCount}`;
      params.push(endDate);
    }
    if (status) {
      paramCount++;
      sql += ` AND c.status = $${paramCount}`;
      params.push(status);
    }
    if (dayType === "weekday" || dayType === "non_working") {
      paramCount++;
      sql += ` AND (
        CASE
          WHEN EXTRACT(DOW FROM c.reference_date) IN (0,6)
            OR EXISTS (
              SELECT 1 FROM holidays h
              WHERE h.date = c.reference_date::date
              AND h.is_active = true
            )
          THEN 'non_working'
          ELSE 'weekday'
        END
      ) = $${paramCount}`;
      params.push(dayType);
    }

    sql += ` ORDER BY c.reference_date DESC, c.created_at DESC`;

    let result;
    try {
      result = await query(sql, params);
    } catch (err: any) {
      const msg = err?.message || "";
      // Fallback se o schema ainda nao tiver sale_number / refund_total
      if (msg.includes("sale_number") || msg.includes("refund_total")) {
        result = await query(
          sql.replace("s.sale_number,", "NULL as sale_number,").replace("s.refund_total,", "0 as refund_total,"),
          params,
        );
      } else {
        throw err;
      }
    }

    const commissions = result.rows.map((row: any) => ({
      id: row.id,
      referenceDate: row.reference_date,
      amount: Number(row.commission_amount),
      status: row.status,
      createdAt: row.created_at,
      attendantId: row.attendant_id,
      attendantName: `${row.first_name} ${row.last_name}`.trim(),
      saleId: row.sale_id,
      saleNumber: row.sale_number ?? null,
      saleSubtotal: row.subtotal !== undefined ? Number(row.subtotal) : null,
      saleDiscount: row.total_discount !== undefined ? Number(row.total_discount) : null,
      saleTotal: row.total !== undefined ? Number(row.total) : null,
      refundTotal: row.refund_total !== undefined ? Number(row.refund_total) : null,
      saleNetTotal:
        row.total !== undefined
          ? Number(row.total) - Number(row.refund_total ?? 0)
          : null,
      dayType: row.day_type || "weekday",
      clientName: row.client_name,
      productName: row.product_name || "N/A",
      itemQuantity: row.item_quantity !== undefined ? Number(row.item_quantity) : null,
    }));

    return NextResponse.json({ commissions });
  } catch (error) {
    console.error("Erro ao listar comissoes:", error);
    const message = error instanceof Error ? error.message : "Erro ao listar comissoes";
    const status = message.includes("autenticacao") || message.includes("Token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
