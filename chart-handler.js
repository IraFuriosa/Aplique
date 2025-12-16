const COLORS = ['#4f46e5', '#10b981', '#3b82f6', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#f97316'];

let investmentChart = null;

function getChartColors(isDark) {
    const rootStyle = getComputedStyle(document.documentElement);
    return [
        rootStyle.getPropertyValue('--primary').trim(),
        rootStyle.getPropertyValue('--success').trim(),
        '#3b82f6',
        '#f59e0b',
        '#14b8a6',
        '#8b5cf6',
        '#ec4899',
    ];
}

export function destroyChart() {
    if (investmentChart) {
        investmentChart.destroy();
        investmentChart = null;
    }
}

export function renderChart(investimentos) {
    const dataForChart = {};
    investimentos.forEach(inv => {
        if (inv.status !== 'resgatado') { // Only include active investments in chart
            dataForChart[inv.nome] = (dataForChart[inv.nome] || 0) + (inv.valor || 0);
        }
    });

    const labels = Object.keys(dataForChart);
    const dataValues = Object.values(dataForChart);
    const isDark = document.documentElement.classList.contains('dark');
    const backgroundColors = getChartColors(isDark);


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
                    hoverOffset: 4,
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: isDark ? '#f9fafb' : '#111827',
                        }
                    },
                    title: {
                        display: false
                    }
                }
            }
        });
    }
}
