"use client";

import Link from "next/link";
import { useState } from "react";
import { WebGLShader } from "@/components/webgl-shader";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";

export default function Cadastro() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });

  const [activeTab, setActiveTab] = useState<"signup" | "signin">("signup");
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const { signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signup(formData);
      toast.success("Conta criada com sucesso! Redirecionando...");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, "");

    // Limita a 11 dígitos
    const limited = numbers.slice(0, 11);

    // Formata conforme o tamanho
    if (limited.length <= 2) {
      return limited;
    } else if (limited.length <= 6) {
      return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
    } else if (limited.length <= 10) {
      return `(${limited.slice(0, 2)}) ${limited.slice(2, 6)}-${limited.slice(6)}`;
    } else {
      return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`;
    }
  };

  const formatName = (value: string) => {
    // Capitaliza primeira letra de cada palavra
    return value
      .toLowerCase()
      .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());
  };

  const formatEmail = (value: string) => {
    // Remove espaços e converte para minúsculas
    return value.replace(/\s/g, "").toLowerCase();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let formattedValue = value;

    // Aplica formatação específica para cada campo
    if (name === "phone") {
      formattedValue = formatPhone(value);
    } else if (name === "firstName" || name === "lastName") {
      formattedValue = formatName(value);
    } else if (name === "email") {
      formattedValue = formatEmail(value);
    }

    setFormData({
      ...formData,
      [name]: formattedValue,
    });
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {/* WebGL Background */}
      <WebGLShader />

      {/* Modal with Liquid Glass Effect */}
      <div className="relative z-10 w-full max-w-md">
        <div
          className="relative rounded-3xl p-8 backdrop-blur-3xl bg-white/10 border border-white/10"
          style={{
            boxShadow:
              "0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(255,255,255,0.9),inset_-3px_-3px_0.5px_-3px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_40px_rgba(255,255,255,0.08),0_0_80px_rgba(255,255,255,0.04)",
          }}
        >
          {/* Tabs */}
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => setActiveTab("signup")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all backdrop-blur-sm ${
                activeTab === "signup"
                  ? "bg-white/20 text-white border border-white/30"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              Cadastrar
            </button>
            <Link
              href="/login"
              className="px-6 py-2 rounded-full text-sm font-medium text-gray-300 hover:text-white transition-all"
            >
              Entrar
            </Link>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-semibold text-white mb-6">
            Criar uma conta
          </h2>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* First Name and Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                name="firstName"
                placeholder="Nome"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                required
              />
              <input
                type="text"
                name="lastName"
                placeholder="Sobrenome"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                required
              />
            </div>

            {/* Email */}
            <input
              type="email"
              name="email"
              placeholder="Digite seu email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
              required
            />

            {/* Phone */}
            <input
              type="tel"
              name="phone"
              placeholder="(11) 99999-9999"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
            />

            {/* Password */}
            <input
              type="password"
              name="password"
              placeholder="Digite sua senha"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
              required
              minLength={6}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              className="mt-6"
              disabled={loading}
            >
              {loading ? "Criando conta..." : "Criar conta"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
