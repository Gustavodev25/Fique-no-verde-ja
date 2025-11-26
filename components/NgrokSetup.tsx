"use client";

import { useEffect } from "react";

/**
 * Componente que configura o fetch global para incluir headers necessários para ngrok
 */
export default function NgrokSetup() {
  useEffect(() => {
    // Configurar fetch global para incluir headers ngrok
    const originalFetch = window.fetch;

    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const headers = new Headers(init?.headers);

      // Adicionar header para pular tela de aviso do ngrok
      headers.set('ngrok-skip-browser-warning', 'true');

      // Adicionar User-Agent customizado como fallback
      headers.set('User-Agent', 'fqnj-app');

      return originalFetch(input, {
        ...init,
        headers,
      });
    };

    // Cleanup não é necessário pois queremos manter essa configuração
  }, []);

  return null; // Este componente não renderiza nada
}
