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

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const normalizeServiceSql = (value: string) => `
  LOWER(
    TRANSLATE(
      TRIM(${value}),
      '\u00C1\u00C0\u00C2\u00C3\u00C4\u00C5\u00E1\u00E0\u00E2\u00E3\u00E4\u00E5\u00C9\u00C8\u00CA\u00CB\u00E9\u00E8\u00EA\u00EB\u00CD\u00CC\u00CE\u00CF\u00ED\u00EC\u00EE\u00EF\u00D3\u00D2\u00D4\u00D5\u00D6\u00F3\u00F2\u00F4\u00F5\u00F6\u00DA\u00D9\u00DB\u00DC\u00FA\u00F9\u00FB\u00FC\u00C7\u00E7',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    )
  )
`;

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    return cookieToken;
  }

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
      `SELECT id, first_name, last_name, email, is_admin
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

type FilterOptions = {
  includePeriod?: boolean;
  includeService?: boolean;
  saleAlias?: string;
  saleItemAlias?: string;
  serviceAlias?: string;
  applyUserFilter?: boolean;
  paramOffset?: number;
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const { searchParams } = new URL(request.url);

    const requestedPeriod = Number(searchParams.get("periodDays"));
    const rawStartDate = searchParams.get("startDate");
    const rawEndDate = searchParams.get("endDate");
    const serviceFilterRaw = searchParams.get("serviceName");
    const normalizedServiceName = serviceFilterRaw
      ? normalizeText(serviceFilterRaw)
      : null;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let startDate: string | null = null;
    let endDate: string | null = null;
    let useCustomRange = false;

    if (
      rawStartDate &&
      rawEndDate &&
      dateRegex.test(rawStartDate) &&
      dateRegex.test(rawEndDate)
    ) {
      const startMs = Date.parse(rawStartDate);
      const endMs = Date.parse(rawEndDate);
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && startMs <= endMs) {
        startDate = rawStartDate;
        endDate = rawEndDate;
        useCustomRange = true;
      }
    }

    const periodDays = Number.isFinite(requestedPeriod)
      ? Math.min(Math.max(requestedPeriod, 7), 180)
      : 30;

    const analysisPeriodDays = useCustomRange
      ? Math.floor(
          (Date.parse(endDate!) - Date.parse(startDate!)) / (1000 * 60 * 60 * 24),
        ) + 1
      : periodDays;

    const buildFilters = ({
      includePeriod = false,
      includeService = false,
      saleAlias = "s",
      saleItemAlias = "si",
      serviceAlias = "serv",
      applyUserFilter = true,
      paramOffset = 0,
    }: FilterOptions = {}) => {
      const clauses: string[] = [];
      const params: Array<string | number> = [];

      if (applyUserFilter && !user.is_admin) {
        clauses.push(`${saleAlias}.attendant_id = $${params.length + 1 + paramOffset}`);
        params.push(user.id);
      }

      if (includePeriod) {
        if (useCustomRange && startDate && endDate) {
          clauses.push(`${saleAlias}.sale_date::date >= $${params.length + 1 + paramOffset}::date`);
          params.push(startDate);
          clauses.push(`${saleAlias}.sale_date::date <= $${params.length + 1 + paramOffset}::date`);
          params.push(endDate);
        } else {
          clauses.push(
            `${saleAlias}.sale_date >= CURRENT_DATE - $${params.length + 1 + paramOffset} * INTERVAL '1 day'`,
          );
          params.push(periodDays);
        }
      }

      if (includeService && normalizedServiceName) {
        const expr = normalizeServiceSql(
          `COALESCE(${serviceAlias}.name, ${saleItemAlias}.product_name)`,
        );
        clauses.push(`${expr} = $${params.length + 1 + paramOffset}`);
        params.push(normalizedServiceName);
      }

      const clause = clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
      return { clause, params };
    };

    const normalizedExpr = normalizeServiceSql(
      "COALESCE(serv.name, si.product_name)",
    );

    const periodTotalsFilters = buildFilters({
      includePeriod: true,
      includeService: true,
    });

    const periodTotalsQuery = `
      SELECT
        COUNT(DISTINCT s.id) AS sales_count,
        COALESCE(SUM(s.total), 0)::numeric AS total_value,
        COALESCE(SUM(si.quantity), 0)::int AS total_units,
        COALESCE(SUM(
          CASE WHEN ${normalizedExpr} LIKE 'reclam%' THEN si.quantity ELSE 0 END
        ), 0)::int AS reclamacoes_units,
        COALESCE(SUM(
          CASE WHEN ${normalizedExpr} LIKE 'atras%' THEN si.quantity ELSE 0 END
        ), 0)::int AS atrasos_units
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        ${periodTotalsFilters.clause}
    `;

    const pendingFilters = buildFilters({
      includePeriod: true,
      includeService: true,
    });

    const pendingQuery = `
      SELECT COUNT(*)::int AS count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status = 'aberta'
        ${pendingFilters.clause}
    `;

    const packagesFilters = buildFilters({
      includePeriod: false,
      includeService: false,
      saleAlias: "sp",
      applyUserFilter: true,
    });

    const packagesQuery = `
      SELECT COUNT(*)::int AS count
      FROM client_packages cp
      JOIN sales sp ON cp.sale_id = sp.id
      WHERE cp.is_active = true
        AND cp.available_quantity > 0
        AND (cp.expires_at IS NULL OR cp.expires_at >= CURRENT_DATE)
        ${packagesFilters.clause}
    `;

    const topServicesFilters = buildFilters({
      includePeriod: true,
      includeService: true,
    });

    const topServicesQuery = `
      SELECT
        COALESCE(
          NULLIF(TRIM(serv.name), ''),
          NULLIF(TRIM(si.product_name), ''),
          'Nao informado'
        ) AS name,
        COUNT(DISTINCT s.id) AS sale_count,
        COALESCE(SUM(si.total), 0)::numeric AS total_revenue
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        ${topServicesFilters.clause}
      GROUP BY 1
      ORDER BY sale_count DESC, total_revenue DESC
      LIMIT 5
    `;

    const recentSalesFilters = buildFilters({
      includePeriod: true,
      includeService: true,
    });

    const recentSalesQuery = `
      SELECT
        s.id,
        COALESCE(c.name, 'Cliente sem nome') AS client_name,
        s.total,
        s.status,
        s.sale_date
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        ${recentSalesFilters.clause}
      GROUP BY s.id, c.name, s.total, s.status, s.sale_date
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT 5
    `;

    const servicePerformanceFilters = buildFilters({
      includePeriod: true,
      includeService: true,
    });

    const servicePerformanceQuery = `
      SELECT
        COALESCE(
          NULLIF(TRIM(serv.name), ''),
          NULLIF(TRIM(si.product_name), ''),
          'Nao informado'
        ) AS service_name,
        COALESCE(SUM(si.total), 0)::numeric AS total_value,
        COALESCE(SUM(si.quantity), 0)::int AS total_quantity,
        COUNT(DISTINCT s.id) AS sale_count
      FROM sale_items si
      LEFT JOIN sales s ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        ${servicePerformanceFilters.clause}
      GROUP BY 1
      ORDER BY total_value DESC
      LIMIT 6
    `;

    const clientSpendingFilters = buildFilters({
      includePeriod: true,
      includeService: true,
    });

    const clientSpendingQuery = `
      SELECT
        COALESCE(c.name, 'Cliente sem nome') AS client_name,
        COALESCE(SUM(si.quantity), 0)::int AS total_quantity,
        COALESCE(SUM(si.total), 0)::numeric AS total_value
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        ${clientSpendingFilters.clause}
      GROUP BY c.id, c.name
      ORDER BY total_value DESC
      LIMIT 6
    `;

    const clientFrequencyFilters = buildFilters({
      includePeriod: true,
      includeService: true,
    });

    const clientFrequencyQuery = `
      SELECT
        COALESCE(c.name, 'Cliente sem nome') AS client_name,
        COUNT(DISTINCT s.id)::int AS sales_count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        ${clientFrequencyFilters.clause}
        AND NOT EXISTS (
          SELECT 1 FROM client_packages cp WHERE cp.sale_id = s.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM package_consumptions pc WHERE pc.sale_id = s.id
        )
      GROUP BY c.id, c.name
      ORDER BY sales_count DESC
      LIMIT 6
    `;

    const attendantServiceFilters = buildFilters({
      includePeriod: true,
      includeService: true,
      applyUserFilter: false,
      saleAlias: "s",
      saleItemAlias: "si",
      serviceAlias: "serv",
      paramOffset: 1,
    });

    const attendantPerformanceQuery = `
      SELECT
        COALESCE(
          NULLIF(TRIM(serv.name), ''),
          NULLIF(TRIM(si.product_name), ''),
          'Nao informado'
        ) AS service_name,
        COALESCE(SUM(si.total), 0)::numeric AS total_value,
        COALESCE(SUM(si.quantity), 0)::int AS total_quantity,
        COUNT(DISTINCT s.id) AS sale_count
      FROM sale_items si
      LEFT JOIN sales s ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND s.attendant_id = $1
        ${attendantServiceFilters.clause}
      GROUP BY 1
      ORDER BY total_value DESC
    `;

    const [
      periodTotalsResult,
      pendingResult,
      packagesResult,
      topServicesResult,
      recentSalesResult,
      servicePerformanceResult,
      clientSpendingResult,
      clientFrequencyResult,
      attendantPerformanceResult,
    ] = await Promise.all([
      query(periodTotalsQuery, periodTotalsFilters.params),
      query(pendingQuery, pendingFilters.params),
      query(packagesQuery, packagesFilters.params),
      query(topServicesQuery, topServicesFilters.params),
      query(recentSalesQuery, recentSalesFilters.params),
      query(servicePerformanceQuery, servicePerformanceFilters.params),
      query(clientSpendingQuery, clientSpendingFilters.params),
      query(clientFrequencyQuery, clientFrequencyFilters.params),
      query(attendantPerformanceQuery, [
        user.id,
        ...attendantServiceFilters.params,
      ]),
    ]);

    const pendingSales = Number(pendingResult.rows[0]?.count ?? 0);
    const activePackages = Number(packagesResult.rows[0]?.count ?? 0);

    const topServices = topServicesResult.rows.map((row) => ({
      name: row.name,
      count: Number(row.sale_count ?? 0),
      total: Number(row.total_revenue ?? 0),
    }));

    const recentSales = recentSalesResult.rows.map((row) => ({
      id: row.id,
      clientName: row.client_name,
      total: Number(row.total ?? 0),
      status: row.status,
      saleDate: row.sale_date,
    }));

    const servicePerformance = servicePerformanceResult.rows.map((row) => ({
      name: row.service_name,
      totalValue: Number(row.total_value ?? 0),
      totalQuantity: Number(row.total_quantity ?? 0),
      totalSales: Number(row.sale_count ?? 0),
    }));

    const attendantServices = attendantPerformanceResult.rows.map((row) => ({
      name: row.service_name,
      totalValue: Number(row.total_value ?? 0),
      totalQuantity: Number(row.total_quantity ?? 0),
      totalSales: Number(row.sale_count ?? 0),
    }));

    const attendantTotals = attendantServices.reduce(
      (acc, item) => {
        acc.totalValue += item.totalValue;
        acc.totalQuantity += item.totalQuantity;
        acc.totalSales += item.totalSales;
        return acc;
      },
      { totalValue: 0, totalQuantity: 0, totalSales: 0 },
    );

    const clientSpending = clientSpendingResult.rows.map((row) => ({
      clientName: row.client_name,
      totalValue: Number(row.total_value ?? 0),
      totalQuantity: Number(row.total_quantity ?? 0),
    }));

    const clientFrequency = clientFrequencyResult.rows.map((row) => ({
      clientName: row.client_name,
      salesCount: Number(row.sales_count ?? 0),
    }));

    const attendantName =
      `${user.first_name} ${user.last_name}`.trim() || user.email;

    const periodTotalsRow = periodTotalsResult.rows[0] ?? {
      sales_count: 0,
      total_value: 0,
      total_units: 0,
      reclamacoes_units: 0,
      atrasos_units: 0,
    };

    return NextResponse.json({
      analysisPeriodDays,
      analysisRange:
        useCustomRange && startDate && endDate ? { startDate, endDate } : null,
      periodTotals: {
        salesCount: Number(periodTotalsRow.sales_count ?? 0),
        totalValue: Number(periodTotalsRow.total_value ?? 0),
        totalUnits: Number(periodTotalsRow.total_units ?? 0),
        reclamacoesUnits: Number(periodTotalsRow.reclamacoes_units ?? 0),
        atrasosUnits: Number(periodTotalsRow.atrasos_units ?? 0),
      },
      activePackages,
      pendingSales,
      topServices,
      recentSales,
      servicePerformance,
      attendantPerformance: {
        attendantName,
        totalValue: attendantTotals.totalValue,
        totalQuantity: attendantTotals.totalQuantity,
        totalSales: attendantTotals.totalSales,
        services: attendantServices,
      },
      clientSpending,
      clientFrequency,
    });
  } catch (error) {
    console.error("Erro ao buscar metricas do dashboard:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao buscar metricas";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
