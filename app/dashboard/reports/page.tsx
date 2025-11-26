"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/components/Toast";
import Card from "@/components/Card";
import Button from "@/components/Button";

type SaleStatus = "aberta" | "confirmada" | "cancelada";
type PaymentMethod = "dinheiro" | "debito" | "credito" | "pix" | "boleto";

type Sale = {
  id: string;
  saleDate: string;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  totalDiscount: number;
  total: number;
  observations: string | null;
  clientId: string;
  clientName: string;
  attendantId: string;
  attendantName: string;
  firstItem: {
    name: string;
    quantity: number;
    unitPrice: number;
    saleType: string | null;
  } | null;
};

type Metrics = {
  totalSales: number;
  totalValue: number;
  salesByStatus: {
    aberta: number;
    confirmada: number;
    cancelada: number;
  };
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
};

type Service = {
  id: string;
  name: string;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("pt-BR");
};

const statusColors = {
  aberta: { bg: "bg-blue-500/20", text: "text-blue-200", border: "border-blue-500/40" },
  confirmada: { bg: "bg-green-500/20", text: "text-green-200", border: "border-green-500/40" },
  cancelada: { bg: "bg-red-500/20", text: "text-red-200", border: "border-red-500/40" },
};

const statusLabels = {
  aberta: "Aberta",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

export default function ReportsPage() {
  const { error } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [attendants, setAttendants] = useState<User[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedAttendant, setSelectedAttendant] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [selectedSaleType, setSelectedSaleType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  // Carregar usuário atual
  const fetchCurrentUser = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUser({
          id: data.user.id,
          firstName: data.user.first_name,
          lastName: data.user.last_name,
          email: data.user.email,
          isAdmin: data.user.is_admin,
        });
      }
    } catch (err) {
      console.error("Erro ao carregar usuário:", err);
    }
  }, []);

  // Carregar atendentes (apenas para admin)
  const fetchAttendants = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token || !currentUser?.isAdmin) return;

    try {
      const response = await fetch("/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAttendants(
          data.users.map((u: any) => ({
            id: u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            email: u.email,
            isAdmin: u.is_admin,
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar atendentes:", err);
    }
  }, [currentUser]);

  // Carregar serviços
  const fetchServices = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch("/api/services", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setServices(
          data.services.map((s: any) => ({
            id: s.id,
            name: s.name,
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar serviços:", err);
    }
  }, []);

  // Carregar relatório de vendas
  const fetchSalesReport = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessão expirada. Faça login novamente.");
      return;
    }

    setLoading(true);

    try {
      // Construir query string
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (selectedAttendant) params.append("attendantId", selectedAttendant);
      if (selectedService) params.append("serviceId", selectedService);
      if (selectedSaleType) params.append("saleType", selectedSaleType);
      if (selectedStatus) params.append("status", selectedStatus);

      const response = await fetch(`/api/reports/sales?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar relatório");
      }

      setSales(data.sales);
      setMetrics(data.metrics);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar relatório";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedAttendant, selectedService, selectedSaleType, selectedStatus, error]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchAttendants();
      fetchServices();
      fetchSalesReport();
    }
  }, [currentUser, fetchAttendants, fetchServices, fetchSalesReport]);

  const handleClearFilters = () => {
    setStartDate("");
    setEndDate("");
    setSelectedAttendant("");
    setSelectedService("");
    setSelectedSaleType("");
    setSelectedStatus("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Relatórios de Vendas</h1>
          <p className="text-gray-400">
            {currentUser?.isAdmin
              ? "Visão geral de todas as vendas da equipe"
              : "Visão geral das suas vendas"}
          </p>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Data Inicial */}
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Data Inicial
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              />
            </div>

            {/* Data Final */}
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Data Final
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              />
            </div>

            {/* Atendente (apenas admin) */}
            {currentUser?.isAdmin && (
              <div>
                <label className="block text-xs uppercase text-gray-400 mb-2">
                  Atendente
                </label>
                <select
                  value={selectedAttendant}
                  onChange={(e) => setSelectedAttendant(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
                >
                  <option value="">Todos</option>
                  {attendants.map((att) => (
                    <option key={att.id} value={att.id}>
                      {att.firstName} {att.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Serviço */}
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Serviço
              </label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                <option value="">Todos</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de Venda */}
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Tipo de Venda
              </label>
              <select
                value={selectedSaleType}
                onChange={(e) => setSelectedSaleType(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                <option value="">Todos</option>
                <option value="01">01 - Comum</option>
                <option value="02">02 - Venda de Pacote</option>
                <option value="03">03 - Consumo de Pacote</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                <option value="">Todos</option>
                <option value="aberta">Aberta</option>
                <option value="confirmada">Confirmada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>

            {/* Botões */}
            <div className="flex items-end gap-2 col-span-full md:col-span-2">
              <Button onClick={fetchSalesReport} disabled={loading}>
                {loading ? "Carregando..." : "Buscar"}
              </Button>
              <Button onClick={handleClearFilters} variant="secondary">
                Limpar Filtros
              </Button>
            </div>
          </div>
        </Card>

        {/* Mini Dashboards - Métricas */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Total de Vendas */}
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Total de Vendas</p>
                  <p className="text-3xl font-bold text-white">{metrics.totalSales}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
              </div>
            </Card>

            {/* Valor Total */}
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Valor Total</p>
                  <p className="text-3xl font-bold text-white">
                    {formatCurrency(metrics.totalValue)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <span className="text-2xl">💰</span>
                </div>
              </div>
            </Card>

            {/* Vendas Confirmadas */}
            <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Confirmadas</p>
                  <p className="text-3xl font-bold text-white">{metrics.salesByStatus.confirmada}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
              </div>
            </Card>

            {/* Vendas Abertas */}
            <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Abertas</p>
                  <p className="text-3xl font-bold text-white">{metrics.salesByStatus.aberta}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <span className="text-2xl">⏳</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Lista de Vendas */}
        <Card>
          <h2 className="text-xl font-semibold text-white mb-4">
            Vendas Encontradas ({sales.length})
          </h2>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
              <p className="text-gray-400 mt-4">Carregando vendas...</p>
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Nenhuma venda encontrada com os filtros selecionados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs uppercase text-gray-400 pb-3 px-2">Data</th>
                    <th className="text-left text-xs uppercase text-gray-400 pb-3 px-2">Cliente</th>
                    <th className="text-left text-xs uppercase text-gray-400 pb-3 px-2">Atendente</th>
                    <th className="text-left text-xs uppercase text-gray-400 pb-3 px-2">Serviço</th>
                    <th className="text-right text-xs uppercase text-gray-400 pb-3 px-2">Qtd</th>
                    <th className="text-right text-xs uppercase text-gray-400 pb-3 px-2">Total</th>
                    <th className="text-center text-xs uppercase text-gray-400 pb-3 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-2 text-sm text-gray-300">
                        {formatDate(sale.saleDate)}
                      </td>
                      <td className="py-3 px-2 text-sm text-white">
                        {sale.clientName}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-300">
                        {sale.attendantName}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-300">
                        {sale.firstItem?.name || "-"}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-300 text-right">
                        {sale.firstItem?.quantity || "-"}
                      </td>
                      <td className="py-3 px-2 text-sm font-semibold text-white text-right">
                        {formatCurrency(sale.total)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            statusColors[sale.status].bg
                          } ${statusColors[sale.status].text} border ${
                            statusColors[sale.status].border
                          }`}
                        >
                          {statusLabels[sale.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
