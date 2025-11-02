    const SUPABASE_URL = __supabase_url;
    const SUPABASE_ANON_KEY = __supabase_anon_key;

    const DIAS_NO_MES = 30.4375; 
    const PRIMARY_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    const SUCCESS_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--success').trim();
    const ERROR_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--error').trim();
    const COLORS = [PRIMARY_COLOR, SUCCESS_COLOR, '#3b82f6', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#f97316'];
    
    let inactivityTimer;
    const INACTIVITY_TIMEOUT_MS = 1800000;
    let isUpdatingFromValor = false;
    let isUpdatingFromHaver = false;
    let isUpdatingFromInstallment = false;

    let supabaseClient = null; 
    let currentUserId = null; 
    let investmentChart = null;
    let investmentToDeleteId = null; 
    let realtimeChannel = null;

    const TABLE_INVESTIMENTOS = 'INVESTIMENTO';
    const TABLE_NOMES = 'NOMES';

    function showFeedback(message, type = 'success') {
        const feedbackEl = document.getElementById('feedback-message');
        const textEl = document.getElementById('feedback-text');
        if (!feedbackEl || !textEl) return;
        const classes = {
            'success': 'bg-[var(--success)] text-white',
            'error': 'bg-[var(--error)] text-white',
            'info': 'bg-[var(--primary)] text-white'
        };
        feedbackEl.className = 'fixed bottom-4 right-4 p-4 rounded-lg shadow-xl opacity-0 max-w-sm';
        const classListToAdd = (classes[type] || classes['info']).split(' ');
        feedbackEl.classList.add(...classListToAdd); 
        textEl.textContent = message;
        setTimeout(() => {
            feedbackEl.classList.add('show', 'opacity-100');
        }, 10);
        setTimeout(() => {
            feedbackEl.classList.remove('show', 'opacity-100');
        }, 4000);
    }
    
    function formatarMoeda(valor) {
        if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function parseMoedaParaNumero(valorStr) {
         if (!valorStr) return 0;
        return parseFloat(valorStr.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
    }

    function formatarInputMoeda(e) {
        let value = e.target.value.replace(/\D/g, '');
        let floatValue = parseFloat(value) / 100;
        if (isNaN(floatValue)) floatValue = 0;
        e.target.value = formatarMoeda(floatValue).replace('R$', '').trim();
    }

    function calcularHaver(valor, taxaMensal, diasTotais) {
        if (diasTotais <= 0 || valor <= 0 || taxaMensal <= 0) return 0;
        const meses = diasTotais / DIAS_NO_MES;
        const taxaDecimal = taxaMensal / 100;
        return valor * Math.pow(1 + taxaDecimal, meses);
    }

    function calcularValorInvestido(haver, taxaMensal, diasTotais) {
        if (diasTotais <= 0 || haver <= 0 || taxaMensal <= 0) return 0;
        const meses = diasTotais / DIAS_NO_MES;
        const taxaDecimal = taxaMensal / 100;
        return haver / Math.pow(1 + taxaDecimal, meses);
    }

    function calcularTaxaJuros(valor, haver, diasTotais) {
        if (diasTotais <= 0 || valor <= 0 || haver <= valor) return 0;
        const meses = diasTotais / DIAS_NO_MES;
        if (meses <= 0) return 0;
        const taxaDecimal = Math.pow(haver / valor, 1 / meses) - 1;
        return taxaDecimal * 100;
    }

    function handleInstallmentEdit() {
        if (isUpdatingFromValor || isUpdatingFromHaver) return;
        isUpdatingFromInstallment = true;

        const haverEl = document.getElementById('haverEstimado');
        const taxaJurosEl = document.getElementById('taxaJuros');
        const valorEl = document.getElementById('valor');

        let novoHaverTotal = 0;
        document.querySelectorAll('.installment-input').forEach(input => {
            novoHaverTotal += parseMoedaParaNumero(input.value);
        });

        haverEl.value = formatarMoeda(novoHaverTotal).replace('R$', '').trim();
        
        const valorNumerico = parseMoedaParaNumero(valorEl.value);
        const diasTotaisText = document.getElementById('diasTotaisDisplay')?.textContent || '0';
        const diasTotais = parseFloat(diasTotaisText.replace(/\D/g,'')) || 0;

        if (diasTotais > 0 && valorNumerico > 0 && novoHaverTotal > valorNumerico) {
            const novaTaxa = calcularTaxaJuros(valorNumerico, novoHaverTotal, diasTotais);
            taxaJurosEl.value = novaTaxa;
        }
        
        setTimeout(() => { isUpdatingFromInstallment = false; }, 200);
    }
    
    function addInstallmentListeners() {
        document.querySelectorAll('.installment-input').forEach(input => {
            input.addEventListener('input', (e) => {
                formatarInputMoeda(e);
                handleInstallmentEdit();
            });
        });
    }
    
    function calcularValoresBidirecionais() {
        if (isUpdatingFromInstallment) return;

        // --- 1. COLETA DE DADOS E CÁLCULO DE PRAZOS ---
        const returnType = document.querySelector('input[name="returnType"]:checked').value;
        const entradaInput = document.getElementById('entrada').value;
        const numeroParcelas = parseInt(document.getElementById('numeroParcelas').value) || 0;
        const intervaloParcelas = parseInt(document.getElementById('intervaloParcelas').value) || 0;
        const taxaInput = parseFloat(document.getElementById('taxaJuros')?.value) || 0;
        const valorEl = document.getElementById('valor');
        const haverEl = document.getElementById('haverEstimado');

        let diasTotais = 0;
        const diasParcelas = [];

        if (entradaInput) {
            const dataInicio = new Date(`${entradaInput}T00:00:00`);
            if (returnType === 'single') {
                const retornoInput = document.getElementById('retorno').value;
                if (retornoInput) {
                    const dataResgate = new Date(`${retornoInput}T00:00:00`);
                    if (dataResgate >= dataInicio) {
                        diasTotais = Math.ceil((dataResgate.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
                    }
                }
            } else {
                const primeiraParcelaInput = document.getElementById('primeiraParcela').value;
                if (primeiraParcelaInput && numeroParcelas > 0) {
                    const [year, month, day] = primeiraParcelaInput.split('-').map(Number);
                    const dataPrimeiraParcela = new Date(Date.UTC(year, month - 1, day));
                    const dataInicioUTC = new Date(Date.UTC(dataInicio.getUTCFullYear(), dataInicio.getUTCMonth(), dataInicio.getUTCDate()));

                    for (let i = 0; i < numeroParcelas; i++) {
                        const dataParcelaAtual = new Date(dataPrimeiraParcela.getTime());
                        dataParcelaAtual.setUTCDate(dataParcelaAtual.getUTCDate() + (intervaloParcelas * i));
                        let dias = 0;
                        if (dataParcelaAtual >= dataInicioUTC) {
                            dias = Math.ceil((dataParcelaAtual.getTime() - dataInicioUTC.getTime()) / (1000 * 60 * 60 * 24));
                        }
                        diasParcelas.push(dias);
                    }
                    diasTotais = diasParcelas[diasParcelas.length - 1] || 0;
                }
            }
        }

        // --- 2. CÁLCULO DE VALORES MONETÁRIOS ---
        let valorInvestidoNumerico = parseMoedaParaNumero(valorEl.value);
        let haverNumerico = parseMoedaParaNumero(haverEl.value);

        if (diasTotais > 0 && taxaInput > 0) {
            if (document.activeElement === haverEl && !isUpdatingFromValor) {
                if (haverNumerico > 0) {
                    valorInvestidoNumerico = calcularValorInvestido(haverNumerico, taxaInput, diasTotais);
                    isUpdatingFromHaver = true;
                    valorEl.value = formatarMoeda(valorInvestidoNumerico).replace('R$', '').trim();
                    setTimeout(() => isUpdatingFromHaver = false, 100);
                }
            } 
            else if (!isUpdatingFromHaver) {
                if (valorInvestidoNumerico > 0) {
                    haverNumerico = calcularHaver(valorInvestidoNumerico, taxaInput, diasTotais);
                    isUpdatingFromValor = true;
                    haverEl.value = formatarMoeda(haverNumerico).replace('R$', '').trim();
                    setTimeout(() => isUpdatingFromValor = false, 100);
                }
            }
        }

        // --- 3. CÁLCULO DO VALOR DA PARCELA ---
        let valorParcela = 0;
        if (returnType === 'multi' && numeroParcelas > 0 && haverNumerico > 0) {
            valorParcela = haverNumerico / numeroParcelas;
        }

        // --- 4. RENDERIZAÇÃO DO RESUMO ---
        const resumoContainer = document.getElementById('prazo-resumo-container');
        let htmlContent = '';

        if (returnType === 'single') {
            htmlContent = `
                <div>
                    <p class="text-sm font-medium" style="color: var(--text-muted);">Prazo Total em Dias:</p>
                    <p id="diasTotaisDisplay" class="font-bold text-lg text-[var(--primary)]">${diasTotais} Dias</p>
                </div>
            `;
        } else {
            if (diasParcelas.length > 0) {
                htmlContent += `<div id="parcelas-container" class="space-y-2">`;
                diasParcelas.forEach((dias, index) => {
                    htmlContent += `
                        <div class="flex justify-between items-center text-sm">
                            <label for="parcela-${index}" class="whitespace-nowrap" style="color: var(--text-muted);">${index + 1}ª Parcela (${dias} dias):</label>
                            <div class="relative w-32">
                                 <span class="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50">R$</span>
                                 <input type="text" id="parcela-${index}" 
                                       class="installment-input input-field w-full text-right pr-2" 
                                       style="padding-left: 2.2rem;"
                                       data-parcela-index="${index}"
                                       value="${formatarMoeda(valorParcela).replace('R$', '').trim()}">
                            </div>
                        </div>
                    `;
                });
                htmlContent += `</div>`;

                htmlContent += `
                    <div class="border-t pt-2 mt-2" style="border-color: var(--border-color);">
                        <div class="flex justify-between items-center">
                            <p class="text-sm font-medium" style="color: var(--text-muted);">Prazo Final:</p>
                            <p id="diasTotaisDisplay" class="font-bold text-lg text-[var(--primary)]">${diasTotais} Dias</p>
                        </div>
                    </div>
                `;
            } else {
                 htmlContent = `
                    <div>
                        <p class="text-sm font-medium" style="color: var(--text-muted);">Prazo Total em Dias:</p>
                        <p id="diasTotaisDisplay" class="font-bold text-lg text-[var(--primary)]">0 Dias</p>
                    </div>
                `;
            }
        }
        resumoContainer.innerHTML = htmlContent;

        if (returnType === 'multi' && diasParcelas.length > 0) {
            addInstallmentListeners();
        }
    }
    
    function resetInactivityTimer() {
        if (!currentUserId) return;
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(handleInactivityLogout, INACTIVITY_TIMEOUT_MS);
    }

    function handleInactivityLogout() {
        if (currentUserId) {
            showFeedback('Sessão encerrada por inatividade.', 'info');
            handleLogout(); 
        }
    }
    
    function setupInactivityListeners() {
        const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
        activityEvents.forEach(event => {
            document.addEventListener(event, resetInactivityTimer, false);
        });
    }

    async function initializeSupabase() {
        try {
            if (SUPABASE_URL.includes('your-supabase-url') || SUPABASE_ANON_KEY.includes('your-anon-key')) {
                console.error("Supabase Configuração não definida.");
                showFeedback('Erro de configuração: Chaves do Supabase não definidas.', 'error');
                return;
            }
            
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            } else {
                console.error("Supabase CDN não carregado corretamente.");
                showFeedback('Erro fatal: Supabase CDN não carregado. Verifique a conexão.', 'error');
                return;
            }
            
            supabaseClient.auth.onAuthStateChange((event, session) => {
                const authContainer = document.getElementById('auth-container');
                const appContainer = document.getElementById('app-container');
                const user = session?.user;

                if (user) {
                    currentUserId = user.id;
                    const emailDisplay = document.getElementById('user-email-display');
                    const idDisplay = document.getElementById('user-id-display');
                    
                    if (emailDisplay) emailDisplay.textContent = user.email || 'Anônimo';
                    if (idDisplay) idDisplay.textContent = `
ID: 
${user.id}`;
                    
                    if (authContainer) authContainer.classList.add('hidden');
                    if (appContainer) appContainer.classList.remove('hidden');
                    
                    loadNames(); 
                    startDataListener();
                    
                    resetInactivityTimer();
                } else {
                    currentUserId = null;
                    clearTimeout(inactivityTimer);
                    if (realtimeChannel) {
                        supabaseClient.removeChannel(realtimeChannel);
                        realtimeChannel = null;
                    }
                    if (authContainer) authContainer.classList.remove('hidden');
                    if (appContainer) appContainer.classList.add('hidden');
                }
            });

        } catch (error) {
            console.error("Erro na inicialização do Supabase:", error);
            showFeedback('Erro ao iniciar a aplicação. Verifique a configuração do Supabase.', 'error');
        }
    }

    async function handleAuth(email, password) {
       if (!supabaseClient) return;
        const submitButton = document.getElementById('login-button');
        if (!submitButton) return;

        submitButton.disabled = true;
        submitButton.textContent = 'Entrando...';

        try {
            const result = await supabaseClient.auth.signInWithPassword({ email, password });
            if (result.error) throw result.error;
            showFeedback('Login realizado com sucesso!');
        } catch (error) {
            console.error("Erro de autenticação Supabase:", error);
            let errorMessage = "Credenciais inválidas. Não é permitido criar novas contas.";
            showFeedback(errorMessage, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Entrar';
        }
    }
    
    async function handleLogout() {
        if (!supabaseClient) return;
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
            showFeedback('Você saiu da conta.', 'info');
            clearTimeout(inactivityTimer); 
        } catch (error) {
            console.error("Erro ao fazer logout:", error);
            showFeedback('Erro ao fazer logout.', 'error');
        }
    }

    async function loadNames() {
        if (!supabaseClient) return;
        const selectEl = document.getElementById('nomeTipo');
        if (!selectEl) return;
        selectEl.innerHTML = 
`<option value="" disabled selected>Carregando Tipos...</option>`; 

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
                nomes = initialNames; 
            }
            
            selectEl.innerHTML = '<option value="" disabled selected>Selecione</option>';
            nomes.forEach(item => {
                selectEl.innerHTML += 
`<option value="
${item.nome}">
${item.nome}</option>`;
            });

            selectEl.removeAttribute('disabled');
        } catch (error) {
            console.error("Erro ao carregar nomes de investimento Supabase:", error);
            selectEl.innerHTML = 
`<option value="" disabled selected>Erro ao carregar tipos</option>`;
            showFeedback('Erro ao carregar a lista de tipos de investimento.', 'error');
        }
    }

    async function adicionarInvestimento(e) {
        e.preventDefault();

        if (!currentUserId) {
            showFeedback('Erro: Usuário não autenticado. Faça login para adicionar.', 'error');
            return;
        }

        const form = e.target;
        const nomeTipo = form.nomeTipo.value;
        const taxaJuros = parseFloat(form.taxaJuros.value);
        const haverNumerico = parseMoedaParaNumero(form.haverEstimado.value);
        const valorNumerico = parseMoedaParaNumero(form.valor.value);
        const dataInicio = form.entrada.value;
        
            const returnType = document.querySelector('input[name="returnType"]:checked').value;
            let dataResgateFinal;
            let primeiraParcela = null;
            let numeroParcelas = null;
            let intervaloParcelas = null;

            if (returnType === 'single') {
                dataResgateFinal = document.getElementById('retorno').value;
            } else { 
                primeiraParcela = document.getElementById('primeiraParcela').value;
                numeroParcelas = parseInt(document.getElementById('numeroParcelas').value) || 0;
                intervaloParcelas = parseInt(document.getElementById('intervaloParcelas').value) || 0;
                
                if (primeiraParcela && numeroParcelas > 0) {
                    const [year, month, day] = primeiraParcela.split('-').map(Number);
                    const dataPrimeiraParcela = new Date(Date.UTC(year, month - 1, day));
                    const dataUltimaParcela = new Date(dataPrimeiraParcela.getTime());
                    dataUltimaParcela.setUTCDate(dataUltimaParcela.getUTCDate() + (intervaloParcelas * (numeroParcelas - 1)));
                    dataResgateFinal = dataUltimaParcela.toISOString().split('T')[0];
                } else {
                    showFeedback('Para investimentos com múltiplas parcelas, preencha os detalhes das parcelas.', 'error');
                    return;
                }
            }

            if (valorNumerico <= 0 || haverNumerico <= 0) {
                 showFeedback('Os valores de Investido e Haver Estimado devem ser maiores que zero.', 'error');
                 return;
            }

            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Adicionando...';
            
            try {
                const novoInvestimento = {
                    nome: nomeTipo,
                    valor: valorNumerico,
                    entrada: dataInicio,
                    retorno: dataResgateFinal,
                    haver: haverNumerico,
                    tipo_retorno: returnType,
                    numero_parcelas: numeroParcelas,
                    intervalo_parcelas: intervaloParcelas,
                    data_primeira_parcela: primeiraParcela,
                    parcelas_quitadas: returnType === 'multi' ? Array(numeroParcelas).fill(false) : null,
                    status: 'ativo'
                };

            const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_INVESTIMENTOS}`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation',
                },
                body: JSON.stringify([novoInvestimento]),
            });

            const data = await response.json();

            if (!response.ok) {
                throw data || { message: `HTTP error! status: ${response.status}` };
            }

            showFeedback('Investimento adicionado com sucesso!');
            form.reset();
            document.getElementById('diasTotaisDisplay').textContent = '0 Dias';
            document.getElementById('single-installment-fields').classList.remove('hidden');
            document.getElementById('multi-installment-fields').classList.add('hidden');

        } catch (error) {
            console.error("Erro ao adicionar investimento Supabase:", error);
            showFeedback(`Erro ao adicionar investimento: ${error.message || 'Tente novamente.'}`, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Adicionar Investimento';
        }
    }
    
    function showDeleteConfirmation(id) {
        const modal = document.getElementById('delete-modal');
        if (!modal) return;
        investmentToDeleteId = id;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function hideDeleteConfirmation() {
        const modal = document.getElementById('delete-modal');
        if (!modal) return;
        investmentToDeleteId = null;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async function deletarInvestimento(id) {
        if (!supabaseClient) return;
        try {
            const { error } = await supabaseClient
                .from(TABLE_INVESTIMENTOS)
                .delete()
                .eq('id', id); 

            if (error) throw error;
            showFeedback('Investimento excluído com sucesso!', 'info');
        } catch (error) {
            console.error("Erro ao deletar investimento Supabase:", error);
            showFeedback('Erro ao excluir investimento. Tente novamente.', 'error');
        }
    }

    async function marcarComoResgatado(investmentId) {
        if (!supabaseClient) return;

        try {
            const { error } = await supabaseClient
                .from(TABLE_INVESTIMENTOS)
                .update({ status: 'resgatado' })
                .eq('id', investmentId);

            if (error) throw error;
            
            showFeedback('Investimento marcado como resgatado.', 'info');
        } catch (error) {
            console.error("Erro ao marcar como resgatado:", error);
            showFeedback('Erro ao atualizar o status do investimento.', 'error');
        }
    }

    async function toggleParcelaQuitada(investmentId, parcelaIndex) {
        if (!supabaseClient) return;

        const { data: investimento, error: fetchError } = await supabaseClient
            .from(TABLE_INVESTIMENTOS)
            .select('parcelas_quitadas')
            .eq('id', investmentId)
            .single();

        if (fetchError || !investimento) {
            showFeedback('Erro ao buscar dados da parcela para atualização.', 'error');
            console.error('Erro ao buscar parcela:', fetchError);
            return;
        }

        const novasParcelasQuitadas = [...(investimento.parcelas_quitadas || [])];
        if (novasParcelasQuitadas.length <= parcelaIndex) {
             showFeedback('Erro: Índice da parcela fora do limite.', 'error');
             return;
        }
        novasParcelasQuitadas[parcelaIndex] = !novasParcelasQuitadas[parcelaIndex];

        try {
            const { error } = await supabaseClient
                .from(TABLE_INVESTIMENTOS)
                .update({ parcelas_quitadas: novasParcelasQuitadas })
                .eq('id', investmentId);

            if (error) throw error;
            
            showFeedback(`Parcela ${parcelaIndex + 1} atualizada.`, 'info');

        } catch (error) {
            console.error("Erro ao atualizar parcela:", error);
            showFeedback('Erro ao atualizar o status da parcela.', 'error');
        }
    }

    function calculateSortingDate(inv) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (inv.tipo_retorno === 'multi' && inv.numero_parcelas > 0 && inv.data_primeira_parcela) {
            const firstUnpaidIndex = inv.parcelas_quitadas ? inv.parcelas_quitadas.findIndex(p => p === false) : 0;

            if (firstUnpaidIndex === -1) { // All paid
                const lastIndex = inv.numero_parcelas - 1;
                const [year, month, day] = inv.data_primeira_parcela.split('-').map(Number);
                const dataPrimeiraParcela = new Date(Date.UTC(year, month - 1, day));
                const dataUltimaParcela = new Date(dataPrimeiraParcela.getTime());
                dataUltimaParcela.setUTCDate(dataUltimaParcela.getUTCDate() + ((inv.intervalo_parcelas || 30) * lastIndex));
                return dataUltimaParcela;
            }

            const [year, month, day] = inv.data_primeira_parcela.split('-').map(Number);
            const dataPrimeiraParcela = new Date(Date.UTC(year, month - 1, day));
            const dataProximaParcela = new Date(dataPrimeiraParcela.getTime());
            dataProximaParcela.setUTCDate(dataProximaParcela.getUTCDate() + ((inv.intervalo_parcelas || 30) * firstUnpaidIndex));
            return dataProximaParcela;
        } else {
            return new Date(inv.retorno);
        }
    }

    function startDataListener() {
        if (!supabaseClient) return;
        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
        }
        realtimeChannel = supabaseClient
            .channel('investimento_changes_public')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: TABLE_INVESTIMENTOS }, 
                (payload) => {
                    fetchAndRenderData();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    fetchAndRenderData(); 
                }
            });
    }

    async function fetchAndRenderData() {
        if (!supabaseClient) return;
        const loadingMessage = document.getElementById('loading-message');
        try {
            const { data: investimentos, error } = await supabaseClient
                .from(TABLE_INVESTIMENTOS)
                .select('*');

            if (error) throw error;

            // Calculate sorting date for each investment
            investimentos.forEach(inv => {
                inv.sorting_date = calculateSortingDate(inv);
            });

            // Sort investments by the calculated date
            investimentos.sort((a, b) => {
                const dateA = new Date(a.sorting_date);
                const dateB = new Date(b.sorting_date);
                if (isNaN(dateA.getTime())) return 1; // Move invalid dates to the end
                if (isNaN(dateB.getTime())) return -1;
                return dateA - dateB;
            });

            renderInvestments(investimentos);
            updateSummaryAndChart(investimentos);

            if (loadingMessage) {
                loadingMessage.style.display = investimentos.length > 0 ? 'none' : 'block';
                loadingMessage.textContent = 'Nenhum investimento encontrado. Adicione um novo.';
            }
        } catch (error) {
            console.error("Erro ao buscar dados Supabase:", error);
            if (loadingMessage) loadingMessage.textContent = 'Erro ao carregar dados.';
            showFeedback('Erro ao buscar dados do Supabase.', 'error');
        }
    }

    function renderInvestments(investimentos) {
        const listEl = document.getElementById('investimento-list');
        if (!listEl) return; 
        listEl.innerHTML = ''; 

        if (investimentos.length === 0) {
            listEl.innerHTML = '<p class="text-center py-4" style="color: var(--text-muted);">Nenhum investimento registrado.</p>';
            return;
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0); 

        investimentos.forEach(inv => {
            const card = document.createElement('div');
            card.className = 'p-4 rounded-xl shadow-sm border hover:shadow-md transition-shadow';
            card.style.backgroundColor = 'var(--background)';
            card.style.borderColor = 'var(--border-color)';

            const isResgatado = inv.status === 'resgatado';
            if (isResgatado) {
                card.classList.add('opacity-60');
            }

            if (inv.tipo_retorno === 'multi' && inv.numero_parcelas > 0 && inv.data_primeira_parcela) {
                const valorParcela = (inv.haver || 0) / inv.numero_parcelas;
                const [year, month, day] = inv.data_primeira_parcela.split('-').map(Number);
                const dataPrimeiraParcela = new Date(Date.UTC(year, month - 1, day));

                // --- Status Geral do Card ---
                const diffTime = inv.sorting_date.getTime() - hoje.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const allPaid = inv.parcelas_quitadas && !inv.parcelas_quitadas.includes(false);
                let statusText, statusClass;

                if (isResgatado) {
                    statusText = 'Resgatado';
                    statusClass = 'bg-gray-200 text-gray-700';
                } else if (allPaid) {
                    statusText = 'Finalizado';
                    statusClass = 'bg-blue-100 text-blue-700';
                } else if (diffDays < 0) {
                    statusText = `Vencido há ${Math.abs(diffDays)} dias`;
                    statusClass = 'bg-red-100 text-[var(--error)]';
                } else if (diffDays === 0) {
                    statusText = 'Vence Hoje';
                    statusClass = 'bg-yellow-100 text-yellow-700';
                } else {
                    statusText = `Próximo em ${diffDays} dias`;
                    statusClass = 'bg-green-100 text-[var(--success)]';
                }

                // --- HTML das Parcelas Individuais ---
                let installmentsHTML = '<div class="space-y-2 mt-3">';
                if (isNaN(dataPrimeiraParcela.getTime())) {
                    installmentsHTML = '<p class="text-sm text-[var(--error)]">Data da primeira parcela é inválida.</p>';
                } else {
                    for (let i = 0; i < inv.numero_parcelas; i++) {
                        const dataParcelaAtual = new Date(dataPrimeiraParcela.getTime());
                        dataParcelaAtual.setUTCDate(dataParcelaAtual.getUTCDate() + ((inv.intervalo_parcelas || 30) * i));
                        const displayParcelaDate = !isNaN(dataParcelaAtual.getTime()) ? dataParcelaAtual.toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'Data inválida';
                        const isQuitada = inv.parcelas_quitadas && inv.parcelas_quitadas[i] === true;
                        const quitadaClasses = isQuitada ? 'opacity-50 line-through' : '';

                        installmentsHTML += `
                            <div class="flex justify-between items-center p-2 rounded-lg ${quitadaClasses}" style="background-color: var(--card-bg);">
                                <div class="flex items-center space-x-3">
                                    <div class="toggle-switch ${isQuitada ? 'checked' : ''} ${isResgatado ? 'pointer-events-none' : ''}" data-investment-id="${inv.id}" data-parcela-index="${i}">
                                        <div class="toggle-switch-background"></div>
                                        <div class="toggle-switch-handle"></div>
                                    </div>
                                    <div>
                                        <p class="font-semibold">${i + 1}ª Parcela - ${formatarMoeda(valorParcela)}</p>
                                        <p class="text-xs" style="color: var(--text-muted);">Data: ${displayParcelaDate}</p>
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                }
                installmentsHTML += '</div>';

                let actionsHTML = '';
                if (!isResgatado) {
                    actionsHTML = `
                        <div class="flex items-center space-x-2">
                            <button data-id="${inv.id}" class="resgatado-button text-xs py-1 px-2 flex items-center space-x-1 font-semibold rounded-lg transition duration-150 ease-in-out shadow-sm bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-300">
                                <i class="fas fa-check-circle"></i>
                                <span>Resgatado</span>
                            </button>
                            <button data-id="${inv.id}" class="delete-button text-xs py-1 px-2 flex items-center space-x-1 font-semibold rounded-lg transition duration-150 ease-in-out shadow-sm bg-[var(--error)] text-white hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-[var(--error)] focus:ring-offset-2">
                                <i class="fas fa-trash-alt"></i>
                                <span>Excluir</span>
                            </button>
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <h4 class="text-lg font-bold">${inv.nome}</h4>
                        <span class="text-xs font-semibold px-3 py-1 rounded-full ${statusClass}">${statusText}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-3 text-sm">
                        <p><span class="font-medium">Total Investido:</span> <span class="text-[var(--primary)] font-semibold">${formatarMoeda(inv.valor)}</span></p>
                        <p><span class="font-medium">Total a Resgatar:</span> <span class="text-[var(--success)] font-semibold">${formatarMoeda(inv.haver)}</span></p>
                    </div>
                    <div class="mt-4 pt-3 border-t" style="border-color: var(--border-color);">
                        <div class="flex justify-between items-center mb-2">
                             <h5 class="text-sm font-semibold" style="color: var(--text-muted);">Parcelas</h5>
                             ${actionsHTML}
                        </div>
                        ${installmentsHTML}
                    </div>
                `;

            } else {
                const dataEntrada = new Date(inv.entrada + 'T00:00:00');
                const dataRetorno = new Date(inv.retorno + 'T00:00:00');
                const displayEntrada = !isNaN(dataEntrada.getTime()) ? dataEntrada.toLocaleDateString('pt-BR') : 'Data inválida';
                const displayRetorno = !isNaN(dataRetorno.getTime()) ? dataRetorno.toLocaleDateString('pt-BR') : 'Data inválida';

                const diffTime = dataRetorno.getTime() - hoje.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let statusText, statusClass;
                if (isResgatado) {
                    statusText = 'Resgatado';
                    statusClass = 'bg-gray-200 text-gray-700';
                } else if (isNaN(dataRetorno.getTime())) {
                    statusText = 'Data Inválida';
                    statusClass = 'bg-gray-200 text-gray-700';
                } else if (diffDays < 0) {
                    statusText = `Vencido há ${Math.abs(diffDays)} dias`;
                    statusClass = 'bg-red-100 text-[var(--error)]';
                } else if (diffDays === 0) {
                    statusText = 'Vence Hoje';
                    statusClass = 'bg-yellow-100 text-yellow-700';
                } else {
                    statusText = `Vence em ${diffDays} dias`;
                    statusClass = 'bg-green-100 text-[var(--success)]';
                }

                let actionsHTML = '';
                if (!isResgatado) {
                    actionsHTML = `
                        <button data-id="${inv.id}" class="resgatado-button text-sm py-1.5 px-3 flex items-center space-x-2 font-semibold rounded-lg transition duration-150 ease-in-out shadow-sm bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-300">
                            <i class="fas fa-check-circle"></i>
                            <span>Resgatado</span>
                        </button>
                        <button data-id="${inv.id}" class="delete-button text-sm py-1.5 px-3 flex items-center space-x-1 font-semibold rounded-lg transition duration-150 ease-in-out shadow-sm bg-[var(--error)] text-white hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-[var(--error)] focus:ring-offset-2">
                            <i class="fas fa-trash-alt"></i>
                            <span>Excluir</span>
                        </button>
                    `;
                }

                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <h4 class="text-lg font-bold">${inv.nome}</h4>
                        <span class="text-xs font-semibold px-3 py-1 rounded-full ${statusClass}">${statusText}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-3 text-sm">
                        <p><span class="font-medium">Investido:</span> <span class="text-[var(--primary)] font-semibold">${formatarMoeda(inv.valor)}</span></p>
                        <p><span class="font-medium">Resgate Est.:</span> <span class="text-[var(--success)] font-semibold">${formatarMoeda(inv.haver)}</span></p>
                        <p><span class="font-medium">Início:</span> ${displayEntrada}</p>
                        <p><span class="font-medium">Resgate:</span> ${displayRetorno}</p>
                    </div>
                    <div class="mt-4 pt-3 border-t flex justify-end space-x-2" style="border-color: var(--border-color);">
                        ${actionsHTML}
                    </div>
                `;
            }
            
            card.querySelector('.delete-button')?.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                showDeleteConfirmation(id);
            });

            card.querySelector('.resgatado-button')?.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                marcarComoResgatado(id);
            });

            card.querySelectorAll('.toggle-switch').forEach(toggle => {
                toggle.addEventListener('click', (e) => {
                    const target = e.currentTarget;
                    const investmentId = parseInt(target.dataset.investmentId);
                    const parcelaIndex = parseInt(target.dataset.parcelaIndex);
                    toggleParcelaQuitada(investmentId, parcelaIndex);
                });
            });

            listEl.appendChild(card);
        });
    }

    function updateSummaryAndChart(investimentos) {
        let totalInvestido = 0;
        let totalHaver = 0;
        const dataForChart = {};

        investimentos.forEach(inv => {
            totalInvestido += inv.valor || 0;
            totalHaver += inv.haver || 0;
            dataForChart[inv.nome] = (dataForChart[inv.nome] || 0) + (inv.valor || 0);
        });

        document.getElementById('totalInvestidoDisplay').textContent = formatarMoeda(totalInvestido);
        document.getElementById('totalHaverDisplay').textContent = formatarMoeda(totalHaver);

        const labels = Object.keys(dataForChart);
        const dataValues = Object.values(dataForChart);
        const backgroundColors = labels.map((_, index) => COLORS[index % COLORS.length]);

        const chartCanvas = document.getElementById('investimentoChart');
        if (!chartCanvas) return; 

        if (investmentChart) {
            investmentChart.data.labels = labels;
            investmentChart.data.datasets[0].data = dataValues;
            investmentChart.data.datasets[0].backgroundColor = backgroundColors;
            investmentChart.update();
        } else {
            const ctx = chartCanvas.getContext('2d');
            investmentChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: backgroundColors,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
                        title: { display: false }
                    }
                }
            });
        }
    }

    window.onload = function () {
        // --- Lógica do Dark Mode ---
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            const themeIcon = themeToggle.querySelector('i');

            const updateThemeIcon = (theme) => {
                if (!themeIcon) return;
                if (theme === 'dark') {
                    themeIcon.classList.remove('fa-moon');
                    themeIcon.classList.add('fa-sun');
                } else {
                    themeIcon.classList.remove('fa-sun');
                    themeIcon.classList.add('fa-moon');
                }
            };

            const toggleTheme = () => {
                const isDark = document.documentElement.classList.toggle('dark');
                const newTheme = isDark ? 'dark' : 'light';
                localStorage.setItem('theme', newTheme);
                updateThemeIcon(newTheme);
            };

            themeToggle.addEventListener('click', toggleTheme);

            // Define o ícone inicial com base no tema atual
            const initialTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            updateThemeIcon(initialTheme);
        }

        initializeSupabase(); 
        setupInactivityListeners();

        // --- Lógica do Modal de Investimento ---
        const investimentoModal = document.getElementById('investimento-modal');
        const openInvestimentoModalBtn = document.getElementById('open-investimento-modal');
        const closeInvestimentoModalBtn = document.getElementById('close-investimento-modal');

        function showInvestimentoModal() {
            if(investimentoModal) {
                investimentoModal.classList.remove('hidden');
                investimentoModal.classList.add('flex');
            }
        }

        function hideInvestimentoModal() {
            if(investimentoModal) {
                investimentoModal.classList.add('hidden');
                investimentoModal.classList.remove('flex');
            }
        }

        if(openInvestimentoModalBtn) openInvestimentoModalBtn.addEventListener('click', showInvestimentoModal);
        if(closeInvestimentoModalBtn) closeInvestimentoModalBtn.addEventListener('click', hideInvestimentoModal);

        if(investimentoModal) {
            investimentoModal.addEventListener('click', (e) => {
                if (e.target === investimentoModal) {
                    hideInvestimentoModal();
                }
            });
        }

        // --- Lógica do Formulário ---
        const returnTypeRadios = document.querySelectorAll('input[name="returnType"]');
        const singleInstallmentFields = document.getElementById('single-installment-fields');
        const multiInstallmentFields = document.getElementById('multi-installment-fields');
        const singleInstallmentRequiredInput = document.getElementById('retorno');
        const multiInstallmentRequiredInput = document.getElementById('primeiraParcela');

        function handleReturnTypeChange(event) {
            const isSingle = event.target.value === 'single';
            singleInstallmentFields.classList.toggle('hidden', !isSingle);
            multiInstallmentFields.classList.toggle('hidden', isSingle);
            singleInstallmentRequiredInput.required = isSingle;
            multiInstallmentRequiredInput.required = !isSingle;

            calcularValoresBidirecionais();
        }

        returnTypeRadios.forEach(radio => radio.addEventListener('change', handleReturnTypeChange));

        document.getElementById('investimentoForm').addEventListener('submit', (e) => {
            e.preventDefault();
            adicionarInvestimento(e).then(() => {
                // Fecha o modal se o investimento for adicionado com sucesso
                const form = document.getElementById('investimentoForm');
                const submitButton = form.querySelector('button[type="submit"]');
                if (!submitButton.disabled) { // Heurística para checar se houve sucesso
                    hideInvestimentoModal();
                }
            });
        });

        const valorEl = document.getElementById('valor');
        const haverEl = document.getElementById('haverEstimado');
        const taxaJurosEl = document.getElementById('taxaJuros');
        const entradaEl = document.getElementById('entrada');
        const retornoEl = document.getElementById('retorno');
        
        valorEl.addEventListener('input', formatarInputMoeda);
        haverEl.addEventListener('input', formatarInputMoeda);

        const fieldsToWatch = [
            valorEl, haverEl, taxaJurosEl, entradaEl, retornoEl,
            document.getElementById('primeiraParcela'),
            document.getElementById('numeroParcelas'),
            document.getElementById('intervaloParcelas'),
            ...document.querySelectorAll('input[name="returnType"]')
        ];
        fieldsToWatch.forEach(el => {
            if (el) {
                el.addEventListener('input', calcularValoresBidirecionais);
                el.addEventListener('change', calcularValoresBidirecionais);
            }
        });

        document.getElementById('cancel-delete').addEventListener('click', hideDeleteConfirmation);
        document.getElementById('confirm-delete').addEventListener('click', () => {
            if (investmentToDeleteId) {
                deletarInvestimento(investmentToDeleteId);
            }
            hideDeleteConfirmation();
        });

        document.getElementById('limpar-form-button').addEventListener('click', () => {
            const form = document.getElementById('investimentoForm');
            form.reset();

            document.getElementById('single-installment-fields').classList.remove('hidden');
            document.getElementById('multi-installment-fields').classList.add('hidden');
            document.getElementById('retorno').required = true;
            document.getElementById('primeiraParcela').required = false;
            document.querySelector('input[name="returnType"][value="single"]').checked = true;

            const resumoContainer = document.getElementById('prazo-resumo-container');
            resumoContainer.innerHTML = `
                <div>
                    <p class="text-sm font-medium" style="color: var(--text-muted);">Prazo Total em Dias:</p>
                    <p id="diasTotaisDisplay" class="font-bold text-lg text-[var(--primary)]">0 Dias</p>
                </div>
            `;
            hideInvestimentoModal(); // Fecha o modal ao limpar
        });

        document.getElementById('auth-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            handleAuth(email, password);
        });
       
        document.getElementById('logout-button').addEventListener('click', handleLogout);
    };
  