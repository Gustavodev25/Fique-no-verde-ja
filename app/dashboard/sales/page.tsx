"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

type SaleStatus = "aberta" | "confirmada" | "cancelada";
type DiscountType = "percentage" | "fixed";
type PaymentMethod = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "boleto";

type SaleItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType | null;
  discountValue: number;
  subtotal: number;
  discountAmount: number;
  total: number;
};

type ClientPackage = {
  id: string;
  clientId: string;
  clientName: string;
  serviceId: string;
  serviceName: string;
  availableQuantity: number;
  unitPrice: number;
};

type Sale = {
  id: string;
  clientName: string;
  attendantName: string;
  saleDate: string;
  observations: string | null;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  generalDiscountType: DiscountType;
  generalDiscountValue: number;
  subtotal: number;
  total: number;
  items: SaleItem[];
  createdAt: string;
  updatedAt: string;
};

type Client = {
  id: string;
  name: string;
};

type Service = {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  priceRanges: Array<{
    id: string;
    saleType: "01" | "02";
    minQuantity: number;
    maxQuantity: number | null;
    unitPrice: number;
  }>;
};

const initialForm = {
  clientId: "",
  serviceId: "",
  saleType: "01" as "01" | "02" | "03",
  quantity: 1,
  discountType: "percentage" as DiscountType,
  discountValue: 0,
  observations: "",
  paymentMethod: "dinheiro" as PaymentMethod,
  packageId: "", // Usado quando saleType = "03"
};

const ITEMS_PER_PAGE = 7;

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

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  boleto: "Boleto",
};

