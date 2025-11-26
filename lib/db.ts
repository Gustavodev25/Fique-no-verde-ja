import { createClient } from "@supabase/supabase-js";

// Configuração do cliente Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Função auxiliar para executar queries SQL customizadas (se necessário)
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    // Para queries customizadas, vamos usar o RPC do Supabase
    // Mas primeiro vamos tentar converter queries comuns para operações Supabase
    console.log("Query solicitada:", { text, params });

    // Esta função será usada apenas para compatibilidade
    // Recomendamos usar o supabase client diretamente nas rotas
    throw new Error("Use o supabase client diretamente em vez de queries SQL");
  } catch (error) {
    console.error("Erro na query:", error);
    throw error;
  }
};

export default supabase;
