"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Toast";
import Card from "@/components/Card";

type PeriodTotals = {
  salesCount: number;
  totalValue: number;
  totalUnits: number;
  reclamacoesUnits: number;
  atrasosUnits: number;
};

type DashboardMetrics = {
  analysisPeriodDays: number;
  analysisRange: {
    startDate: string;
    endDate: string;
  } | null;
  periodTotals: PeriodTotals;
  activePackages: number;
  pendingSales: number;
  topServices: Array<{
    name: string;
    count: number;
    total: number;
  }>;
  recentSales: Array<{
    id: string;
    clientName: string;
    total: number;
    status: string;
    saleDate: string;
  }>;
  servicePerformance: Array<{
    name: string;
    totalValue: number;
    totalQuantity: number;
    totalSales: number;
  }>;
  attendantPerformance: {
    attendantName: string;
    totalValue: number;
    totalQuantity: number;
    totalSales: number;
    services: Array<{
      name: string;
      totalValue: number;
      totalQuantity: number;
      totalSales: number;
    }>;
  };
  clientSpending: Array<{
    clientName: string;
    totalValue: number;
    totalQuantity: number;
  }>;
  clientFrequency: Array<{
    clientName: string;
    salesCount: number;
  }>;
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
};

type ServiceOption = {
  id: string;
  name: string;
  label: string;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatDate = (dateString: string) => {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  const date = isDateOnly
    ? new Date(`${dateString}T00:00:00`)
    : new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatServiceLabel = (value: string) => {
  if (!value) return "—";
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("reclamacao")) {
    return "Reclamações";
  }
  if (normalized.includes("atraso")) {
    return "Atrasos";
  }
  return value;
};

export default function Dashboard() {
  const { error } = useToast();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisPeriod, setAnalysisPeriod] = useState("30");
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [customRangeDraft, setCustomRangeDraft] = useState({
    start: "",
    end: "",
  });
  const [appliedCustomRange, setAppliedCustomRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const periodOptions = [
    { label: "7 dias", value: "7" },
    { label: "30 dias", value: "30" },
    { label: "90 dias", value: "90" },
    { label: "180 dias", value: "180" },
  ];

  // Carregar usuário atual
  const fetchCurrentUser = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      error("Sessão expirada. Faça login novamente.");
      return;
    }

    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await response.json()) as {
        services?: Array<{ id: string; name: string }>;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar o usuário");
      }

      setCurrentUser({
        id: data.user.id,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
        email: data.user.email,
        isAdmin: data.user.is_admin,
      });
    } catch (err) {
      console.error("Erro ao carregar usuário:", err);
      const message = err instanceof Error ? err.message : "Erro ao carregar usuário";
      error(message);
      setLoading(false);
    }
  }, [error]);

  const fetchServices = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/services", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar serviços");
      }

      const mapped: ServiceOption[] =
        (data.services ?? []).map((service) => ({
          id: service.id,
          name: service.name,
          label: formatServiceLabel(service.name),
        })) ?? [];

      setServices(mapped);
    } catch (err) {
      console.error("Erro ao carregar serviços:", err);
    }
  }, []);

  // Carregar métricas do dashboard
  const fetchDashboardMetrics = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessão expirada. Faça login novamente.");
      return;
    }

    if (analysisPeriod === "custom" && !appliedCustomRange) {
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (analysisPeriod === "custom" && appliedCustomRange) {
        params.set("startDate", appliedCustomRange.start);
        params.set("endDate", appliedCustomRange.end);
      } else {
        params.set("periodDays", analysisPeriod);
      }
      if (selectedService) {
        params.set("serviceName", selectedService);
      }

      const response = await fetch(`/api/dashboard/metrics?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar métricas");
      }

      setMetrics(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dashboard";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [analysisPeriod, appliedCustomRange, selectedService, error]);

  const handleSelectPeriod = (value: string) => {
    setAnalysisPeriod(value);
    if (value !== "custom") {
      setAppliedCustomRange(null);
    }
  };

  const handleApplyCustomRange = () => {
    if (!customRangeDraft.start || !customRangeDraft.end) {
      error("Preencha data inicial e final para aplicar o período personalizado.");
      return;
    }

    if (new Date(customRangeDraft.start) > new Date(customRangeDraft.end)) {
      error("A data inicial não pode ser maior que a data final.");
      return;
    }

    setAppliedCustomRange({
      start: customRangeDraft.start,
      end: customRangeDraft.end,
    });
    setAnalysisPeriod("custom");
  };

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchServices();
    }
  }, [currentUser, fetchServices]);

  useEffect(() => {
    if (currentUser) {
      fetchDashboardMetrics();
    }
  }, [currentUser, fetchDashboardMetrics]);

  const periodTotals = metrics?.periodTotals;
  const analysisRange = metrics?.analysisRange;
  const analysisPeriodDays =
    metrics?.analysisPeriodDays ??
    (analysisPeriod === "custom" && appliedCustomRange
      ? Math.floor(
          (Date.parse(appliedCustomRange.end) -
            Date.parse(appliedCustomRange.start)) /
            (1000 * 60 * 60 * 24),
        ) + 1
      : Number(analysisPeriod));
  const servicePerformanceData = (metrics?.servicePerformance ?? []).map(
    (service) => ({
      ...service,
      displayName: formatServiceLabel(service.name),
    }),
  );
  const attendantServices = (
    metrics?.attendantPerformance?.services ?? []
  ).map((service) => ({
    ...service,
    displayName: formatServiceLabel(service.name),
  }));
  const selectedServiceLabel = selectedService
    ? formatServiceLabel(selectedService)
    : "Todos os serviços";
  const periodDescription = analysisRange
    ? `${formatDate(analysisRange.startDate)} - ${formatDate(analysisRange.endDate)}`
    : `Últimos ${analysisPeriodDays} dias`;
  const clientSpendingData = metrics?.clientSpending ?? [];
  const clientFrequencyData = metrics?.clientFrequency ?? [];
  const attendantName = metrics?.attendantPerformance?.attendantName ?? "Você";

  const maxServiceQuantity =
    servicePerformanceData.length > 0
      ? Math.max(...servicePerformanceData.map((item) => item.totalQuantity || 0))
      : 1;
  const maxClientQuantity =
    clientSpendingData.length > 0
      ? Math.max(...clientSpendingData.map((item) => item.totalQuantity || 0))
      : 1;
  const maxClientValue =
    clientSpendingData.length > 0
      ? Math.max(...clientSpendingData.map((item) => item.totalValue || 0))
      : 1;
  const maxFrequency =
    clientFrequencyData.length > 0
      ? Math.max(...clientFrequencyData.map((item) => item.salesCount || 0))
      : 1;
  const renderClientSpendingChart = () => {
    if (!clientSpendingData.length) {
      return (
        <p className="text-gray-400 text-sm">
          Sem dados de clientes no período selecionado.
        </p>
      );
    }

    const axisY = 90;
    const chartWidth = 80;
    const chartHeight = 70;
    const baseX = 10;
    const slotWidth = chartWidth / clientSpendingData.length;
    const barWidth = Math.max(slotWidth - 4, 4);
    const linePoints = clientSpendingData
      .map((client, index) => {
        const x = baseX + index * slotWidth + barWidth / 2;
        const ratio = maxClientValue > 0 ? client.totalValue / maxClientValue : 0;
        const y = axisY - ratio * chartHeight;
        return `${x},${y}`;
      })
      .join(" ");

    return (
      <>
        <div className="relative h-64">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <line
              x1="10"
              y1="90"
              x2="90"
              y2="90"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
            <line
              x1="10"
              y1="20"
              x2="10"
              y2="90"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
            {clientSpendingData.map((client, index) => {
              const barHeight =
                maxClientQuantity > 0
                  ? (client.totalQuantity / maxClientQuantity) * chartHeight
                  : 0;
              const x =
                baseX + index * slotWidth + (slotWidth - barWidth) / 2;
              const y = axisY - barHeight;
              return (
                <rect
                  key={`spending-bar-${client.clientName}-${index}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={1.5}
                  fill="rgba(59,130,246,0.65)"
                />
              );
            })}
            {linePoints && (
              <polyline
                fill="none"
                stroke="rgb(16,185,129)"
                strokeWidth={1.5}
                points={linePoints}
              />
            )}
            {clientSpendingData.map((client, index) => {
              const ratio = maxClientValue > 0 ? client.totalValue / maxClientValue : 0;
              const x = baseX + index * slotWidth + barWidth / 2;
              const y = axisY - ratio * chartHeight;
              return (
                <circle
                  key={`spending-point-${client.clientName}-${index}`}
                  cx={x}
                  cy={y}
                  r={1.5}
                  fill="rgb(16,185,129)"
                  stroke="white"
                  strokeWidth={0.4}
                />
              );
            })}
          </svg>
        </div>
        <div className="mt-4 space-y-2 text-xs text-gray-400">
          {clientSpendingData.map((client, index) => (
            <div
              key={`spending-legend-${client.clientName}-${index}`}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-white truncate">{client.clientName}</span>
              <span>
                {client.totalQuantity} itens · {formatCurrency(client.totalValue)}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderClientFrequencyChart = () => {
    if (!clientFrequencyData.length) {
      return (
        <p className="text-gray-400 text-sm">
          Sem vendas comuns no período selecionado.
        </p>
      );
    }

    const axisY = 90;
    const chartWidth = 80;
    const chartHeight = 70;
    const baseX = 10;
    const slotWidth = chartWidth / clientFrequencyData.length;
    const barWidth = Math.max(slotWidth - 6, 4);

    return (
      <>
        <div className="relative h-64">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <line
              x1="10"
              y1="90"
              x2="90"
              y2="90"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
            <line
              x1="10"
              y1="20"
              x2="10"
              y2="90"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
            {clientFrequencyData.map((client, index) => {
              const barHeight =
                maxFrequency > 0
                  ? (client.salesCount / maxFrequency) * chartHeight
                  : 0;
              const x =
                baseX + index * slotWidth + (slotWidth - barWidth) / 2;
              const y = axisY - barHeight;
              return (
                <rect
                  key={`frequency-bar-${client.clientName}-${index}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={1.5}
                  fill="rgba(168,85,247,0.7)"
                />
              );
            })}
          </svg>
        </div>
        <div className="mt-4 space-y-2 text-xs text-gray-400">
          {clientFrequencyData.map((client, index) => (
            <div
              key={`frequency-legend-${client.clientName}-${index}`}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-white truncate">{client.clientName}</span>
              <span>{client.salesCount} vendas</span>
            </div>
          ))}
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-5 text-white">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-transparent blur-2xl" />
            <div className="absolute inset-2 rounded-full border border-white/15" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-400 border-r-blue-400 animate-spin" />
            <div className="absolute inset-6 rounded-full bg-white/10 backdrop-blur" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold">Preparando seu dashboard</p>
            <p className="text-sm text-gray-300">Carregando métricas e gráficos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-gray-400">Bem-vindo(a)</p>
            <h1 className="text-3xl font-bold text-white">
              Olá, {currentUser?.firstName}! 👋
            </h1>
            <p className="text-sm text-gray-400">
                {analysisRange
                  ? `Período: ${formatDate(analysisRange.startDate)} - ${formatDate(
                      analysisRange.endDate,
                    )}`
                  : `Últimos ${analysisPeriodDays} dias`}{" "}
                · Serviço:{" "}
                <span className="font-semibold text-white">
                  {selectedServiceLabel}
                </span>
              </p>
            </div>

          {/* Filtros Compactos */}
          <div className="space-y-3">
            {/* Linha Principal - Sempre Visível */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Períodos Rápidos */}
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectPeriod(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    analysisPeriod === option.value
                      ? "bg-white text-black"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {option.label}
                </button>
              ))}

              {/* Separador */}
              <div className="h-6 w-px bg-white/20"></div>

              {/* Filtro de Serviço */}
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none min-w-[180px]"
              >
                <option value="">Todos os serviços</option>
                {services.map((service) => (
                  <option key={service.id} value={service.name}>
                    {service.label}
                  </option>
                ))}
              </select>

              {/* Separador */}
              <div className="h-6 w-px bg-white/20"></div>

              {/* Toggle Filtros Avançados */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-white/20"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {showFilters ? 'Ocultar período personalizado' : 'Período personalizado'}
              </button>
            </div>

            {/* Filtros Avançados - Expansível */}
            {showFilters && (
              <div className="flex flex-wrap items-center gap-2 pl-4 border-l-2 border-white/20 animate-in slide-in-from-top-2">
                <span className="text-xs text-gray-400">Datas personalizadas:</span>
                <input
                  type="date"
                  value={customRangeDraft.start}
                  onChange={(e) =>
                    setCustomRangeDraft((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                    placeholder="Data inicial"
                    className="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-white focus:outline-none"
                  />
                  <span className="text-xs text-gray-500">até</span>
                  <input
                    type="date"
                    value={customRangeDraft.end}
                    onChange={(e) =>
                      setCustomRangeDraft((prev) => ({
                        ...prev,
                        end: e.target.value,
                      }))
                    }
                    placeholder="Data final"
                    className="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-white focus:outline-none"
                />
                <button
                  onClick={handleApplyCustomRange}
                  disabled={!customRangeDraft.start || !customRangeDraft.end}
                  className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-1.5 text-xs font-medium text-white transition-all hover:from-blue-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:from-gray-500 disabled:to-gray-600"
                >
                  Aplicar período
                </button>
                {appliedCustomRange && (
                  <button
                    onClick={() => {
                      setAppliedCustomRange(null);
                      setCustomRangeDraft({ start: '', end: '' });
                      setAnalysisPeriod('30');
                    }}
                    className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition-all hover:bg-red-500/30"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cards de Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Vendas no período</p>
                <p className="text-3xl font-bold text-white">
                  {periodTotals?.salesCount ?? 0}
                </p>
                <p className="text-sm text-blue-300 mt-1">{periodDescription}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-blue-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19h16" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 19V9" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 19V5" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 19v-7" />
                </svg>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">
                  Faturamento no período
                </p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency(periodTotals?.totalValue ?? 0)}
                </p>
                <p className="text-sm text-green-300 mt-1">{periodDescription}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-green-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 8h16v8H4z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v8" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h8" />
                </svg>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">
                  Unidades — Reclamações
                </p>
                <p className="text-3xl font-bold text-white">
                  {periodTotals?.reclamacoesUnits ?? 0}
                </p>
                <p className="text-sm text-purple-300 mt-1">
                  {periodTotals ? `${periodTotals.totalUnits} unidades totais` : "Sem dados"}
                </p>
              </div>
              <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-purple-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 7l9 5 9-5"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 7v10l9 5 9-5V7"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 12v10" />
                </svg>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">
                  Unidades — Atrasos
                </p>
                <p className="text-3xl font-bold text-white">
                  {periodTotals?.atrasosUnits ?? 0}
                </p>
                <p className="text-sm text-orange-300 mt-1">{periodDescription}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-orange-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-orange-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M12 8v4l2.5 2.5"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M12 4a8 8 0 100 16 8 8 0 000-16z"
                  />
                </svg>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Pacotes ativos</p>
                <p className="text-3xl font-bold text-white">
                  {metrics?.activePackages ?? 0}
                </p>
                <p className="text-sm text-gray-400 mt-1">com saldo disponível</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-white/80"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 7l9 5 9-5"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 7v10l9 5 9-5V7"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 12v10" />
                </svg>
              </div>
            </div>
          </Card>
          <Card className="bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Vendas abertas</p>
                <p className="text-3xl font-bold text-white">
                  {metrics?.pendingSales ?? 0}
                </p>
                <p className="text-sm text-gray-400 mt-1">aguardando confirmação</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-white/80"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M12 8v4l2.5 2.5"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M12 4a8 8 0 100 16 8 8 0 000-16z"
                  />
                </svg>
              </div>
            </div>
          </Card>
        </div>

        {/* Performance Avançada */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Performance por Serviço
                </h2>
                <p className="text-xs text-gray-400">
                  Últimos {analysisPeriodDays} dias
                </p>
              </div>
            </div>
            {servicePerformanceData.length > 0 ? (
              <div className="space-y-4">
                {servicePerformanceData.map((service, index) => {
                  const rawProgress =
                    maxServiceQuantity > 0
                      ? (service.totalQuantity / maxServiceQuantity) * 100
                      : 0;
                  const progress =
                    service.totalQuantity > 0
                      ? Math.min(Math.max(rawProgress, 6), 100)
                      : 0;
                  return (
                    <div key={`${service.displayName}-${index}`} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{service.displayName}</p>
                          <p className="text-xs text-gray-400">
                            {service.totalSales} vendas · {service.totalQuantity} unidades
                          </p>
                        </div>
                        <p className="text-sm text-gray-200">
                          {formatCurrency(service.totalValue)}
                        </p>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-lime-500"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                Nenhum dado no período selecionado.
              </p>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Meu Desempenho
                </h2>
                <p className="text-xs text-gray-400">
                  {attendantName} · Últimos {analysisPeriodDays} dias
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">Faturamento</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {formatCurrency(metrics?.attendantPerformance?.totalValue || 0)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">Qtde de vendas</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {metrics?.attendantPerformance?.totalSales || 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">
                  Unidades vendidas
                </p>
                <p className="text-2xl font-bold text-white mt-2">
                  {metrics?.attendantPerformance?.totalQuantity || 0}
                </p>
              </div>
            </div>
            {attendantServices.length > 0 ? (
              <div className="space-y-3">
                {attendantServices.map((service, index) => (
                  <div
                    key={`${service.displayName}-${index}`}
                    className="flex items-center justify-between text-sm text-gray-300 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-white font-medium">{service.displayName}</p>
                      <p className="text-xs text-gray-500">
                        {service.totalSales} vendas · {service.totalQuantity} unidades
                      </p>
                    </div>
                    <p className="text-sm text-white">
                      {formatCurrency(service.totalValue)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                Comece registrando novas vendas para ver seus números aqui.
              </p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Serviços */}
          <Card>
            <h2 className="text-xl font-semibold text-white mb-4">
              Serviços Mais Vendidos
            </h2>
            {metrics?.topServices && metrics.topServices.length > 0 ? (
              <div className="space-y-3">
                {metrics.topServices.map((service, index) => {
                  const displayName = formatServiceLabel(service.name);
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-white font-medium">{displayName}</p>
                          <p className="text-xs text-gray-400">{service.count} vendas</p>
                        </div>
                      </div>
                      <p className="text-green-400 font-semibold">
                        {formatCurrency(service.total)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Nenhum serviço vendido ainda
              </p>
            )}
          </Card>

          {/* Vendas Recentes */}
          <Card>
            <h2 className="text-xl font-semibold text-white mb-4">
              Vendas Recentes
            </h2>
            {metrics?.recentSales && metrics.recentSales.length > 0 ? (
              <div className="space-y-3">
                {metrics.recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div>
                      <p className="text-white font-medium">{sale.clientName}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(sale.saleDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">
                        {formatCurrency(sale.total)}
                      </p>
                      <p
                        className={`text-xs ${
                          sale.status === "confirmada"
                            ? "text-green-400"
                            : sale.status === "aberta"
                            ? "text-blue-400"
                            : "text-red-400"
                        }`}
                      >
                        {sale.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Nenhuma venda recente
              </p>
            )}
          </Card>
        </div>

        {/* Radar de Clientes */}
        <Card className="mt-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">Radar de Clientes</h2>
            <p className="text-sm text-gray-400">
              Quantidade x Faturamento · últimos {analysisPeriodDays} dias
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <p className="text-sm text-gray-300 font-semibold mb-2">
                Quantidade (barras) x Valor gasto (linha)
              </p>
              {renderClientSpendingChart()}
            </div>
            <div>
              <p className="text-sm text-gray-300 font-semibold mb-2">
                Frequência de compras por cliente (vendas comuns)
              </p>
              {renderClientFrequencyChart()}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