export default function SalesPage() {
  const { success, error } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clientPackages, setClientPackages] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Sale | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [processing, setProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const totalSalesCopy = useMemo(() => {
    if (sales.length === 0) {
      return "Nenhuma venda cadastrada ainda";
    }

    return `${sales.length} ${
      sales.length === 1 ? "venda encontrada" : "vendas encontradas"
    }`;
  }, [sales.length]);

  const totalPages = Math.ceil(sales.length / ITEMS_PER_PAGE);

  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sales.slice(startIndex, endIndex);
  }, [sales, currentPage]);

  const fetchSales = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/sales", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel carregar as vendas");
      }

      setSales(data.sales || []);
      setCurrentPage(1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar vendas";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  const fetchClients = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/admin/clients", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setClients(
          data.clients.map((c: any) => ({ id: c.id, name: c.name }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    }
  }, []);

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

      if (response.ok) {
        setServices(
          data.services.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            basePrice: s.basePrice,
            priceRanges: s.priceRanges || [],
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar servicos:", err);
    }
  }, []);

  const fetchClientPackages = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/packages", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setClientPackages(
          data.packages.map((p: any) => ({
            id: p.id,
            clientId: p.clientId,
            clientName: p.clientName,
            serviceId: p.serviceId,
            serviceName: p.serviceName,
            availableQuantity: p.availableQuantity,
            unitPrice: p.unitPrice,
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar pacotes:", err);
    }
  }, []);

  useEffect(() => {
    fetchSales();
    fetchClients();
    fetchServices();
    fetchClientPackages();
  }, [fetchSales, fetchClients, fetchServices, fetchClientPackages]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const openModal = () => {
    setFormData(initialForm);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(initialForm);
  };

  const selectedService = useMemo(() => {
    return services.find((s) => s.id === formData.serviceId);
  }, [services, formData.serviceId]);

  // Filtrar clientes que possuem pacotes (para tipo 03)
  const clientsWithPackages = useMemo(() => {
    if (formData.saleType !== "03") return [];

    // Obter IDs únicos de clientes que possuem pacotes
    const clientIdsWithPackages = new Set(
      clientPackages
        .filter((pkg) => pkg.availableQuantity > 0)
        .map((pkg) => pkg.clientId)
    );

    // Retornar apenas clientes que têm pacotes
    return clients.filter((client) => clientIdsWithPackages.has(client.id));
  }, [formData.saleType, clientPackages, clients]);

  // Filtrar pacotes do cliente selecionado (para tipo 03)
  const availablePackages = useMemo(() => {
    if (formData.saleType !== "03" || !formData.clientId) return [];

    return clientPackages.filter((pkg) => {
      return pkg.clientId === formData.clientId && pkg.availableQuantity > 0;
    });
  }, [clientPackages, formData.saleType, formData.clientId]);

  // Pacote selecionado para consumo
  const selectedPackage = useMemo(() => {
    if (formData.saleType !== "03" || !formData.packageId) return null;
    return clientPackages.find((p) => p.id === formData.packageId);
  }, [clientPackages, formData.saleType, formData.packageId]);

  const calculateProgressivePrice = useCallback(
    (qty: number, serviceName: string, ranges: Array<{saleType: "01" | "02"; minQuantity: number; maxQuantity: number | null; unitPrice: number}>): number => {
      const saleType = formData.saleType;
      let applicableRanges = ranges
        .filter((r) => r.saleType === saleType)
        .sort((a, b) => a.minQuantity - b.minQuantity);

      // Se não encontrou ranges para o tipo selecionado, usa tipo "01" como fallback
      if (applicableRanges.length === 0) {
        applicableRanges = ranges
          .filter((r) => r.saleType === "01")
          .sort((a, b) => a.minQuantity - b.minQuantity);
      }

      if (applicableRanges.length === 0) {
        return 0;
      }

      // Para "Reclamação", usar cálculo progressivo (como IR)
      const isReclamacao = serviceName.toLowerCase().includes("reclamacao");

      if (isReclamacao) {
        // Fórmula simplificada:
        // Se qty <= 10: qty × 40
        // Se qty > 10: (qty - 10) × 15 + (10 × 40)
        if (qty <= 10) {
          return qty * (applicableRanges[0]?.unitPrice || 40);
        } else {
          const firstRangePrice = applicableRanges[0]?.unitPrice || 40;
          const secondRangePrice = applicableRanges[1]?.unitPrice || 15;
          return (qty - 10) * secondRangePrice + (10 * firstRangePrice);
        }
      } else {
        // Para outros serviços (como "Atraso"), usar a faixa correspondente
        const range = applicableRanges.find(
          (r) =>
            qty >= r.minQuantity &&
            (r.maxQuantity === null || qty <= r.maxQuantity)
        );

        return range ? qty * range.unitPrice : 0;
      }
    },
    [formData.saleType]
  );

  const calculateTotal = useMemo(() => {
    // Tipo 03 - Consumo de Pacote: usa preço do pacote (SEM desconto)
    if (formData.saleType === "03" && selectedPackage) {
      // Apenas preço unitário do pacote x quantidade
      // NÃO aplica desconto pois já foi pago antecipadamente
      return selectedPackage.unitPrice * formData.quantity;
    }

    // Tipo 01 e 02 - Comum e Venda de Pacote: cálculo normal COM desconto
    if (!selectedService) return 0;

    const subtotal = calculateProgressivePrice(
      formData.quantity,
      selectedService.name,
      selectedService.priceRanges
    );

    // Aplicar desconto (apenas para tipo 01 e 02)
    let discount = 0;
    if (formData.discountType === "percentage") {
      discount = subtotal * (formData.discountValue / 100);
    } else {
      discount = formData.discountValue;
    }

    return Math.max(0, subtotal - discount);
  }, [formData.saleType, formData.quantity, formData.discountType, formData.discountValue, selectedPackage, selectedService, calculateProgressivePrice]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Validações específicas por tipo
    if (formData.saleType === "03") {
      // Tipo 03 - Consumo de Pacote
      if (!formData.packageId) {
        error("Selecione um pacote para consumir");
        return;
      }

      if (!selectedPackage) {
        error("Pacote não encontrado");
        return;
      }

      if (formData.quantity > selectedPackage.availableQuantity) {
        error(
          `Quantidade solicitada (${formData.quantity}) excede o saldo disponível (${selectedPackage.availableQuantity})`
        );
        return;
      }
    } else {
      // Tipo 01 e 02 - Comum e Venda de Pacote
      if (!formData.serviceId) {
        error("Selecione um serviço");
        return;
      }

      if (!selectedService) {
        error("Serviço não encontrado");
        return;
      }
    }

    if (formData.quantity <= 0) {
      error("Quantidade deve ser maior que zero");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setSaving(true);

    try {
      let calculatedUnitPrice = 0;
      let calculatedSubtotal = 0;
      let productName = "";

      if (formData.saleType === "03") {
        // Tipo 03 - Consumo de Pacote
        calculatedUnitPrice = selectedPackage!.unitPrice;
        calculatedSubtotal = selectedPackage!.unitPrice * formData.quantity;
        productName = selectedPackage!.serviceName;
      } else {
        // Tipo 01 e 02 - Comum e Venda de Pacote
        const quantity = formData.quantity;
        const saleType = formData.saleType;
        let relevantRanges = selectedService!.priceRanges
          .filter((range) => range.saleType === saleType)
          .sort((a, b) => a.minQuantity - b.minQuantity);

        // Se não encontrou ranges para o tipo selecionado, usa tipo "01" como fallback
        if (relevantRanges.length === 0) {
          relevantRanges = selectedService!.priceRanges
            .filter((range) => range.saleType === "01")
            .sort((a, b) => a.minQuantity - b.minQuantity);
        }

        calculatedUnitPrice = selectedService!.basePrice;

        if (relevantRanges.length > 0) {
          // Usar o preço da primeira faixa aplicável
          const applicableRange = relevantRanges.find(
            (range) =>
              quantity >= range.minQuantity &&
              (range.maxQuantity === null || quantity <= range.maxQuantity)
          );
          if (applicableRange) {
            calculatedUnitPrice = applicableRange.unitPrice;
          } else {
            // Se não encontrou, usar o preço da última faixa
            calculatedUnitPrice = relevantRanges[relevantRanges.length - 1].unitPrice;
          }
        }

        // Garantir que o preço seja maior que zero
        if (calculatedUnitPrice <= 0) {
          calculatedUnitPrice = 1; // Valor padrão mínimo
        }

        calculatedSubtotal = calculateProgressivePrice(
          formData.quantity,
          selectedService!.name,
          selectedService!.priceRanges
        );

        productName = selectedService!.name;
      }

      console.log("DEBUG MODAL - Valores sendo enviados:");
      console.log("Tipo de Venda:", formData.saleType);
      console.log("Quantidade:", formData.quantity);
      console.log("Subtotal calculado:", calculatedSubtotal);
      console.log("Unit Price:", calculatedUnitPrice);

      const payload: any = {
        clientId: formData.saleType === "03" ? selectedPackage!.clientId : formData.clientId,
        observations: formData.observations,
        paymentMethod: formData.paymentMethod,
        saleType: formData.saleType,
        generalDiscountType: "percentage" as DiscountType,
        generalDiscountValue: 0,
        items: [
          {
            productId: null,
            productName: productName,
            quantity: formData.quantity,
            unitPrice: calculatedUnitPrice,
            calculatedSubtotal: calculatedSubtotal,
            // Tipo 03 (Consumo de Pacote): SEM desconto
            // Tipo 01 e 02: COM desconto
            discountType: formData.saleType === "03" ? "percentage" : formData.discountType,
            discountValue: formData.saleType === "03" ? 0 : formData.discountValue,
          },
        ],
      };

      // Adicionar dados específicos do tipo 03
      if (formData.saleType === "03") {
        payload.packageId = formData.packageId;
        payload.serviceId = selectedPackage!.serviceId;
      } else if (formData.saleType === "02") {
        payload.serviceId = formData.serviceId;
      }

      console.log("DEBUG MODAL - Payload:", JSON.stringify(payload, null, 2));

      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao criar venda");
      }

      success("Venda criada com sucesso!");
      await fetchSales();
      closeModal();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao criar venda";
      error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/sales/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ saleId: confirmTarget.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao confirmar venda");
      }

      success("Venda confirmada com sucesso!");
      setConfirmTarget(null);
      await fetchSales();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao confirmar venda";
      error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/sales/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ saleId: cancelTarget.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao cancelar venda");
      }

      success("Venda cancelada com sucesso!");
      setCancelTarget(null);
      await fetchSales();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao cancelar venda";
      error(message);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatItemDiscount = (item: SaleItem) => {
    if (!item.discountValue || item.discountValue === 0) {
      return "Sem desconto";
    }

    return item.discountType === "percentage"
      ? `${item.discountValue}%`
      : formatCurrency(item.discountValue);
  };

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">
          Gestao de vendas
        </p>
        <h1 className="text-3xl font-semibold">Registro de Vendas</h1>
        <p className="text-gray-300">
          Gerencie suas vendas, adicione produtos, aplique descontos e controle o status.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-6 py-4 border-b border-white/10">
          <p className="text-sm text-gray-300">{totalSalesCopy}</p>
          <Button size="sm" onClick={openModal} className="rounded-xl">
            Nova venda
          </Button>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-gray-300">
            Carregando vendas...
          </div>
        ) : sales.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            Ainda nao existem vendas cadastradas.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {paginatedSales.map((sale) => {
              const statusColor = statusColors[sale.status];
              return (
                <div
                  key={sale.id}
                  className="px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-lg">{sale.clientName}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-300 mt-1">
                      <span>Atendente: {sale.attendantName}</span>
                      <span>• {formatCurrency(sale.total)}</span>
                      <span>• {paymentMethodLabels[sale.paymentMethod]}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-3 py-1 rounded-full border border-white/20 text-gray-200">
                        {new Date(sale.saleDate).toLocaleDateString("pt-BR")}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full border ${statusColor.bg} ${statusColor.text} ${statusColor.border}`}
                      >
                        {statusLabels[sale.status]}
                      </span>
                    </div>

                    <div className="flex gap-2 md:ml-4">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="rounded-full px-4 py-1"
                        onClick={() => setViewingSale(sale)}
                      >
                        Ver detalhes
                      </Button>
                      {sale.status === "aberta" && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full px-4 py-1 bg-green-500/20 border-green-500/40 text-green-200 hover:bg-green-500/30"
                            onClick={() => setConfirmTarget(sale)}
                          >
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full px-4 py-1 border border-red-500/30 text-red-300 hover:bg-red-500/10"
                            onClick={() => setCancelTarget(sale)}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                      {sale.status === "confirmada" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full px-4 py-1 border border-red-500/30 text-red-300 hover:bg-red-500/10"
                          onClick={() => setCancelTarget(sale)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paginação */}
        {!loading && sales.length > ITEMS_PER_PAGE && (
          <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <p className="text-sm text-gray-400">
              Página {currentPage} de {totalPages} • Mostrando {paginatedSales.length} de {sales.length} vendas
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-white/20 text-sm text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Anterior
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      currentPage === page
                        ? "bg-orange-500/20 text-orange-200 border border-orange-500/40"
                        : "border border-white/20 text-white hover:bg-white/10"
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-white/20 text-sm text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Criar Venda */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title="Nova venda"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={closeModal}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-xl px-6"
              form="sale-form"
              disabled={saving}
            >
              {saving ? "Salvando..." : "Criar venda"}
            </Button>
          </div>
        }
      >
        <form id="sale-form" className="space-y-4" onSubmit={handleSubmit}>
          {/* Tipo de Venda - primeiro campo para adaptar o formulário */}
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Tipo de Venda
            </label>
            <select
              name="saleType"
              value={formData.saleType}
              onChange={handleChange}
              required
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
            >
              <option value="01">01 - Comum (Compra e usa na hora)</option>
              <option value="02">02 - Venda de Pacote (Cliente compra créditos)</option>
              <option value="03">03 - Consumo de Pacote (Cliente usa créditos)</option>
            </select>
          </div>

          {/* Campo Cliente - apenas para tipo 01 e 02 */}
          {formData.saleType !== "03" && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Cliente
              </label>
              <select
                name="clientId"
                value={formData.clientId}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                <option value="">Selecione o cliente</option>
                {clients && clients.length > 0 ? (
                  clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Nenhum cliente cadastrado</option>
                )}
              </select>
            </div>
          )}

          {/* Campo Serviço - apenas para tipo 01 e 02 */}
          {formData.saleType !== "03" && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Serviço
              </label>
              <select
                name="serviceId"
                value={formData.serviceId}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                <option value="">Selecione o serviço</option>
                {services && services.length > 0 ? (
                  services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Nenhum serviço cadastrado</option>
                )}
              </select>
            </div>
          )}

          {/* Campos condicionais para Consumo de Pacote (Tipo 03) */}
          {formData.saleType === "03" && (
            <>
              {/* Cliente (apenas clientes com pacotes) */}
              <div>
                <label className="block text-xs uppercase text-gray-400 mb-2">
                  Cliente (com pacotes)
                </label>
                <select
                  name="clientId"
                  value={formData.clientId}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
                >
                  <option value="">Selecione o cliente</option>
                  {clientsWithPackages.length > 0 ? (
                    clientsWithPackages.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>Nenhum cliente possui pacotes ativos</option>
                  )}
                </select>
              </div>

              {/* Pacote (aparece após selecionar cliente) */}
              {formData.clientId && (
                <div>
                  <label className="block text-xs uppercase text-gray-400 mb-2">
                    Pacote para Consumir
                  </label>
                  <select
                    name="packageId"
                    value={formData.packageId}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
                  >
                    <option value="">Selecione o pacote</option>
                    {availablePackages.length > 0 ? (
                      availablePackages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.serviceName} ({pkg.availableQuantity} disponíveis)
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        Nenhum pacote disponível para este cliente
                      </option>
                    )}
                  </select>

                  {/* Info do Pacote Selecionado */}
                  {selectedPackage && (
                    <div className="mt-3 p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-white">
                          Informações do Pacote
                        </p>
                        <p className="text-xs text-gray-400">
                          Preço unitário: <span className="text-white font-semibold">{formatCurrency(selectedPackage.unitPrice)}</span>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Saldo ANTES */}
                        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                          <p className="text-xs text-gray-400 mb-1">Saldo Atual</p>
                          <p className="text-2xl font-bold text-white">
                            {selectedPackage.availableQuantity}
                          </p>
                          <p className="text-xs text-gray-500">unidades disponíveis</p>
                        </div>

                        {/* Saldo DEPOIS */}
                        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                          <p className="text-xs text-gray-400 mb-1">Após Consumo</p>
                          <p className="text-2xl font-bold text-white">
                            {Math.max(0, selectedPackage.availableQuantity - formData.quantity)}
                          </p>
                          <p className="text-xs text-gray-500">unidades restantes</p>
                        </div>
                      </div>

                      {/* Alerta se quantidade for maior que saldo */}
                      {formData.quantity > selectedPackage.availableQuantity && (
                        <div className="mt-3 p-2 rounded-lg bg-red-500/20 border border-red-500/40">
                          <p className="text-xs text-red-300">
                            ⚠️ Quantidade solicitada ({formData.quantity}) excede o saldo disponível ({selectedPackage.availableQuantity})
                          </p>
                        </div>
                      )}

                      {/* Info de quanto vai consumir */}
                      {formData.quantity > 0 && formData.quantity <= selectedPackage.availableQuantity && (
                        <div className="mt-3 p-2 rounded-lg bg-white/10 border border-white/20">
                          <p className="text-xs text-gray-300">
                            Consumirá <span className="font-semibold text-white">{formData.quantity}</span> unidades = <span className="font-semibold text-white">{formatCurrency(selectedPackage.unitPrice * formData.quantity)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Quantidade
            </label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              min="1"
              required
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
            />
          </div>

          {/* Campo Desconto - apenas para tipo 01 e 02 (não para consumo de pacote) */}
          {formData.saleType !== "03" && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Desconto
              </label>
              <div className="grid grid-cols-3 gap-3">
                <select
                  name="discountType"
                  value={formData.discountType}
                  onChange={handleChange}
                  className="col-span-1 rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
                >
                  <option value="percentage">%</option>
                  <option value="fixed">R$</option>
                </select>
                <input
                  type="number"
                  name="discountValue"
                  value={formData.discountValue}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="0"
                  className="col-span-2 rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Campo Forma de Pagamento - apenas para tipo 01 e 02 (não para consumo de pacote) */}
          {formData.saleType !== "03" && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Forma de Pagamento
              </label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                {Object.entries(paymentMethodLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Observações (opcional)
            </label>
            <textarea
              name="observations"
              placeholder="Observações sobre a venda"
              value={formData.observations}
              onChange={handleChange}
              rows={3}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none resize-none"
            />
          </div>

          <div className="pt-4 border-t border-white/10 space-y-2">
            {selectedService && (
              <>
                <div className="flex justify-between text-sm text-gray-300">
                  <span>Subtotal ({formData.quantity}x {formatCurrency(selectedService.basePrice)}):</span>
                  <span>{formatCurrency(selectedService.basePrice * formData.quantity)}</span>
                </div>
                {formData.discountValue > 0 && (
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>Desconto ({formData.discountType === "percentage" ? `${formData.discountValue}%` : formatCurrency(formData.discountValue)}):</span>
                    <span className="text-red-300">
                      -{formatCurrency(
                        formData.discountType === "percentage"
                          ? (selectedService.basePrice * formData.quantity * formData.discountValue) / 100
                          : formData.discountValue
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between items-center text-lg font-semibold pt-2 border-t border-white/10">
              <span>Total da Venda:</span>
              <span className="text-green-400">{formatCurrency(calculateTotal)}</span>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal Ver Detalhes */}
      <Modal
        open={Boolean(viewingSale)}
        onClose={() => setViewingSale(null)}
        title="Detalhes da venda"
      >
        {viewingSale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Cliente</p>
                <p className="font-semibold">{viewingSale.clientName}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Atendente</p>
                <p>{viewingSale.attendantName}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Data da Venda</p>
                <p>{new Date(viewingSale.saleDate).toLocaleDateString("pt-BR")}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Status</p>
                <span
                  className={`inline-block px-3 py-1 rounded-full border text-sm ${statusColors[viewingSale.status].bg} ${statusColors[viewingSale.status].text} ${statusColors[viewingSale.status].border}`}
                >
                  {statusLabels[viewingSale.status]}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-400">Forma de Pagamento</p>
              <p>{paymentMethodLabels[viewingSale.paymentMethod]}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-400">Itens da Venda</p>
              {!viewingSale.items || viewingSale.items.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  Nenhum item cadastrado para esta venda.
                </p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {viewingSale.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-semibold text-white">{item.productName}</p>
                        <span className="text-xs text-gray-400">Qtd: {item.quantity}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm text-gray-300">
                        <div>
                          <p className="text-xs text-gray-400">Valor unitário (média)</p>
                          <p>{formatCurrency(item.total / item.quantity)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Desconto</p>
                          <p>{formatItemDiscount(item)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Total do item</span>
                        <span className="font-semibold text-white">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {viewingSale.observations && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Observações</p>
                <p className="text-gray-300">{viewingSale.observations}</p>
              </div>
            )}

            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal:</span>
                <span>{formatCurrency(viewingSale.subtotal)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <span>Total:</span>
                <span className="text-green-400">{formatCurrency(viewingSale.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Confirmar Venda */}
      <Modal
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        title="Confirmar venda"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={() => setConfirmTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="rounded-xl px-6 bg-green-500/30 border border-green-500/50 hover:bg-green-500/50"
              disabled={processing}
              onClick={handleConfirm}
            >
              {processing ? "Confirmando..." : "Confirmar"}
            </Button>
          </div>
        }
      >
        {confirmTarget && (
          <p className="text-sm text-gray-300">
            Deseja realmente confirmar a venda para{" "}
            <span className="font-semibold text-white">{confirmTarget.clientName}</span>?
            Esta acao ira congelar os precos e gerar as comissoes.
          </p>
        )}
      </Modal>

      {/* Modal Cancelar Venda */}
      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancelar venda"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={() => setCancelTarget(null)}
            >
              Voltar
            </Button>
            <Button
              size="sm"
              className="rounded-xl px-6 bg-red-500/30 border border-red-500/50 hover:bg-red-500/50"
              disabled={processing}
              onClick={handleCancel}
            >
              {processing ? "Cancelando..." : "Cancelar venda"}
            </Button>
          </div>
        }
      >
        {cancelTarget && (
          <p className="text-sm text-gray-300">
            Deseja realmente cancelar a venda para{" "}
            <span className="font-semibold text-white">{cancelTarget.clientName}</span>?
            {cancelTarget.status === "confirmada" && (
              <span className="block mt-2 text-yellow-300">
                Atenção: Esta venda já foi confirmada. O cancelamento irá estornar as comissões geradas.
              </span>
            )}
          </p>
        )}
      </Modal>
    </div>
  );
}
