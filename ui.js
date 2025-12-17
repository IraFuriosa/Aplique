import { formatarMoeda, parseMoedaParaNumero, calcularHaver, calcularValorInvestido, calcularTaxaJuros, DIAS_NO_MES } from './utils.js';
import { deletarInvestimento, marcarComoResgatado, toggleParcelaQuitada, updateInvestment } from './api.js';
import { getCurrentUserId, getCurrentUserEmail } from './auth.js';

let investmentToDeleteId = null;
let isUpdatingFromValor = false;
let isUpdatingFromHaver = false;
let isUpdatingFromInstallment = false;
let handleAddInvestmentCallback = () => {};

// --- Feedback Toast ---
export function showFeedback(message, type = 'success') {
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

// --- Investment Form Calculations ---

function formatarInputMoeda(e) {
    let value = e.target.value.replace(/\D/g, '');
    let floatValue = parseFloat(value) / 100;
    if (isNaN(floatValue)) floatValue = 0;
    e.target.value = formatarMoeda(floatValue).replace('R$', '').trim();
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
        taxaJurosEl.value = novaTaxa.toFixed(4);
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

    const returnType = document.querySelector('input[name="returnType"]:checked')?.value;
    const entradaInput = document.getElementById('entrada')?.value;
    const numeroParcelasEl = document.getElementById('numeroParcelas');
    const numeroParcelas = numeroParcelasEl ? parseInt(numeroParcelasEl.value) || 0 : 0;
    const intervaloParcelasEl = document.getElementById('intervaloParcelas');
    const intervaloParcelas = intervaloParcelasEl ? parseInt(intervaloParcelasEl.value) || 0 : 0;
    const taxaInput = parseFloat(document.getElementById('taxaJuros')?.value) || 0;
    const valorEl = document.getElementById('valor');
    const haverEl = document.getElementById('haverEstimado');

    let diasTotais = 0;
    const diasParcelas = [];

    if (entradaInput) {
        const dataInicio = new Date(`${entradaInput}T00:00:00`);
        if (returnType === 'single') {
            const retornoEl = document.getElementById('retorno');
            const retornoInput = retornoEl ? retornoEl.value : null;
            if (retornoInput) {
                const dataResgate = new Date(`${retornoInput}T00:00:00`);
                if (dataResgate >= dataInicio) {
                    diasTotais = Math.ceil((dataResgate.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
                }
            }
        } else {
            const primeiraParcelaEl = document.getElementById('primeiraParcela');
            const primeiraParcelaInput = primeiraParcelaEl ? primeiraParcelaEl.value : null;
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

    let valorInvestidoNumerico = parseMoedaParaNumero(valorEl.value);
    let haverNumerico = parseMoedaParaNumero(haverEl.value);

    // Calculate displayed invested value always from haver if possible
    let valorCalculado = 0;
    if (haverNumerico > 0 && taxaInput > 0 && diasTotais > 0) {
        valorCalculado = calcularValorInvestido(haverNumerico, taxaInput, diasTotais);
    }

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

    let valorParcela = 0;
    if (returnType === 'multi' && numeroParcelas > 0 && haverNumerico > 0) {
        valorParcela = haverNumerico / numeroParcelas;
    }

    const resumoContainer = document.getElementById('prazo-resumo-container');
    let htmlContent = '';

    if (returnType === 'single') {
        htmlContent = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-sm font-medium" style="color: var(--text-muted);">Prazo Total em Dias:</p>
                    <p id="diasTotaisDisplay" class="font-bold text-lg text-[var(--primary)]">${diasTotais} Dias</p>
                </div>
                <div>
                    <p class="text-sm font-medium" style="color: var(--text-muted);">Valor Investido Calculado:</p>
                    <p class="font-bold text-lg text-[var(--primary)]">${formatarMoeda(valorCalculado)}</p>
                </div>
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
                <div class="border-t pt-2 mt-2 grid grid-cols-2 gap-4" style="border-color: var(--border-color);">
                    <div>
                        <p class="text-sm font-medium" style="color: var(--text-muted);">Prazo Final:</p>
                        <p id="diasTotaisDisplay" class="font-bold text-lg text-[var(--primary)]">${diasTotais} Dias</p>
                    </div>
                    <div>
                        <p class="text-sm font-medium" style="color: var(--text-muted);">Valor Investido Calculado:</p>
                        <p class="font-bold text-lg text-[var(--primary)]">${formatarMoeda(valorCalculado)}</p>
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


// --- Rendering ---

export function updateSummaryDisplay(investimentos) {
    let totalInvestido = 0;
    let totalHaver = 0;

    investimentos.forEach(inv => {
        // Only count active investments for the summary
        if (inv.status !== 'resgatado') {
            totalInvestido += inv.valor || 0;
            totalHaver += inv.haver || 0;
        }
    });

    document.getElementById('totalInvestidoDisplay').textContent = formatarMoeda(totalInvestido);
    document.getElementById('totalHaverDisplay').textContent = formatarMoeda(totalHaver);
}

export function renderInvestments(investimentos) {
    const listEl = document.getElementById('investimento-list');
    const loadingMessage = document.getElementById('loading-message');
    const singleTemplate = document.getElementById('single-investment-card-template');
    const multiTemplate = document.getElementById('multi-investment-card-template');
    const installmentTemplate = document.getElementById('installment-row-template');

    // Se elementos essenciais não existem, aguarde um pouco e tente novamente
    if (!listEl || !loadingMessage || !singleTemplate || !multiTemplate || !installmentTemplate) {
        setTimeout(() => renderInvestments(investimentos), 100);
        return;
    };
    
    listEl.innerHTML = '';

    if (investimentos.length === 0) {
        loadingMessage.style.display = 'block';
        loadingMessage.textContent = 'Nenhum investimento encontrado. Adicione um novo.';
        return;
    }

    loadingMessage.style.display = 'none';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    investimentos.forEach(inv => {
        const isResgatado = inv.status === 'resgatado';
        let card;

        if (inv.tipo_retorno === 'multi' && inv.numero_parcelas > 0 && inv.data_primeira_parcela) {
            card = multiTemplate.content.cloneNode(true).firstElementChild;

            const diffTime = new Date(inv.sorting_date).getTime() - hoje.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const allPaid = inv.parcelas_quitadas && !inv.parcelas_quitadas.includes(false);
            let statusText, statusClass;

            if (isResgatado) {
                statusText = 'Resgatado'; statusClass = 'bg-gray-200 text-gray-700';
            } else if (allPaid) {
                statusText = 'Finalizado'; statusClass = 'bg-blue-100 text-blue-700';
            } else if (diffDays < 0) {
                statusText = `Vencido há ${Math.abs(diffDays)} dias`; statusClass = 'bg-red-100 text-[var(--error)]';
            } else if (diffDays === 0) {
                statusText = 'Vence Hoje'; statusClass = 'bg-yellow-100 text-yellow-700';
            } else {
                statusText = `Próximo em ${diffDays} dias`; statusClass = 'bg-green-100 text-[var(--success)]';
            }

            card.querySelector('[data-template="nome"]').textContent = inv.nome;
            const userEmailEl = card.querySelector('[data-template="user_email"]');
            if (userEmailEl) {
                userEmailEl.textContent = 'Adicionado por: ' + (inv.user_email || 'Usuário');
            }
            const statusEl = card.querySelector('[data-template="status"]');
            statusEl.textContent = statusText;
            statusEl.className = `text-xs font-semibold px-3 py-1 rounded-full ${statusClass}`;
            
            card.querySelector('[data-template="valor"]').textContent = formatarMoeda(inv.valor);
            card.querySelector('[data-template="haver"]').textContent = formatarMoeda(inv.haver);

            const installmentsContainer = card.querySelector('[data-template="installments"]');
            const valorParcela = (inv.haver || 0) / inv.numero_parcelas;
            const [year, month, day] = inv.data_primeira_parcela.split('-').map(Number);
            const dataPrimeiraParcela = new Date(Date.UTC(year, month - 1, day));

            if(isNaN(dataPrimeiraParcela.getTime())) {
                installmentsContainer.innerHTML = '<p class="text-sm text-[var(--error)]">Data da primeira parcela é inválida.</p>';
            } else {
                 for (let i = 0; i < inv.numero_parcelas; i++) {
                    const installmentRow = installmentTemplate.content.cloneNode(true).firstElementChild;
                    const isQuitada = inv.parcelas_quitadas && inv.parcelas_quitadas[i] === true;
                    
                    const dataParcelaAtual = new Date(dataPrimeiraParcela.getTime());
                    dataParcelaAtual.setUTCDate(dataParcelaAtual.getUTCDate() + ((inv.intervalo_parcelas || 30) * i));
                    
                    installmentRow.querySelector('[data-template="text"]').textContent = `${i + 1}ª Parcela - ${formatarMoeda(valorParcela)}`;
                    installmentRow.querySelector('[data-template="date"]').textContent = `Data: ${dataParcelaAtual.toLocaleDateString('pt-BR', {timeZone: 'UTC'})}`;
                    
                    const toggle = installmentRow.querySelector('.toggle-switch');
                    if (isQuitada) {
                        installmentRow.classList.add('opacity-50', 'line-through');
                        toggle.classList.add('checked');
                    }
                    if(isResgatado){
                        toggle.classList.add('pointer-events-none');
                    }
                    toggle.dataset.investmentId = inv.id;
                    toggle.dataset.parcelaIndex = i;
                    toggle.addEventListener('click', async (e) => {
                        try {
                            await toggleParcelaQuitada(parseInt(e.currentTarget.dataset.investmentId), parseInt(e.currentTarget.dataset.parcelaIndex));
                            showFeedback(`Parcela ${parseInt(e.currentTarget.dataset.parcelaIndex) + 1} atualizada.`, 'info');
                        } catch (error) {
                            showFeedback('Erro ao atualizar o status da parcela.', 'error');
                        }
                    });

                    installmentsContainer.appendChild(installmentRow);
                }
            }
           
            const actionsContainer = card.querySelector('[data-template="actions"]');
            if (isResgatado) {
                actionsContainer.remove();
            } else {
                actionsContainer.querySelector('.resgatado-button').addEventListener('click', async () => {
                    try {
                        await marcarComoResgatado(inv.id);
                        showFeedback('Investimento marcado como resgatado.', 'info');
                    } catch (error) {
                        showFeedback('Erro ao atualizar o status do investimento.', 'error');
                    }
                });
                actionsContainer.querySelector('.postpone-button').addEventListener('click', async () => {
                    try {
                        const [year, month, day] = inv.data_primeira_parcela.split('-').map(Number);
                        const originalDate = new Date(Date.UTC(year, month - 1, day));
                        originalDate.setUTCMonth(originalDate.getUTCMonth() + 1);
                        const newDateString = originalDate.toISOString().split('T')[0];
                        await updateInvestment(inv.id, { data_primeira_parcela: newDateString });
                        showFeedback('Investimento postergado com sucesso!', 'info');
                    } catch (error) {
                        showFeedback('Erro ao postergar o investimento.', 'error');
                    }
                });
                actionsContainer.querySelector('.delete-button').addEventListener('click', () => showDeleteConfirmation(inv.id));
            }

        } else { // Single installment card
            card = singleTemplate.content.cloneNode(true).firstElementChild;
            const dataEntrada = new Date(inv.entrada + 'T00:00:00');
            const dataRetorno = new Date(inv.retorno + 'T00:00:00');
            const diffTime = dataRetorno.getTime() - hoje.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            let statusText, statusClass;

            if (isResgatado) {
                statusText = 'Resgatado'; statusClass = 'bg-gray-200 text-gray-700';
            } else if (isNaN(dataRetorno.getTime())) {
                statusText = 'Data Inválida'; statusClass = 'bg-gray-200 text-gray-700';
            } else if (diffDays < 0) {
                statusText = `Vencido há ${Math.abs(diffDays)} dias`; statusClass = 'bg-red-100 text-[var(--error)]';
            } else if (diffDays === 0) {
                statusText = 'Vence Hoje'; statusClass = 'bg-yellow-100 text-yellow-700';
            } else {
                statusText = `Vence em ${diffDays} dias`; statusClass = 'bg-green-100 text-[var(--success)]';
            }

            card.querySelector('[data-template="nome"]').textContent = inv.nome;
            const userEmailEl = card.querySelector('[data-template="user_email"]');
            if (userEmailEl) {
                userEmailEl.textContent = 'Adicionado por: ' + (inv.user_email || 'Usuário');
            }
            const statusEl = card.querySelector('[data-template="status"]');
            statusEl.textContent = statusText;
            statusEl.className = `text-xs font-semibold px-3 py-1 rounded-full ${statusClass}`;

            card.querySelector('[data-template="valor"]').textContent = formatarMoeda(inv.valor);
            card.querySelector('[data-template="haver"]').textContent = formatarMoeda(inv.haver);
            card.querySelector('[data-template="entrada"]').textContent = !isNaN(dataEntrada.getTime()) ? dataEntrada.toLocaleDateString('pt-BR') : 'Data inválida';
            card.querySelector('[data-template="retorno"]').textContent = !isNaN(dataRetorno.getTime()) ? dataRetorno.toLocaleDateString('pt-BR') : 'Data inválida';
            
            const actionsContainer = card.querySelector('[data-template="actions"]');
            if (isResgatado) {
                actionsContainer.remove();
            } else {
                actionsContainer.querySelector('.resgatado-button').addEventListener('click', async () => {
                    try {
                        await marcarComoResgatado(inv.id);
                        showFeedback('Investimento marcado como resgatado.', 'info');
                    } catch (error) {
                        showFeedback('Erro ao atualizar o status do investimento.', 'error');
                    }
                });
                actionsContainer.querySelector('.postpone-button').addEventListener('click', async () => {
                    try {
                        const originalDate = new Date(inv.retorno + 'T00:00:00');
                        originalDate.setMonth(originalDate.getMonth() + 1);
                        const newDateString = originalDate.toISOString().split('T')[0];
                        await updateInvestment(inv.id, { retorno: newDateString });
                        showFeedback('Investimento postergado com sucesso!', 'info');
                    } catch (error) {
                        showFeedback('Erro ao postergar o investimento.', 'error');
                    }
                });
                actionsContainer.querySelector('.delete-button').addEventListener('click', () => showDeleteConfirmation(inv.id));
            }
        }
        
        if (isResgatado) {
            card.classList.add('opacity-60');
        }
        
        listEl.appendChild(card);
    });
}
export function populateNamesDropdown(nomes) {
    const selectEl = document.getElementById('nomeTipo');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="" disabled selected>Selecione</option>';
    nomes.forEach(item => {
        selectEl.innerHTML += `<option value="${item.nome}">${item.nome}</option>`;
    });
    selectEl.removeAttribute('disabled');
}


// --- Modals ---
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

function showInvestimentoModal() {
    const modal = document.getElementById('investimento-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function hideInvestimentoModal() {
    const modal = document.getElementById('investimento-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}


// --- Event Listeners Setup ---
export function initUI(callbacks) {
    handleAddInvestmentCallback = callbacks.onAddInvestment;

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const themeIcon = themeToggle.querySelector('i');
        const updateThemeIcon = (theme) => {
            if (!themeIcon) return;
            themeIcon.className = theme === 'dark' ? 'fas fa-sun text-lg' : 'fas fa-moon text-lg';
        };
        const toggleTheme = () => {
            const isDark = document.documentElement.classList.toggle('dark');
            const newTheme = isDark ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
            callbacks.onThemeChange(); 
        };
        themeToggle.addEventListener('click', toggleTheme);
        const initialTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        updateThemeIcon(initialTheme);
    }
    
    // Auth Form
    document.getElementById('auth-form').addEventListener('submit', (e) => {
        e.preventDefault();
        callbacks.onLoginSubmit(
            document.getElementById('auth-email').value,
            document.getElementById('auth-password').value
        );
    });
    
    // Logout Button
    document.getElementById('logout-button').addEventListener('click', callbacks.onLogout);

    // Investment Modal
    document.getElementById('open-investimento-modal')?.addEventListener('click', showInvestimentoModal);
    document.getElementById('close-investimento-modal')?.addEventListener('click', hideInvestimentoModal);
    const investimentoModal = document.getElementById('investimento-modal');
    if(investimentoModal) {
        investimentoModal.addEventListener('click', (e) => {
            if (e.target === investimentoModal) hideInvestimentoModal();
        });
    }

    // Delete Modal
    document.getElementById('cancel-delete').addEventListener('click', hideDeleteConfirmation);
    document.getElementById('confirm-delete').addEventListener('click', async () => {
        if (investmentToDeleteId) {
            try {
                await deletarInvestimento(investmentToDeleteId);
                showFeedback('Investimento excluído com sucesso!', 'info');
            } catch (error) {
                showFeedback('Erro ao excluir investimento.', 'error');
            }
        }
        hideDeleteConfirmation();
    });

    // Investment Form
    const form = document.getElementById('investimentoForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Adicionando...';
        
        const returnType = form.returnType.value;
        let dataResgateFinal, primeiraParcela = null, numeroParcelas = null, intervaloParcelas = null;

        if (returnType === 'single') {
            dataResgateFinal = form.retorno?.value;
        } else {
            primeiraParcela = form.primeiraParcela?.value;
            numeroParcelas = parseInt(form.numeroParcelas?.value) || 0;
            intervaloParcelas = parseInt(form.intervaloParcelas?.value) || 0;
            
            if (primeiraParcela && numeroParcelas > 0) {
                const [year, month, day] = primeiraParcela.split('-').map(Number);
                const dataPrimeiraParcela = new Date(Date.UTC(year, month - 1, day));
                const dataUltimaParcela = new Date(dataPrimeiraParcela.getTime());
                dataUltimaParcela.setUTCDate(dataUltimaParcela.getUTCDate() + (intervaloParcelas * (numeroParcelas - 1)));
                dataResgateFinal = dataUltimaParcela.toISOString().split('T')[0];
            } else {
                showFeedback('Para investimentos com múltiplas parcelas, preencha os detalhes das parcelas.', 'error');
                submitButton.disabled = false;
                submitButton.textContent = 'Adicionar Investimento';
                return;
            }
        }
        
        const haverNumerico = parseMoedaParaNumero(form.haverEstimado?.value || '0');

        // Recalcular o valor investido baseado no haver antes da validação
        const taxaInput = parseFloat(form.taxaJuros?.value) || 0;
        let valorCalculado = 0;

        if (returnType === 'single') {
            const entradaInput = form.entrada?.value;
            const retornoInput = form.retorno?.value;
            if (entradaInput && retornoInput && taxaInput > 0 && haverNumerico > 0) {
                const dataInicio = new Date(`${entradaInput}T00:00:00`);
                const dataResgate = new Date(`${retornoInput}T00:00:00`);
                const diasTotais = Math.ceil((dataResgate.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
                if (diasTotais > 0) {
                    valorCalculado = calcularValorInvestido(haverNumerico, taxaInput, diasTotais);
                }
            }
        } else {
            // Para múltiplas parcelas, calcular baseado na última parcela
            if (primeiraParcela && numeroParcelas > 0 && taxaInput > 0 && haverNumerico > 0) {
                const [year, month, day] = primeiraParcela.split('-').map(Number);
                const dataPrimeiraParcela = new Date(Date.UTC(year, month - 1, day));
                const dataUltimaParcela = new Date(dataPrimeiraParcela.getTime());
                dataUltimaParcela.setUTCDate(dataUltimaParcela.getUTCDate() + (intervaloParcelas * (numeroParcelas - 1)));

                const entradaInput = form.entrada?.value;
                if (entradaInput) {
                    const dataInicio = new Date(`${entradaInput}T00:00:00`);
                    const diasTotais = Math.ceil((dataUltimaParcela.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
                    if (diasTotais > 0) {
                        valorCalculado = calcularValorInvestido(haverNumerico, taxaInput, diasTotais);
                    }
                }
            }
        }

        if (haverNumerico <= 0) {
             showFeedback('O valor de Haver Estimado deve ser maior que zero.', 'error');
             submitButton.disabled = false;
             submitButton.textContent = 'Adicionar Investimento';
             return;
        }

        if (valorCalculado <= 0) {
             showFeedback('Não foi possível calcular o valor a investir. Verifique se todos os campos estão preenchidos corretamente.', 'error');
             submitButton.disabled = false;
             submitButton.textContent = 'Adicionar Investimento';
             return;
        }

        const novoInvestimento = {
            nome: form.nomeTipo?.value,
            valor: valorCalculado,
            entrada: form.entrada?.value,
            retorno: dataResgateFinal,
            haver: haverNumerico,
            tipo_retorno: returnType,
            numero_parcelas: numeroParcelas,
            intervalo_parcelas: intervaloParcelas,
            data_primeira_parcela: primeiraParcela,
            parcelas_quitadas: returnType === 'multi' ? Array(numeroParcelas).fill(false) : null,
            status: 'ativo'
        };

        const success = await handleAddInvestmentCallback(novoInvestimento);
        
        submitButton.disabled = false;
        submitButton.textContent = 'Adicionar Investimento';

        if(success) {
            form.reset();
            document.getElementById('diasTotaisDisplay').textContent = '0 Dias';
            document.getElementById('multi-installment-fields').classList.add('hidden');
            document.getElementById('numero-parcelas-field').classList.add('hidden');
            document.getElementById('retorno-field').classList.add('hidden');
            hideInvestimentoModal();
        }
    });

    document.getElementById('limpar-form-button').addEventListener('click', () => {
        form.reset();
        const multiFields = document.getElementById('multi-installment-fields');
        if (multiFields) multiFields.classList.add('hidden');
        const numeroParcelasField = document.getElementById('numero-parcelas-field');
        if (numeroParcelasField) numeroParcelasField.classList.add('hidden');
        const retornoField = document.getElementById('retorno-field');
        if (retornoField) retornoField.classList.add('hidden');
        const valorInvestidoDisplay = document.getElementById('valorInvestidoDisplay');
        if (valorInvestidoDisplay) valorInvestidoDisplay.textContent = 'R$ 0,00';
        const retornoEl = document.getElementById('retorno');
        if (retornoEl) retornoEl.required = true;
        const primeiraParcelaEl = document.getElementById('primeiraParcela');
        if (primeiraParcelaEl) primeiraParcelaEl.required = false;
        const singleRadio = document.querySelector('input[name="returnType"][value="single"]');
        if (singleRadio) singleRadio.checked = true;
        const resumoContainer = document.getElementById('prazo-resumo-container');
        if (resumoContainer) {
            resumoContainer.innerHTML = `
                <div>
                    <p class="text-sm font-medium" style="color: var(--text-muted);">Prazo Total em Dias:</p>
                    <p id="diasTotaisDisplay" class="font-bold text-lg text-[var(--primary)]">0 Dias</p>
                </div>
            `;
        }
        hideInvestimentoModal();
    });

    // Form calculation listeners
    const fieldsToWatch = [
        document.getElementById('valor'), 
        document.getElementById('haverEstimado'), 
        document.getElementById('taxaJuros'), 
        document.getElementById('entrada'), 
        document.getElementById('retorno'),
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
    
    document.getElementById('haverEstimado').addEventListener('input', formatarInputMoeda);
    
    document.querySelectorAll('input[name="returnType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isSingle = e.target.value === 'single';
            document.getElementById('multi-installment-fields').classList.toggle('hidden', isSingle);
            document.getElementById('numero-parcelas-field').classList.toggle('hidden', isSingle);
            const field = document.getElementById('data-direita-field');
            const label = field.querySelector('label');
            const input = field.querySelector('input');
            if (isSingle) {
                label.textContent = 'Data de Resgate Programado';
                input.id = 'retorno';
                document.getElementById('retorno').required = true;
            } else {
                label.textContent = 'Data da Primeira Parcela';
                input.id = 'primeiraParcela';
                document.getElementById('primeiraParcela').required = true;
            }
            calcularValoresBidirecionais();
        });
    });

    // Initialize visibility based on initial checked radio
    const initialValue = document.querySelector('input[name="returnType"]:checked')?.value;
    const isSingle = initialValue === 'single';
    document.getElementById('multi-installment-fields').classList.toggle('hidden', isSingle);
    document.getElementById('numero-parcelas-field').classList.toggle('hidden', isSingle);
    const field = document.getElementById('data-direita-field');
    const label = field.querySelector('label');
    const input = field.querySelector('input');
    if (isSingle) {
        label.textContent = 'Data de Resgate Programado';
        input.id = 'retorno';
        document.getElementById('retorno').required = true;
    } else {
        label.textContent = 'Data da Primeira Parcela';
        input.id = 'primeiraParcela';
    }
    calcularValoresBidirecionais();
}
