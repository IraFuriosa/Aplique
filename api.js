import { calculateSortingDate } from './utils.js';

export const TABLE_INVESTIMENTOS = 'INVESTIMENTO';
export const TABLE_NOMES = 'NOMES';

let supabaseClient = null;
let realtimeChannel = null;

export function initApi(supabase) {
    supabaseClient = supabase;
}

export async function loadNames() {
    if (!supabaseClient) return [];
    
    try {
        let { data: nomes, error } = await supabaseClient
            .from(TABLE_NOMES)
            .select('nome')
            .order('nome', { ascending: true });

        if (error) throw error;

        if (!nomes || nomes.length === 0) {
            const initialNames = [
                { nome: "Ações" },
                { nome: "Renda Fixa" },
                { nome: "FIIs" },
                { nome: "Criptomoedas" }
            ];
            await supabaseClient.from(TABLE_NOMES).insert(initialNames);
            return initialNames;
        }
        return nomes;
    } catch (error) {
        console.error("Erro ao carregar nomes de investimento Supabase:", error);
        throw error; // Propaga o erro
    }
}

export async function adicionarInvestimento(novoInvestimento) {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");

    const { data, error } = await supabaseClient
        .from(TABLE_INVESTIMENTOS)
        .insert([novoInvestimento])
        .select()
        .single();

    if (error) {
        console.error("Erro ao adicionar investimento Supabase:", error);
        throw error;
    }
    
    return data;
}

export async function deletarInvestimento(id) {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");

    const { error } = await supabaseClient
        .from(TABLE_INVESTIMENTOS)
        .delete()
        .eq('id', id);

    if (error) {
        console.error("Erro ao deletar investimento Supabase:", error);
        throw error;
    }
}

export async function marcarComoResgatado(investmentId) {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");
    
    const { error } = await supabaseClient
        .from(TABLE_INVESTIMENTOS)
        .update({ status: 'resgatado' })
        .eq('id', investmentId);

    if (error) {
        console.error("Erro ao marcar como resgatado:", error);
        throw error;
    }
}

export async function toggleParcelaQuitada(investmentId, parcelaIndex) {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");

    const { data: investimento, error: fetchError } = await supabaseClient
        .from(TABLE_INVESTIMENTOS)
        .select('parcelas_quitadas')
        .eq('id', investmentId)
        .single();

    if (fetchError || !investimento) {
        console.error('Erro ao buscar parcela:', fetchError);
        throw fetchError || new Error("Investimento não encontrado para atualização da parcela.");
    }

    const novasParcelasQuitadas = [...(investimento.parcelas_quitadas || [])];
    if (novasParcelasQuitadas.length <= parcelaIndex) {
         throw new Error("Índice da parcela fora do limite.");
    }
    novasParcelasQuitadas[parcelaIndex] = !novasParcelasQuitadas[parcelaIndex];

    const { error } = await supabaseClient
        .from(TABLE_INVESTIMENTOS)
        .update({ parcelas_quitadas: novasParcelasQuitadas })
        .eq('id', investmentId);

    if (error) {
        console.error("Erro ao atualizar parcela:", error);
        throw error;
    }
}

export async function fetchInvestments() {
    if (!supabaseClient) return [];

    const { data: investimentos, error } = await supabaseClient
        .from(TABLE_INVESTIMENTOS)
        .select('*');

    if (error) {
        console.error("Erro ao buscar dados Supabase:", error);
        throw error;
    }

    investimentos.forEach(inv => {
        inv.sorting_date = calculateSortingDate(inv);
    });

    // Separar investimentos ativos dos resgatados
    const ativos = investimentos.filter(inv => inv.status !== 'resgatado');
    const resgatados = investimentos.filter(inv => inv.status === 'resgatado');

    // Ordenar ativos por data de vencimento (crescente - mais próximos primeiro)
    ativos.sort((a, b) => {
        const dateA = new Date(a.sorting_date);
        const dateB = new Date(b.sorting_date);
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;
        return dateA - dateB;
    });

    // Ordenar resgatados por data de resgate (decrescente - mais recentes primeiro)
    resgatados.sort((a, b) => {
        const dateA = new Date(a.sorting_date);
        const dateB = new Date(b.sorting_date);
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;
        return dateB - dateA; // Decrescente
    });

    // Combinar: ativos primeiro, depois resgatados
    return [...ativos, ...resgatados];
}

export function subscribeToChanges(callback) {
    if (!supabaseClient) return;

    // Prevent multiple subscriptions
    if (realtimeChannel) {
        console.log('Realtime channel already exists, skipping subscription.');
        return;
    }

    realtimeChannel = supabaseClient
        .channel('investimento_changes_public')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: TABLE_INVESTIMENTOS },
            (payload) => {
                console.log('DB Change detected:', payload);
                callback();
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Realtime channel subscribed.');
                callback(); // Initial fetch
            }
        });
}

export function unsubscribeFromChanges() {
    if (supabaseClient && realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
        console.log('Realtime channel unsubscribed.');
    }
}

export async function updateInvestment(id, updateData) {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");

    const { error } = await supabaseClient
        .from(TABLE_INVESTIMENTOS)
        .update(updateData)
        .eq('id', id);

    if (error) {
        console.error("Erro ao atualizar investimento:", error);
        throw error;
    }
}
