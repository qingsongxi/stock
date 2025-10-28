document.addEventListener('DOMContentLoaded', () => {
    // 确保 getRepoInfoFromURL 函数已经从 script.js 加载并可用
    if (typeof getRepoInfoFromURL !== 'function') {
        console.error("`getRepoInfoFromURL` function not found. Make sure script.js is loaded first.");
        return;
    }

    const { owner, repo } = getRepoInfoFromURL();
    // !!! 注意: 确认Python脚本输出的文件名是 economic_indicators_10y.json
    const FED_DATA_URL = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/economic_indicators_10y.json`;

    // --- 图表样式常量 ---
    const CHART_GRID_COLOR = 'rgba(138, 153, 192, 0.15)';
    const CHART_TICK_COLOR = '#8a99c0';
    const CHART_FONT = { family: 'Poppins', size: 12 };

    // --- 图表颜色定义 ---
    const INDICATOR_COLORS = {
        // ========== 新增 ==========
        FedBalanceSheet: '#2ecc71',   // 绿色
        // ==========================
        CoreCPI: '#3498db',          // 蓝色
        CorePCE: '#9b59b6',          // 紫色
        UnemploymentRate: '#f1c40f', // 黄色
        ConsumerSentiment: '#e67e22' // 橙色
    };

    // --- 用于存储图表实例 ---
    let chartInstances = {};

    /**
     * 主函数：获取并处理宏观经济数据
     */
    async function loadFedData() {
        try {
            const response = await fetch(`${FED_DATA_URL}?t=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const indicators = data.indicators;

            // 为每个指标创建图表
            // ========== 新增调用 ==========
            if (indicators.FedBalanceSheet) {
                createIndicatorChart('fed-balance-sheet-chart', indicators.FedBalanceSheet, INDICATOR_COLORS.FedBalanceSheet);
            }
            // ==========================
            createIndicatorChart('core-cpi-chart', indicators.CoreCPI, INDICATOR_COLORS.CoreCPI);
            createIndicatorChart('core-pce-chart', indicators.CorePCE, INDICATOR_COLORS.CorePCE);
            createIndicatorChart('unemployment-rate-chart', indicators.UnemploymentRate, INDICATOR_COLORS.UnemploymentRate);
            createIndicatorChart('consumer-sentiment-chart', indicators.ConsumerSentiment, INDICATOR_COLORS.ConsumerSentiment);

        } catch (error) {
            console.error("Could not load FED economic data:", error);
            // 在所有图表容器中显示错误信息
            const chartIds = ['fed-balance-sheet-chart', 'core-cpi-chart', 'core-pce-chart', 'unemployment-rate-chart', 'consumer-sentiment-chart'];
            chartIds.forEach(id => {
                const canvas = document.getElementById(id);
                if (canvas && canvas.getContext) {
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = 'var(--negative-color)';
                    ctx.font = '16px Poppins';
                    ctx.textAlign = 'center';
                    ctx.fillText('数据加载失败', canvas.width / 2, canvas.height / 2);
                }
            });
        }
    }

    /**
     * 创建单个指标的折线图
     * @param {string} canvasId - Canvas元素的ID
     * @param {object} indicatorData - 单个指标的数据对象 (包含 name, unit, data)
     * @param {string} lineColor - 图表线条和渐变的颜色
     */
    function createIndicatorChart(canvasId, indicatorData, lineColor) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`Canvas element with ID '${canvasId}' not found.`);
            return;
        }
        const ctx = canvas.getContext('2d');

        // 如果图表已存在，先销毁
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
        }

        const dataPoints = indicatorData.data.map(d => ({ x: d[0], y: d[1] }));

        const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
        gradient.addColorStop(0, `${lineColor}80`);
        gradient.addColorStop(1, `${lineColor}05`);

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: indicatorData.name,
                    data: dataPoints,
                    borderColor: lineColor,
                    backgroundColor: gradient,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBorderWidth: 2,
                    pointHoverBackgroundColor: '#fff',
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'year',
                            tooltipFormat: 'yyyy-MM-dd',
                            displayFormats: { year: 'yyyy' }
                        },
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT, maxRotation: 0, autoSkip: true }
                    },
                    y: {
                        grid: { color: CHART_GRID_COLOR },
                        ticks: {
                            color: CHART_TICK_COLOR,
                            font: CHART_FONT,
                            callback: function(value) {
                                // 对于百万美元这种大数据，进行格式化
                                if (indicatorData.unit === '百万美元') {
                                    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}T`; // 万亿
                                    if (value >= 1000) return `${(value / 1000).toFixed(0)}B`; // 十亿
                                    return `${value}M`;
                                }
                                return value + indicatorData.unit;
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(29, 36, 58, 0.95)',
                        titleColor: '#00f5d4',
                        bodyColor: '#e0e5f3',
                        borderColor: lineColor,
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                let formattedValue = value.toFixed(2);
                                if (indicatorData.unit === '百万美元') {
                                    // 在Tooltip中显示更精确的万亿数值
                                    formattedValue = `${(value / 1000000).toFixed(3)} 万亿`;
                                }
                                return `${context.dataset.label}: ${formattedValue}${indicatorData.unit === '%' ? '%' : ''}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 初始加载数据
    loadFedData();
});
