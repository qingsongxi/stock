document.addEventListener('DOMContentLoaded', () => {
    // 确保 getRepoInfoFromURL 函数已经从 script.js 加载并可用
    if (typeof getRepoInfoFromURL !== 'function') {
        console.error("`getRepoInfoFromURL` function not found. Make sure script.js is loaded first.");
        return;
    }

    const { owner, repo } = getRepoInfoFromURL();
    const FEAR_GREED_DATA_URL = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/fear_greed_index.json`;

    // 为情绪评级定义颜色
    const RATING_COLORS = {
        'extreme fear': '#e74c3c',
        'fear': '#f39c12',
        'neutral': '#7f8c8d',
        'greed': '#27ae60',
        'extreme greed': '#2ecc71'
    };

    // [修改] 图表基础样式适配白底波普风格
    const CHART_GRID_COLOR = 'rgba(0, 0, 0, 0.05)'; // 极淡的黑色网格
    const CHART_TICK_COLOR = '#000000';             // 纯黑刻度文字
    const CHART_FONT = { family: 'Poppins', size: 12, weight: '600' }; // 加粗字体

    let fearGreedHistoryChart = null;
    let fearGreedGauge = null;
    let stockStrengthChart = null;
    let stockBreadthChart = null;
    let vixChart = null;

    /**
     * 获取并处理恐慌贪婪指数数据
     */
    async function loadFearGreedData() {
        try {
            const response = await fetch(`${FEAR_GREED_DATA_URL}?t=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            updateSummary(data.fear_and_greed);
            updateComparisonValues(data.fear_and_greed);
            createGaugeChart(data.fear_and_greed);
            createHistoryChart(data.fear_and_greed_historical.data);

            createStrengthChart(data.stock_price_strength);
            createBreadthChart(data.stock_price_breadth);
            createVixChart(data.market_volatility_vix, data.market_volatility_vix_50);

        } catch (error) {
            console.error("Could not load Fear & Greed data:", error);
            const container = document.querySelector('.fear-greed-wrapper-container');
            if (container) {
                container.innerHTML = '<p style="color: #d50000; text-align: center; padding: 20px; font-weight: bold;">恐慌贪婪指数加载失败。</p>';
            }
        }
    }

    /**
     * 更新概览文本字段
     */
    function updateSummary(summaryData) {
        document.getElementById('fg-last-updated').textContent = `数据最后更新于: ${new Date(summaryData.timestamp).toLocaleString()}`;
        document.getElementById('fg-score-value').textContent = summaryData.score.toFixed(1);
        const ratingSpan = document.getElementById('fg-score-rating');
        const ratingText = summaryData.rating;
        ratingSpan.textContent = ratingText.charAt(0).toUpperCase() + ratingText.slice(1);

        // 保持评级本身的颜色，但在白底上可能需要深一点的阴影或描边，这里暂时保持原逻辑
        const ratingColor = RATING_COLORS[ratingText.toLowerCase()] || '#000';
        ratingSpan.style.color = ratingColor;
        // 移除阴影以保持波普的扁平感，或者改用硬阴影
        document.getElementById('fg-score-value').style.textShadow = 'none';
    }

    /**
     * 更新历史对比值卡片
     */
    function updateComparisonValues(summaryData) {
        const updateText = (id, value) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = (typeof value === 'number') ? value.toFixed(1) : 'N/A';
            }
        };

        updateText('fg-prev-close', summaryData.previous_close);
        updateText('fg-prev-week', summaryData.previous_1_week);
        updateText('fg-prev-month', summaryData.previous_1_month);
        updateText('fg-prev-year', summaryData.previous_1_year);
    }

    /**
     * 创建当前分数的仪表盘图
     */
    function createGaugeChart(summaryData) {
        const ctx = document.getElementById('fear-greed-gauge').getContext('2d');
        const score = summaryData.score;

        if (fearGreedGauge) {
            fearGreedGauge.destroy();
        }

        const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
        gradient.addColorStop(0, RATING_COLORS['extreme fear']);
        gradient.addColorStop(0.25, RATING_COLORS['fear']);
        gradient.addColorStop(0.5, RATING_COLORS['neutral']);
        gradient.addColorStop(0.75, RATING_COLORS['greed']);
        gradient.addColorStop(1, RATING_COLORS['extreme greed']);

        fearGreedGauge = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [score, 100 - score],
                    backgroundColor: [gradient, 'rgba(0, 0, 0, 0.1)'], // 未填充部分改为浅黑
                    borderColor: 'transparent',
                    borderWidth: 0,
                    borderRadius: { outerStart: 8, outerEnd: 8, innerStart: 8, innerEnd: 8 },
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                circumference: 180,
                rotation: 270,
                cutout: '75%',
                plugins: { tooltip: { enabled: false }, legend: { display: false } },
                animation: { animateRotate: true, animateScale: false, duration: 1200 }
            }
        });
    }

    /**
     * 创建历史数据折线图
     */
    function createHistoryChart(historyData) {
        const ctx = document.getElementById('fear-greed-history-chart').getContext('2d');

        if (fearGreedHistoryChart) {
            fearGreedHistoryChart.destroy();
        }

        const dataPoints = historyData.map(d => ({ x: d.x, y: d.y, rating: d.rating.toLowerCase() }));

        fearGreedHistoryChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: '指数历史',
                    data: dataPoints,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBorderWidth: 2,
                    pointHoverBorderColor: '#000000', // 悬浮点黑边
                    pointHoverBackgroundColor: '#fff',
                    fill: true,
                    segment: {
                        borderColor: ctx => RATING_COLORS[ctx.p1.raw.rating] || '#000',
                        backgroundColor: ctx => {
                            const chartArea = ctx.chart.chartArea;
                            if (!chartArea) return null;
                            const gradient = ctx.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            const color = RATING_COLORS[ctx.p1.raw.rating] || '#000000';
                            gradient.addColorStop(0, `${color}80`);
                            gradient.addColorStop(1, `${color}05`);
                            return gradient;
                        }
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'month', tooltipFormat: 'yyyy-MM-dd', displayFormats: { month: 'yyyy-MM' } },
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT, maxRotation: 0, autoSkip: true, autoSkipPadding: 20 }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        // [修改] Tooltip 波普风格
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#000000',
                        bodyColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 3,
                        cornerRadius: 0,
                        padding: 15,
                        boxPadding: 4,
                        displayColors: true,
                        titleFont: { family: 'Poppins', weight: '900', size: 14 },
                        bodyFont: { family: 'Poppins', weight: '600', size: 12 },
                        callbacks: {
                            label: function(context) {
                                const rating = context.raw.rating;
                                const value = context.parsed.y;
                                const capitalizedRating = rating.charAt(0).toUpperCase() + rating.slice(1);
                                return `分数: ${value.toFixed(1)} (${capitalizedRating})`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * 创建股价强度历史图表
     */
    function createStrengthChart(strengthData) {
        const ctx = document.getElementById('stock-strength-chart').getContext('2d');
        if (stockStrengthChart) {
            stockStrengthChart.destroy();
        }
        const dataPoints = strengthData.data.map(d => ({ x: d.x, y: d.y, rating: d.rating.toLowerCase() }));

        // 更新评级标签
        const currentRating = strengthData.rating.toLowerCase();
        const badge = document.getElementById('strength-rating-badge');
        if (badge) {
            const color = RATING_COLORS[currentRating] || '#000';
            badge.textContent = strengthData.rating;
            badge.style.borderColor = '#000'; // 强制黑边
            badge.style.backgroundColor = color;
            badge.style.color = '#fff'; // 白字
            badge.style.boxShadow = '2px 2px 0 #000'; // 硬阴影
        }

        stockStrengthChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: '股价强度',
                    data: dataPoints,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBorderWidth: 2,
                    pointHoverBorderColor: '#000000',
                    pointHoverBackgroundColor: '#fff',
                    fill: true,
                    segment: {
                        borderColor: ctx => RATING_COLORS[ctx.p1.raw.rating] || '#000',
                        backgroundColor: ctx => {
                            const chartArea = ctx.chart.chartArea;
                            if (!chartArea) return null;
                            const gradient = ctx.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            const color = RATING_COLORS[ctx.p1.raw.rating] || '#000000';
                            gradient.addColorStop(0, `${color}80`);
                            gradient.addColorStop(1, `${color}05`);
                            return gradient;
                        }
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'month', tooltipFormat: 'yyyy-MM-dd', displayFormats: { month: 'yyyy-MM' } },
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT, maxRotation: 0, autoSkip: true, autoSkipPadding: 20 }
                    },
                    y: {
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        // [修改] Tooltip 波普风格
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#000000',
                        bodyColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 3,
                        cornerRadius: 0,
                        padding: 15,
                        boxPadding: 4,
                        displayColors: true,
                        titleFont: { family: 'Poppins', weight: '900', size: 14 },
                        bodyFont: { family: 'Poppins', weight: '600', size: 12 },
                        callbacks: {
                            label: function(context) {
                                return `强度: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * 创建股价宽度历史图表
     */
    function createBreadthChart(breadthData) {
        const ctx = document.getElementById('stock-breadth-chart').getContext('2d');
        if (stockBreadthChart) {
            stockBreadthChart.destroy();
        }
        const dataPoints = breadthData.data.map(d => ({ x: d.x, y: d.y, rating: d.rating.toLowerCase() }));

        // 更新评级标签
        const currentRating = breadthData.rating.toLowerCase();
        const badge = document.getElementById('breadth-rating-badge');
        if (badge) {
            const color = RATING_COLORS[currentRating] || '#000';
            badge.textContent = breadthData.rating;
            badge.style.borderColor = '#000';
            badge.style.backgroundColor = color;
            badge.style.color = '#fff';
            badge.style.boxShadow = '2px 2px 0 #000';
        }

        stockBreadthChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: '股价宽度',
                    data: dataPoints,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBorderWidth: 2,
                    pointHoverBorderColor: '#000000',
                    pointHoverBackgroundColor: '#fff',
                    fill: true,
                    segment: {
                        borderColor: ctx => RATING_COLORS[ctx.p1.raw.rating] || '#000',
                        backgroundColor: ctx => {
                            const chartArea = ctx.chart.chartArea;
                            if (!chartArea) return null;
                            const gradient = ctx.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            const color = RATING_COLORS[ctx.p1.raw.rating] || '#000000';
                            gradient.addColorStop(0, `${color}80`);
                            gradient.addColorStop(1, `${color}05`);
                            return gradient;
                        }
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'month', tooltipFormat: 'yyyy-MM-dd', displayFormats: { month: 'yyyy-MM' } },
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT, maxRotation: 0, autoSkip: true, autoSkipPadding: 20 }
                    },
                    y: {
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        // [修改] Tooltip 波普风格
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#000000',
                        bodyColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 3,
                        cornerRadius: 0,
                        padding: 15,
                        boxPadding: 4,
                        displayColors: true,
                        titleFont: { family: 'Poppins', weight: '900', size: 14 },
                        bodyFont: { family: 'Poppins', weight: '600', size: 12 },
                        callbacks: {
                            label: function(context) {
                                return `宽度: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * 创建VIX及其50日均线历史图表
     */
    function createVixChart(vixData, vix50Data) {
        const ctx = document.getElementById('vix-chart').getContext('2d');
        if (vixChart) {
            vixChart.destroy();
        }
        const vixDataPoints = vixData.data.map(d => ({ x: d.x, y: d.y, rating: d.rating.toLowerCase() }));
        const vix50DataPoints = vix50Data.data.map(d => ({ x: d.x, y: d.y }));

        // 更新评级标签
        const currentRating = vixData.rating.toLowerCase();
        const badge = document.getElementById('vix-rating-badge');
        if (badge) {
            const color = RATING_COLORS[currentRating] || '#000';
            badge.textContent = vixData.rating;
            badge.style.borderColor = '#000';
            badge.style.backgroundColor = color;
            badge.style.color = '#fff';
            badge.style.boxShadow = '2px 2px 0 #000';
        }

        vixChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'VIX',
                    data: vixDataPoints,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBorderWidth: 2,
                    pointHoverBorderColor: '#000000',
                    pointHoverBackgroundColor: '#fff',
                    fill: true,
                    segment: {
                        borderColor: ctx => RATING_COLORS[ctx.p1.raw.rating] || '#000',
                        backgroundColor: ctx => {
                            const chartArea = ctx.chart.chartArea;
                            if (!chartArea) return null;
                            const gradient = ctx.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            const color = RATING_COLORS[ctx.p1.raw.rating] || '#000000';
                            gradient.addColorStop(0, `${color}80`);
                            gradient.addColorStop(1, `${color}05`);
                            return gradient;
                        }
                    }
                }, {
                    label: '50日移动均线',
                    data: vix50DataPoints,
                    borderColor: 'rgba(0, 0, 0, 0.5)', // [修改] 均线改为半透明黑色
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.4,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'month', tooltipFormat: 'yyyy-MM-dd', displayFormats: { month: 'yyyy-MM' } },
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT, maxRotation: 0, autoSkip: true, autoSkipPadding: 20 }
                    },
                    y: {
                        grid: { color: CHART_GRID_COLOR },
                        ticks: { color: CHART_TICK_COLOR, font: CHART_FONT }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: CHART_TICK_COLOR, // [修改] Legend 黑色
                            font: CHART_FONT,
                            boxWidth: 15,
                            padding: 15
                        }
                    },
                    tooltip: {
                        // [修改] Tooltip 波普风格
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#000000',
                        bodyColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 3,
                        cornerRadius: 0,
                        padding: 15,
                        boxPadding: 4,
                        displayColors: true,
                        titleFont: { family: 'Poppins', weight: '900', size: 14 },
                        bodyFont: { family: 'Poppins', weight: '600', size: 12 }
                    }
                }
            }
        });
    }

    // 初始加载数据
    loadFearGreedData();
});