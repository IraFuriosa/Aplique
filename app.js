// Importa funções dos módulos de funcionalidade
import { initAuth, handleAuth, handleLogout } from './auth.js';
import { initApi, adicionarInvestimento, fetchInvestments, subscribeToChanges, unsubscribeFromChanges, loadNames } from './api.js';
import { initUI, renderInvestments, updateSummaryDisplay, populateNamesDropdown, showFeedback } from './ui.js';
import { renderChart, destroyChart } from './chart-handler.js';

// Função principal de inicialização da aplicação
function main() {
    // --- 1. Verificação de Configuração e Inicialização do Cliente Supabase ---
    if (typeof supabase === 'undefined' || !__supabase_url || !__supabase_anon_key) {
        console.error('Supabase não foi encontrado ou as chaves não foram definidas. Verifique se o config.js e o CDN do Supabase estão sendo carregados corretamente.');
        document.body.innerHTML = '<h1 style="color: red; text-align: center; margin-top: 50px;">Erro Crítico: A configuração do banco de dados não foi encontrada. A aplicação não pode iniciar.</h1>';
        return;
    }
    const supabaseClient = supabase.createClient(__supabase_url, __supabase_anon_key);

    // --- 2. Funções de Callback e Orquestração ---

    const refreshDataAndUpdateUI = async () => {
        try {
            const investments = await fetchInvestments();
            renderInvestments(investments);
            updateSummaryDisplay(investments);
            renderChart(investments);
        } catch (error) {
            showFeedback('Erro ao carregar os dados dos investimentos.', 'error');
        }
    };
    
    const onLogin = async (user) => {
        try {
            const names = await loadNames();
            populateNamesDropdown(names);
            subscribeToChanges(refreshDataAndUpdateUI);
        } catch (error) {
            showFeedback('Erro ao carregar dados iniciais da aplicação.', 'error');
        }
    };

    const onLogout = () => {
        unsubscribeFromChanges();
        renderInvestments([]);
        updateSummaryDisplay([]);
        destroyChart();
    };

    const handleAddInvestment = async (investmentData) => {
        try {
            const result = await adicionarInvestimento(investmentData);
            showFeedback('Investimento adicionado com sucesso!');
            return result !== null;
        } catch (error) {
            showFeedback(`Erro ao adicionar investimento: ${error.message || 'Tente novamente.'}`, 'error');
            return false;
        }
    };

    const handleLoginSubmit = async (email, password) => {
        try {
            await handleAuth(email, password);
            showFeedback('Login realizado com sucesso!');
        } catch (error) {
            showFeedback(error.message || "Credenciais inválidas.", 'error');
        }
    };
    
    const handleLogoutClick = async () => {
        try {
            await handleLogout();
            showFeedback('Você saiu da conta.', 'info');
        } catch (error) {
            showFeedback('Erro ao fazer logout.', 'error');
        }
    };

    // --- 3. Inicialização dos Módulos ---

    initApi(supabaseClient);
    
    initUI({
        onLoginSubmit: handleLoginSubmit,
        onLogout: handleLogoutClick,
        onAddInvestment: handleAddInvestment,
        onThemeChange: refreshDataAndUpdateUI 
    });

    initAuth(supabaseClient, {
        onLogin: onLogin,
        onLogout: onLogout,
        onInactivityLogout: () => {
            showFeedback('Sessão encerrada por inatividade.', 'info');
        }
    });
}

document.addEventListener('DOMContentLoaded', main);
