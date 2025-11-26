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

/**
 * GET /api/reports/sales
 *
 * Retorna relatório de vendas com filtros avançados
 *
 * Query params:
 * - startDate: Data inicial (YYYY-MM-DD)
 * - endDate: Data final (YYYY-MM-DD)
 * - attendantId: Filtrar por atendente (apenas admin)
 * - serviceId: Filtrar por serviço
 * - saleType: Filtrar por tipo de venda (01, 02, 03)
 * - status: Filtrar por status (aberta, confirmada, cancelada)
 */
export async function GET(request: NextRequest) {
  try {
    // Autenticar usuário
    const user = await authenticateUser(request);

    // Extrair query params
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const attendantId = searchParams.get("attendantId");
    const serviceId = searchParams.get("serviceId");
    const saleType = searchParams.get("saleType");
    const status = searchParams.get("status");

    // Construir query dinâmica
    let sql = `
      SELECT
        s.id,
        s.sale_date,
        s.status,
        s.payment_method,
        s.subtotal,
        s.total_discount,
        s.total,
        s.observations,
        c.id as client_id,
        c.name as client_name,
        u.id as attendant_id,
        u.first_name || ' ' || u.last_name as attendant_name,
        -- Agregação de itens (pegar o primeiro serviço/produto como referência)
        (
          SELECT json_build_object(
            'name', COALESCE(serv.name, si.product_name),
            'quantity', si.quantity,
            'unitPrice', si.unit_price,
            'saleType', COALESCE(
              (SELECT cp.id FROM client_packages cp WHERE cp.sale_id = s.id LIMIT 1),
              (SELECT pc.package_id FROM package_consumptions pc WHERE pc.sale_id = s.id LIMIT 1),
              NULL
            )
          )
          FROM sale_items si
          LEFT JOIN services serv ON si.service_id = serv.id
          WHERE si.sale_id = s.id
          LIMIT 1
        ) as first_item
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      JOIN users u ON s.attendant_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Filtro: Se usuário NÃO é admin, só vê suas vendas
    if (!user.is_admin) {
      sql += ` AND s.attendant_id = $${paramIndex}`;
      params.push(user.id);
      paramIndex++;
    }

    // Filtro: Data inicial
    if (startDate) {
      sql += ` AND s.sale_date >= $${paramIndex}::date`;
      params.push(startDate);
      paramIndex++;
    }

    // Filtro: Data final
    if (endDate) {
      sql += ` AND s.sale_date <= $${paramIndex}::date`;
      params.push(endDate);
      paramIndex++;
    }

    // Filtro: Atendente (apenas para admin)
    if (user.is_admin && attendantId) {
      sql += ` AND s.attendant_id = $${paramIndex}`;
      params.push(attendantId);
      paramIndex++;
    }

    // Filtro: Status
    if (status) {
      sql += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Filtro: Serviço
    if (serviceId) {
      sql += ` AND EXISTS (
        SELECT 1 FROM sale_items si
        WHERE si.sale_id = s.id AND si.service_id = $${paramIndex}
      )`;
      params.push(serviceId);
      paramIndex++;
    }

    // Filtro: Tipo de venda (01, 02, 03)
    if (saleType) {
      if (saleType === "02") {
        // Venda de Pacote: existe registro em client_packages
        sql += ` AND EXISTS (
          SELECT 1 FROM client_packages cp WHERE cp.sale_id = s.id
        )`;
      } else if (saleType === "03") {
        // Consumo de Pacote: existe registro em package_consumptions
        sql += ` AND EXISTS (
          SELECT 1 FROM package_consumptions pc WHERE pc.sale_id = s.id
        )`;
      } else if (saleType === "01") {
        // Venda Comum: não existe em nenhuma das tabelas de pacotes
        sql += ` AND NOT EXISTS (
          SELECT 1 FROM client_packages cp WHERE cp.sale_id = s.id
        ) AND NOT EXISTS (
          SELECT 1 FROM package_consumptions pc WHERE pc.sale_id = s.id
        )`;
      }
    }

    sql += ` ORDER BY s.sale_date DESC, s.created_at DESC`;

    // Executar query
    const result = await query(sql, params);

    // Calcular métricas
    const totalSales = result.rows.length;
    const totalValue = result.rows.reduce((sum, row) => sum + parseFloat(row.total || 0), 0);
    const salesByStatus = {
      aberta: result.rows.filter(r => r.status === "aberta").length,
      confirmada: result.rows.filter(r => r.status === "confirmada").length,
      cancelada: result.rows.filter(r => r.status === "cancelada").length,
    };

    return NextResponse.json(
      {
        sales: result.rows.map((row) => ({
          id: row.id,
          saleDate: row.sale_date,
          status: row.status,
          paymentMethod: row.payment_method,
          subtotal: parseFloat(row.subtotal),
          totalDiscount: parseFloat(row.total_discount),
          total: parseFloat(row.total),
          observations: row.observations,
          clientId: row.client_id,
          clientName: row.client_name,
          attendantId: row.attendant_id,
          attendantName: row.attendant_name,
          firstItem: row.first_item,
        })),
        metrics: {
          totalSales,
          totalValue,
          salesByStatus,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao buscar relatório de vendas:", error);

    const message =
      error instanceof Error ? error.message : "Erro ao buscar relatório";

    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.message.includes("autenticação") ? 401 : 500 }
    );
  }
}
