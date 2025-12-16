export const DIAS_NO_MES = 30.4375;

export function formatarMoeda(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function parseMoedaParaNumero(valorStr) {
     if (!valorStr) return 0;
    return parseFloat(valorStr.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
}

export function calcularHaver(valor, taxaMensal, diasTotais) {
    if (diasTotais <= 0 || valor <= 0 || taxaMensal <= 0) return 0;
    const meses = diasTotais / DIAS_NO_MES;
    const taxaDecimal = taxaMensal / 100;
    return valor * Math.pow(1 + taxaDecimal, meses);
}

export function calcularValorInvestido(haver, taxaMensal, diasTotais) {
    if (diasTotais <= 0 || haver <= 0 || taxaMensal <= 0) return 0;
    const meses = diasTotais / DIAS_NO_MES;
    const taxaDecimal = taxaMensal / 100;
    return haver / Math.pow(1 + taxaDecimal, meses);
}

export function calcularTaxaJuros(valor, haver, diasTotais) {
    if (diasTotais <= 0 || valor <= 0 || haver <= valor) return 0;
    const meses = diasTotais / DIAS_NO_MES;
    if (meses <= 0) return 0;
    const taxaDecimal = Math.pow(haver / valor, 1 / meses) - 1;
    return taxaDecimal * 100;
}

export function calculateSortingDate(inv) {
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
