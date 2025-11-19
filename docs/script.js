// --- 1. 全局常量与变量 (Global Constants & Variables) ---
function getRepoInfoFromURL() {
  const hostname = window.location.hostname;
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  if (hostname.includes("github.io") && pathParts.length > 0) {
    return { owner: hostname.split(".")[0], repo: pathParts[0] };
  }
  return { owner: "cli117", repo: "stock_monitor" };
}
const { owner, repo } = getRepoInfoFromURL();

const WORKFLOW_FILE_NAME = "run_script.yml";
const CONFIG_FILE_PATH = "config.ini";
const TOKEN_STORAGE_KEY = "github_pat";
const VISIBILITY_STORAGE_KEY = "total_asset_visibility";
let isTotalAssetVisible = true;
let currentTotalAssetValueString = null;
let fileSha = null;
let token = "";
let originalIniLines = [];
let pendingTabSwitch = null;
let portfolioPieChart = null;
let portfolioValueChart = null;

// --- 2. DOM 元素获取 ---
const tabButtons = {
  summary: document.getElementById("tab-summary"),
  positions: document.getElementById("tab-positions"),
  settings: document.getElementById("tab-settings"),
};
const panels = {
  summary: document.getElementById("summary-panel"),
  positions: document.getElementById("positions-panel"),
  settings: document.getElementById("settings-panel"),
};
const editors = {
  positions: document.getElementById("positions-editor"),
  settings: document.getElementById("settings-editor"),
};
const statusMessages = {
  positions: document.getElementById("status-msg-positions"),
  settings: document.getElementById("status-msg-settings"),
  modal: document.getElementById("modal-status-msg"),
};
const modal = {
  backdrop: document.getElementById("modal-backdrop"),
  container: document.getElementById("token-modal"),
  input: document.getElementById("modal-token-input"),
  confirmBtn: document.getElementById("modal-confirm-btn"),
  cancelBtn: document.getElementById("modal-cancel-btn"),
};
const logoutButtons = document.querySelectorAll(".logout-btn");

const historyModal = {
  backdrop: document.getElementById("history-modal-backdrop"),
  container: document.getElementById("history-modal-container"),
  content: document.getElementById("history-table-content"),
};
const totalValueDisplay = document.getElementById("total-value-display");
const returnsDisplayContainer = document.getElementById("returns-display");
const toggleVisibilityBtn = document.getElementById("toggle-visibility-btn");

// --- 3. 初始化入口 (Initialization) ---
document.addEventListener("DOMContentLoaded", () => {
  loadInitialSummary();
  setupEventListeners();
  initializeAuth();
  initializeAssetVisibility();
});

// --- 4. 事件监听设置 (Event Listeners) ---
function setupEventListeners() {
  // Tab 切换
  tabButtons.summary.addEventListener("click", () => switchTab("summary"));
  tabButtons.positions.addEventListener("click", () => requestTabSwitch("positions"));
  tabButtons.settings.addEventListener("click", () => requestTabSwitch("settings"));

  // 弹窗按钮
  modal.confirmBtn.addEventListener("click", handleTokenConfirm);
  modal.cancelBtn.addEventListener("click", hideTokenModal);

  // 操作按钮
  document.getElementById("run-workflow-btn-summary").addEventListener("click", requestRunWorkflow);
  document.getElementById("save-btn-positions").addEventListener("click", savePortfolio);
  document.getElementById("save-btn-settings").addEventListener("click", savePortfolio);
  document.getElementById("force-refresh-btn").addEventListener("click", forceRefreshPage);

  logoutButtons.forEach((btn) => btn.addEventListener("click", handleLogout));

  // 历史表格弹窗
  historyModal.backdrop.addEventListener("click", (e) => {
    if (e.target === historyModal.backdrop) hideHistoryTable();
  });
  totalValueDisplay.addEventListener("click", showHistoryTable);

  toggleVisibilityBtn.addEventListener("click", toggleAssetVisibility);
}

// --- 5. 核心业务逻辑函数 ---

// [功能 1] 总资产可见性与动效
function initializeAssetVisibility() {
  const savedState = localStorage.getItem(VISIBILITY_STORAGE_KEY);
  isTotalAssetVisible = savedState === "hidden" ? false : true;
  updateAssetVisibilityIcon();

  if (currentTotalAssetValueString) {
      if (isTotalAssetVisible) {
          totalValueDisplay.textContent = currentTotalAssetValueString;
      } else {
          totalValueDisplay.textContent = "¥€$#@&!!";
      }
  }
}

function toggleAssetVisibility() {
  isTotalAssetVisible = !isTotalAssetVisible;
  localStorage.setItem(VISIBILITY_STORAGE_KEY, isTotalAssetVisible ? "visible" : "hidden");
  updateAssetDisplay();
}

function playCipherAnimation(element, targetText) {
    const chars = "¥€$@#%&*!?<>[]{}+=~^/\\";
    let iterations = 0;

    if (element.dataset.intervalId) clearInterval(parseInt(element.dataset.intervalId));

    const interval = setInterval(() => {
      element.textContent = targetText
        .split("")
        .map((letter, index) => {
          if (index < iterations) return targetText[index];
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join("");

      if (iterations >= targetText.length) {
        clearInterval(interval);
        element.textContent = targetText;
      }

      iterations += 1 / 2;
    }, 30);

    element.dataset.intervalId = interval;
}

function updateAssetDisplay() {
  updateAssetVisibilityIcon();
  if (!currentTotalAssetValueString) return;

  let targetString = "";
  if (isTotalAssetVisible) {
    targetString = currentTotalAssetValueString;
  } else {
    const patterns = ["$LOCKED$", "¥€$#@&!!", "NO.PEEK!", "Unknown", "//SECURE"];
    targetString = patterns[Math.floor(Math.random() * patterns.length)];
  }
  playCipherAnimation(totalValueDisplay, targetString);
}

function updateAssetVisibilityIcon() {
  if (isTotalAssetVisible) {
    toggleVisibilityBtn.classList.remove("fa-eye-slash");
    toggleVisibilityBtn.classList.add("fa-eye");
  } else {
    toggleVisibilityBtn.classList.remove("fa-eye");
    toggleVisibilityBtn.classList.add("fa-eye-slash");
  }
}

// [功能 2] 初始加载
async function loadInitialSummary() {
  const csvUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/portfolio_details_history.csv`;
  const lastUpdatedTime = document.getElementById("last-updated-time");
  const timestamp = new Date().getTime();

  loadReturnsData();
  createPortfolioPieChart();
  createPortfolioValueChart();

  try {
    const response = await fetch(`${csvUrl}?t=${timestamp}`);
    if (!response.ok) throw new Error(`无法加载 CSV: ${response.statusText}`);

    const csvText = await response.text();
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) throw new Error("CSV 文件内容不正确。");

    const headers = lines[0].split(",");
    const latestDataLine = lines[1].split(",");
    const totalValueIndex = headers.indexOf("total_value");
    const dateIndex = headers.indexOf("date");

    if (totalValueIndex === -1) throw new Error('CSV 中未找到 "total_value" 列。');
    if (dateIndex === -1) throw new Error('CSV 中未找到 "date" 列。');

    const latestTotalValue = parseFloat(latestDataLine[totalValueIndex]);
    if (isNaN(latestTotalValue)) throw new Error('最新的 "total_value" 无效。');

    currentTotalAssetValueString = `$${latestTotalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    updateAssetDisplay();
    lastUpdatedTime.textContent = latestDataLine[dateIndex];
  } catch (error) {
    console.error("加载资产概览失败:", error);
    totalValueDisplay.textContent = "Error";
    currentTotalAssetValueString = "Error";
    updateAssetDisplay();
    totalValueDisplay.style.color = "red";
  }
}

// [功能 3] 历史弹窗 (修复版)
async function showHistoryTable() {
  document.body.classList.add("modal-open");
  historyModal.backdrop.classList.remove("hidden");
  historyModal.container.classList.remove("hidden");

  requestAnimationFrame(() => {
    historyModal.backdrop.classList.add("is-active");
    historyModal.container.classList.add("is-active");
  });

  historyModal.content.innerHTML = `
      <div class="pop-modal-wrapper">
          <div class="pop-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 3px solid #000; padding-bottom: 10px;">
              <h3 style="margin: 0; font-weight: 900; text-transform: uppercase;">历史数据归档</h3>
              <button id="history-close-btn" class="neon-btn red-btn" style="padding: 5px 15px; font-size: 12px;">关闭 [X]</button>
          </div>
          <div class="pop-modal-body" style="max-height: 60vh; overflow-y: auto;">
              <p style="text-align:center; padding: 20px;">正在加载数据...</p>
          </div>
      </div>
  `;

  document.getElementById("history-close-btn").addEventListener("click", hideHistoryTable);

  try {
    const csvUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/portfolio_details_history.csv`;
    const timestamp = new Date().getTime();
    const response = await fetch(`${csvUrl}?t=${timestamp}`);
    if (!response.ok) throw new Error(`状态: ${response.status}`);

    const csvText = await response.text();
    const tableHtml = parseCsvToHtmlTable(csvText);
    historyModal.content.querySelector(".pop-modal-body").innerHTML = tableHtml;
  } catch (error) {
    console.error("加载历史数据失败:", error);
    historyModal.content.querySelector(".pop-modal-body").innerHTML = `<div class="status-error" style="display:block; margin: 20px;">加载失败: ${error.message}</div>`;
  }
}

function hideHistoryTable() {
  document.body.classList.remove("modal-open");
  historyModal.backdrop.classList.remove("is-active");
  historyModal.container.classList.remove("is-active");
  setTimeout(() => {
      historyModal.backdrop.classList.add("hidden");
      historyModal.container.classList.add("hidden");
  }, 300);
}

function parseCsvToHtmlTable(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length === 0) return "<p>没有历史数据。</p>";
  let html = '<table class="history-table pop-table">';
  const headers = lines[0].split(",");
  html += "<thead><tr>";
  headers.forEach((header) => html += `<th>${header.trim().replace(/_/g, " ")}</th>`);
  html += "</tr></thead><tbody>";
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = lines[i].split(",");
    html += "<tr>";
    cells.forEach((cell) => {
      const trimmed = cell.trim();
      const num = Number(trimmed);
      if (!isNaN(num) && trimmed.includes(".")) {
        html += `<td>${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
      } else {
        html += `<td>${trimmed}</td>`;
      }
    });
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

// --- 6. 图表相关函数 ---

// 饼图
async function createPortfolioPieChart() {
  const assetsUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/portfolio_assets_returns.json`;
  const timestamp = new Date().getTime();
  try {
    const response = await fetch(`${assetsUrl}?t=${timestamp}`);
    if (!response.ok) throw new Error("Failed to load assets data");
    const assetsData = await response.json();
    const portfolioReturns = assetsData.portfolio_returns;
    const totalValue = Object.values(portfolioReturns).reduce((sum, asset) => sum + asset.total_value, 0);
    const filteredAssets = Object.entries(portfolioReturns).filter(([s, d]) => (d.total_value / totalValue) >= 0.001);
    const labels = filteredAssets.map(([s]) => s);
    const values = filteredAssets.map(([, d]) => d.total_value);
    const assetsInfo = Object.fromEntries(filteredAssets);
    const colors = generateThemeColors(labels.length);
    const ctx = document.getElementById("portfolio-pie-chart").getContext("2d");
    if (portfolioPieChart) portfolioPieChart.destroy();

    portfolioPieChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels: labels,
        datasets: [{
            data: values,
            backgroundColor: colors,
            borderColor: "#000000", borderWidth: 2,
            hoverOffset: 12, hoverBorderWidth: 3, hoverBorderColor: "#000000",
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { animateRotate: true, animateScale: true },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              padding: 20, usePointStyle: true, pointStyle: "circle",
              font: { family: "Poppins", size: 11, weight: "700" }, color: "#000000", boxWidth: 12, boxHeight: 12,
            },
          },
          tooltip: {
            enabled: true, backgroundColor: "rgba(255, 255, 255, 0.9)",
            titleColor: "#000000", bodyColor: "#000000", borderColor: "#000000", borderWidth: 3, cornerRadius: 0,
            displayColors: true, boxPadding: 4,
            titleFont: { family: "Poppins", size: 14, weight: "900" },
            bodyFont: { family: "Poppins", size: 12, weight: "600" },
            padding: 15,
            callbacks: {
              title: (context) => context[0].label,
              label: (context) => {
                const symbol = context.label;
                const value = context.parsed;
                const percentage = (value / totalValue) * 100;
                const assetData = assetsInfo[symbol];
                const lines = [`价值: $${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, `占比: ${percentage.toFixed(2)}%`];
                if (symbol !== "CASH" && assetData && assetData.returns) {
                  lines.push("", "涨跌幅:");
                  const returnLabels = { previous_trading_day: "上一个交易日", week_to_date: "本周至今", month_to_date: "本月至今", year_to_date: "本年至今" };
                  for (const key in returnLabels) {
                    if (assetData.returns.hasOwnProperty(key)) lines.push(`  ${returnLabels[key]}: ${assetData.returns[key].toFixed(2)}%`);
                  }
                } else if (symbol === "CASH") lines.push("", "💰 现金资产 (无涨跌幅)");
                return lines;
              },
            },
          },
        },
      },
    });
  } catch (error) { console.error("Pie Chart Error", error); }
}

// 堆叠图
async function createPortfolioValueChart() {
  const historyUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/portfolio_details_history.csv`;
  const timestamp = new Date().getTime();
  const STORAGE_KEY = "portfolio_chart_settings";
  let chartSettings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"simpleTooltip": false}');
  let shimmerAnimationId = null;
  let shimmerPosition = 0;

  try {
    const response = await fetch(`${historyUrl}?t=${timestamp}`);
    if (!response.ok) throw new Error(`无法加载历史数据`);
    const csvText = await response.text();
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return;

    const headers = lines.shift().split(",");
    const dataRows = lines.reverse();
    const assetColumns = headers.filter((h) => h !== "date" && h !== "total_value");
    const themeColorsHex = generateThemeColors(assetColumns.length);
    const originalColorsRgba = themeColorsHex.map((color) => toRgba(color, 0.85));
    let lastHoveredIndex = null;
    let isHoveringLegend = false;

    const datasets = assetColumns.map((asset, index) => ({
      label: asset, data: [],
      backgroundColor: (context) => {
        const chart = context.chart;
        const { ctx, chartArea } = chart;
        if (!chartArea) return originalColorsRgba[index];
        if (context.datasetIndex === lastHoveredIndex) {
          const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
          const baseColor = originalColorsRgba[index];
          gradient.addColorStop(0, baseColor);
          gradient.addColorStop(Math.min(1, shimmerPosition), "rgba(255, 255, 255, 0.6)");
          gradient.addColorStop(1, baseColor);
          return gradient;
        }
        return originalColorsRgba[index];
      },
      borderColor: "#000000", borderWidth: 1, fill: "origin", stack: "combined",
      pointRadius: 0, pointHoverRadius: 6, tension: 0.4,
    }));

    datasets.push({
      label: "Total Value", data: [], type: "line", fill: false, order: -1,
      borderColor: "#000000", backgroundColor: "transparent", borderWidth: 3, borderDash: [5, 5],
      pointRadius: 0, pointHoverRadius: 6, tension: 0.4,
    });

    const labels = [];
    const assetData = Object.fromEntries(assetColumns.map((asset) => [asset, []]));
    const totalValueData = [];

    dataRows.forEach((row) => {
      const values = row.split(",");
      if (values.length !== headers.length) return;
      labels.push(values[headers.indexOf("date")]);
      totalValueData.push(parseFloat(values[headers.indexOf("total_value")]) || 0);
      assetColumns.forEach((asset) => {
        let valStr = values[headers.indexOf(asset)];
        let val = valStr ? parseFloat(valStr.match(/\(([^|]+)/)?.[1] || valStr) : 0;
        assetData[asset].push(val < 0 ? 0 : val);
      });
    });

    datasets.forEach((ds) => {
      if (ds.label === "Total Value") ds.data = totalValueData;
      else ds.data = assetData[ds.label];
    });

    const ctx = document.getElementById("portfolio-value-chart").getContext("2d");
    if (portfolioValueChart) portfolioValueChart.destroy();

    const shimmerLoop = () => {
      shimmerPosition = (shimmerPosition + 0.01) % 1.5;
      if (portfolioValueChart) portfolioValueChart.update("none");
      shimmerAnimationId = requestAnimationFrame(shimmerLoop);
    };
    const highlightDataset = (targetIndex) => {
      if (targetIndex === lastHoveredIndex) return;
      lastHoveredIndex = targetIndex;
      if (shimmerAnimationId) { cancelAnimationFrame(shimmerAnimationId); shimmerAnimationId = null; }
      if (targetIndex !== null) { shimmerPosition = 0; shimmerLoop(); }
      else if (portfolioValueChart) portfolioValueChart.update("none");
    };

    portfolioValueChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          title: { display: false },
          legend: {
            display: true, position: "bottom",
            labels: {
              padding: 15, usePointStyle: true, pointStyle: "circle", color: "#000000",
              font: { family: "Poppins", size: 11, weight: "700" },
              filter: (item) => item.text !== "Total Value",
              generateLabels: (chart) => {
                 return chart.data.datasets.filter(ds => ds.label !== 'Total Value').map((ds, i) => ({
                    text: ds.label, fillStyle: originalColorsRgba[i],
                    strokeStyle: i === lastHoveredIndex ? "#000000" : "transparent",
                    lineWidth: i === lastHoveredIndex ? 2.5 : 0,
                    hidden: false, index: i, fontColor: "#000000",
                    fontSize: i === lastHoveredIndex ? 13 : 11,
                    fontStyle: i === lastHoveredIndex ? "900" : "700", pointStyle: "circle"
                 }));
              }
            },
            onHover: (e, item) => { isHoveringLegend = true; highlightDataset(item.index); },
            onLeave: () => { isHoveringLegend = false; highlightDataset(null); }
          },
          tooltip: {
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            titleColor: "#000000", bodyColor: "#000000", borderColor: "#000000",
            borderWidth: 3, cornerRadius: 0, padding: 15, displayColors: true, boxPadding: 4,
            titleFont: { family: "Poppins", weight: "900", size: 14 },
            bodyFont: { family: "Poppins", weight: "600", size: 12 },
            filter: (item) => chartSettings.simpleTooltip ? item.dataset.label === "Total Value" : (item.raw > 0),
            callbacks: {
              label: (context) => `${context.dataset.label || ''}: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(context.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { color: "rgba(0, 0, 0, 0.05)" }, ticks: { color: "#000000", font: { weight: "600" } } },
          y: { stacked: true, grid: { color: "rgba(0, 0, 0, 0.05)" }, ticks: { color: "#000000", callback: (v) => (v / 1000).toFixed(0) + "k" } }
        }
      }
    });
    createChartSettingsUI(chartSettings, STORAGE_KEY);

    const canvas = document.getElementById("portfolio-value-chart");
    canvas.addEventListener("mousemove", (event) => {
        if (!portfolioValueChart || isHoveringLegend) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const chartArea = portfolioValueChart.chartArea;
        if (!chartArea || x < chartArea.left || x > chartArea.right) {
            canvas.style.cursor = "default"; highlightDataset(null); return;
        }
        const points = portfolioValueChart.getElementsAtEventForMode(event, 'index', { intersect: false }, true);
        canvas.style.cursor = points.length ? "pointer" : "default";
    });
  } catch (error) { console.error(error); }
}

function createChartSettingsUI(chartSettings, storageKey) {
  const container = document.querySelector(".value-chart-container");
  const existingUI = container.querySelector(".chart-settings-wrapper");
  if (existingUI) existingUI.remove();
  const wrapper = document.createElement("div");
  wrapper.className = "chart-settings-wrapper";
  const gearButton = document.createElement("button");
  gearButton.className = "chart-settings-gear";
  gearButton.innerHTML = '<i class="fas fa-cog"></i>';
  const panel = document.createElement("div");
  panel.className = "chart-settings-panel";
  panel.innerHTML = `
        <div class="settings-panel-header"><span>图表设置</span><button class="settings-close-btn"><i class="fas fa-times"></i></button></div>
        <div class="settings-panel-body"><label class="settings-option"><input type="checkbox" id="simple-tooltip-checkbox" ${chartSettings.simpleTooltip ? "checked" : ""}><span class="settings-option-label"><strong>简化提示框</strong></span></label></div>`;
  wrapper.append(gearButton, panel);
  container.appendChild(wrapper);
  let isPanelOpen = false;
  gearButton.onclick = (e) => { e.stopPropagation(); isPanelOpen = !isPanelOpen; panel.classList.toggle("active", isPanelOpen); };
  panel.querySelector(".settings-close-btn").onclick = () => { isPanelOpen = false; panel.classList.remove("active"); };
  panel.querySelector("#simple-tooltip-checkbox").onchange = (e) => {
    chartSettings.simpleTooltip = e.target.checked;
    localStorage.setItem(storageKey, JSON.stringify(chartSettings));
    createPortfolioValueChart();
    showToast(e.target.checked ? "已切换到简化模式 📉" : "已切换到详细模式 📊");
  };
}

// 辅助：颜色与转换
function generateThemeColors(count) {
  const baseColors = ["#00f5d4", "#6a82fb", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#dda0dd", "#98d8c8", "#f7dc6f", "#bb8fce", "#85c1e9", "#f8c471", "#82e0aa", "#f1948a", "#d7bde2"];
  if (count <= baseColors.length) return baseColors.slice(0, count);
  const colors = [...baseColors];
  for (let i = baseColors.length; i < count; i++) {
    const hue = (i * 137.508) % 360;
    colors.push(`hsl(${hue}, 50%, 60%)`);
  }
  return colors;
}
function toRgba(hex, alpha = 1) {
  const hexValue = hex.replace("#", "");
  const r = parseInt(hexValue.substring(0, 2), 16);
  const g = parseInt(hexValue.substring(2, 4), 16);
  const b = parseInt(hexValue.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function showToast(message) {
  const existingToast = document.querySelector(".chart-toast");
  if (existingToast) existingToast.remove();
  const toast = document.createElement("div");
  toast.className = "chart-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3000);
}

// --- 7. 认证与文件操作 (Auth & File Ops) ---

async function loadReturnsData() {
  const returnsUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/portfolio_return.json`;
  const timestamp = new Date().getTime();
  returnsDisplayContainer.innerHTML = '<p style="font-size: 14px; color: #6a737d;">正在加载收益率...</p>';
  try {
    const response = await fetch(`${returnsUrl}?t=${timestamp}`);
    if (!response.ok) throw new Error(`无法加载收益率文件`);
    const returnsData = await response.json();
    if (!Array.isArray(returnsData) || returnsData.length === 0) {
      returnsDisplayContainer.innerHTML = '<p style="font-size: 14px; color: #6a737d;">暂无收益率数据。</p>';
      return;
    }
    returnsDisplayContainer.innerHTML = "";
    returnsData.forEach((item) => {
      const { period, return: returnValue, profit, growth } = item;
      const itemDiv = document.createElement("div");
      itemDiv.className = "return-item";
      itemDiv.setAttribute('data-tilt', '');
      itemDiv.setAttribute('data-tilt-scale', '1.05');
      const periodLabel = document.createElement("span");
      periodLabel.className = "return-label";
      periodLabel.textContent = period;
      itemDiv.appendChild(periodLabel);
      const createValueSpan = (value, isPercent) => {
        const span = document.createElement("span");
        const sign = value > 0 ? "+" : "";
        let text = isPercent ? `${sign}${(value * 100).toFixed(2)}%` : `${sign}${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
        span.textContent = text;
        if (value > 0) span.classList.add("positive");
        else if (value < 0) span.classList.add("negative");
        return span;
      };
      const returnValueSpan = createValueSpan(returnValue, true);
      returnValueSpan.classList.add("return-value");
      itemDiv.appendChild(returnValueSpan);
      const profitDiv = document.createElement("div");
      profitDiv.className = "detail-line";
      profitDiv.innerHTML = `<span class="detail-label">盈利</span>`;
      const profitValueSpan = createValueSpan(profit, false);
      profitValueSpan.classList.add("detail-value");
      profitDiv.appendChild(profitValueSpan);
      itemDiv.appendChild(profitDiv);
      const growthDiv = document.createElement("div");
      growthDiv.className = "detail-line";
      growthDiv.innerHTML = `<span class="detail-label">增值</span>`;
      const growthValueSpan = createValueSpan(growth, false);
      growthValueSpan.classList.add("detail-value");
      growthDiv.appendChild(growthValueSpan);
      itemDiv.appendChild(growthDiv);
      returnsDisplayContainer.appendChild(itemDiv);
    });
  } catch (error) {
    console.error("加载收益率数据失败:", error);
    returnsDisplayContainer.innerHTML = `<p style="font-size: 14px; color: #d73a49;">收益率加载失败</p>`;
  }
}

function initializeAuth() {
  const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (storedToken) loadDataWithToken(storedToken, true);
}

function handleLogout() {
  if (confirm("您确定要清除授权并退出登录吗？")) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    token = ""; fileSha = null; window.location.reload();
  }
}

function switchTab(tabKey) {
  Object.values(tabButtons).forEach((btn) => btn.classList.remove("active"));
  Object.values(panels).forEach((panel) => panel.classList.remove("active"));
  tabButtons[tabKey].classList.add("active");
  panels[tabKey].classList.add("active");
}

function requestTabSwitch(tabKey) {
  if (token) switchTab(tabKey);
  else { pendingTabSwitch = tabKey; showTokenModal(); }
}

function showTokenModal(message = "", isError = false) {
  updateStatus(message, isError, "modal");
  modal.backdrop.classList.remove("hidden");
  modal.container.classList.remove("hidden");
  modal.input.focus();
}

function hideTokenModal() {
  modal.backdrop.classList.add("hidden");
  modal.container.classList.add("hidden");
  modal.input.value = "";
  pendingTabSwitch = null;
}

async function handleTokenConfirm() {
  const inputToken = modal.input.value.trim();
  if (!inputToken) return showTokenModal("Token 不能为空。", true);
  updateStatus("正在验证...", false, "modal");
  loadDataWithToken(inputToken);
}

async function loadDataWithToken(tokenToValidate, isAutoAuth = false) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${CONFIG_FILE_PATH}`, {
      headers: { Authorization: `token ${tokenToValidate}` },
    });
    if (!response.ok) {
      if (isAutoAuth) { localStorage.removeItem(TOKEN_STORAGE_KEY); setLoggedInUI(false); return; }
      throw new Error(response.statusText);
    }
    token = tokenToValidate;
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setLoggedInUI(true);
    const data = await response.json();
    fileSha = data.sha;
    const content = decodeURIComponent(escape(atob(data.content)));
    originalIniLines = content.split("\n");
    displayPortfolio(originalIniLines);
    if (!isAutoAuth) { hideTokenModal(); if (pendingTabSwitch) switchTab(pendingTabSwitch); }
  } catch (error) {
    console.error(error);
    if (!isAutoAuth) showTokenModal(`验证失败: ${error.message}`, true);
    setLoggedInUI(false);
  }
}

function setLoggedInUI(isLoggedIn) {
    if (isLoggedIn) logoutButtons.forEach((btn) => btn.classList.remove("hidden"));
    else logoutButtons.forEach((btn) => btn.classList.add("hidden"));
}

async function savePortfolio() {
  if (!token || !fileSha) return alert("错误: 授权信息丢失");
  const activePanelKey = panels.positions.classList.contains("active") ? "positions" : "settings";
  updateStatus("保存中...", false, activePanelKey);
  const newContent = buildIniStringFromUI();
  const newContentBase64 = btoa(unescape(encodeURIComponent(newContent)));
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${CONFIG_FILE_PATH}`, {
      method: "PUT",
      headers: { Authorization: `token ${token}` },
      body: JSON.stringify({ message: `Update ${CONFIG_FILE_PATH}`, content: newContentBase64, sha: fileSha }),
    });
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    fileSha = data.content.sha;
    originalIniLines = newContent.split("\n");
    updateStatus("保存成功！", false, activePanelKey);
  } catch (error) {
    console.error(error);
    updateStatus(`保存失败: ${error.message}`, true, activePanelKey);
  }
}

async function requestRunWorkflow() {
  if (!token) return showTokenModal("需要授权");
  runWorkflow();
}

async function runWorkflow() {
  alert("即将触发云端分析...");
  try {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE_NAME}/dispatches`, {
      method: "POST",
      headers: { Authorization: `token ${token}` },
      body: JSON.stringify({ ref: "main" }),
    });
  } catch (error) {
    console.error(error);
  }
}

// --- UI 生成相关 (OptionsPortfolio 恢复) ---
function displayPortfolio(lines) {
  editors.positions.innerHTML = "";
  editors.settings.innerHTML = "";
  let currentSection = null;

  lines.forEach((line, index) => {
    const processedLine = line.split("#")[0].trim();
    if (processedLine.startsWith("[") && processedLine.endsWith("]")) {
      currentSection = processedLine.substring(1, processedLine.length - 1);
      if (currentSection === "Proxy") return;

      const sectionDiv = document.createElement("div");
      sectionDiv.className = "portfolio-section";
      sectionDiv.innerHTML = `<h3>${currentSection}</h3>`;
      const targetEditor = ["Portfolio", "OptionsPortfolio", "Cash"].includes(currentSection) ? editors.positions : editors.settings;

      if (["Portfolio", "OptionsPortfolio"].includes(currentSection)) {
        const addBtn = document.createElement("button");
        addBtn.textContent = "＋ 新增一行";
        addBtn.className = "add-btn";
        addBtn.onclick = function () { addNewRow(this.parentElement); };
        sectionDiv.appendChild(addBtn);
      }
      targetEditor.appendChild(sectionDiv);
    } else if (currentSection && processedLine.includes("=")) {
      const targetEditor = ["Portfolio", "OptionsPortfolio", "Cash"].includes(currentSection) ? editors.positions : editors.settings;
      const sectionDiv = Array.from(targetEditor.querySelectorAll(".portfolio-section h3"))
        .find((h3) => h3.textContent === currentSection)?.parentElement;
      if (!sectionDiv) return;

      const [key, value] = processedLine.split("=").map((s) => s.trim());
      if (!key) return;

      let itemDiv;
      if (key === "data_source") {
        const commentLine = index > 0 ? lines[index - 1].trim() : "";
        const options = commentLine.match(/\d+\s*:\s*.*?(?=\s+\d+:|$)/g);
        itemDiv = document.createElement("div");
        itemDiv.className = "portfolio-item-static";
        const label = document.createElement("label"); label.textContent = key;
        if (options) {
          const select = document.createElement("select");
          select.className = "data-source-select";
          options.forEach((opt) => {
            const firstColon = opt.indexOf(":");
            const num = opt.substring(0, firstColon).trim();
            const desc = opt.substring(firstColon + 1).trim();
            const optionEl = document.createElement("option");
            optionEl.value = num; optionEl.textContent = desc;
            if (num === value) optionEl.selected = true;
            select.appendChild(optionEl);
          });
          itemDiv.append(label, select);
        } else {
          const input = document.createElement("input");
          input.type = "text"; input.value = value;
          itemDiv.append(label, input);
        }
      } else if (currentSection === "OptionsPortfolio") {
        const parts = key.split("_");
        if (parts.length === 4) itemDiv = createOptionRowUI(parts[0], parts[1], parts[2], parts[3], value);
      } else if (currentSection === "Portfolio") {
        itemDiv = document.createElement("div");
        itemDiv.className = "portfolio-item";
        const keyInput = document.createElement("input"); keyInput.className = "key-input"; keyInput.value = key;
        const valueInput = document.createElement("input"); valueInput.className = "value-input"; valueInput.value = value;
        const removeBtn = document.createElement("button"); removeBtn.className = "remove-btn"; removeBtn.textContent = "删除";
        removeBtn.onclick = () => itemDiv.remove();
        itemDiv.append(keyInput, valueInput, removeBtn);
      } else {
        itemDiv = document.createElement("div"); itemDiv.className = "portfolio-item-static";
        const label = document.createElement("label"); label.textContent = key;
        const input = document.createElement("input"); input.value = value;
        itemDiv.append(label, input);
      }
      if (itemDiv) sectionDiv.insertBefore(itemDiv, sectionDiv.querySelector(".add-btn") || null);
    }
  });
}

function createOptionRowUI(ticker = "", date = "", strike = "", type = "CALL", quantity = "") {
  const itemDiv = document.createElement("div");
  itemDiv.className = "option-item-row";
  const tickerInput = document.createElement("input");
  tickerInput.type = "text"; tickerInput.placeholder = "Ticker"; tickerInput.className = "option-ticker-input"; tickerInput.value = ticker;
  const dateInput = document.createElement("input");
  dateInput.type = "date"; dateInput.className = "option-date-select"; dateInput.value = date;
  const strikeInput = document.createElement("input");
  strikeInput.type = "number"; strikeInput.placeholder = "Strike"; strikeInput.className = "option-strike-input"; strikeInput.value = strike;
  const typeSelect = document.createElement("select");
  typeSelect.className = "option-type-select";
  ["CALL", "PUT"].forEach((t) => {
    const option = document.createElement("option");
    option.value = t; option.textContent = t;
    if (t.toUpperCase() === type.toUpperCase()) option.selected = true;
    typeSelect.appendChild(option);
  });
  const valueInput = document.createElement("input");
  valueInput.type = "text"; valueInput.placeholder = "数量"; valueInput.className = "value-input"; valueInput.value = quantity;
  const removeBtn = document.createElement("button");
  removeBtn.textContent = "删除"; removeBtn.className = "remove-btn";
  removeBtn.onclick = () => itemDiv.remove();
  itemDiv.append(tickerInput, dateInput, strikeInput, typeSelect, valueInput, removeBtn);
  return itemDiv;
}

function addNewRow(sectionDiv) {
  const sectionTitle = sectionDiv.querySelector("h3").textContent;
  const addBtn = sectionDiv.querySelector(".add-btn");
  let itemDiv;
  if (sectionTitle === "OptionsPortfolio") {
    itemDiv = createOptionRowUI();
  } else if (sectionTitle === "Portfolio") {
    itemDiv = document.createElement("div");
    itemDiv.className = "portfolio-item";
    const keyInput = document.createElement("input");
    keyInput.type = "text"; keyInput.placeholder = "代码"; keyInput.className = "key-input";
    const valueInput = document.createElement("input");
    valueInput.type = "text"; valueInput.placeholder = "数量"; valueInput.className = "value-input";
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "删除"; removeBtn.className = "remove-btn";
    removeBtn.onclick = () => itemDiv.remove();
    itemDiv.append(keyInput, valueInput, removeBtn);
  }
  if (itemDiv) sectionDiv.insertBefore(itemDiv, addBtn);
}

function buildIniStringFromUI() {
  const uiState = {};
  document.querySelectorAll(".portfolio-section").forEach((section) => {
    const title = section.querySelector("h3").textContent;
    uiState[title] = {};
    section.querySelectorAll(".portfolio-item-static").forEach((item) => {
      const key = item.querySelector("label").textContent;
      const input = item.querySelector("input, select");
      if (key && input) uiState[title][key] = input.value;
    });
    section.querySelectorAll(".portfolio-item").forEach((item) => {
      const key = item.querySelector(".key-input")?.value.trim();
      const value = item.querySelector(".value-input")?.value.trim();
      if (key && value) uiState[title][key] = value;
    });
    section.querySelectorAll(".option-item-row").forEach((item) => {
      const ticker = item.querySelector(".option-ticker-input").value.trim().toUpperCase();
      const date = item.querySelector(".option-date-select").value;
      const strike = item.querySelector(".option-strike-input").value.trim();
      const type = item.querySelector(".option-type-select").value;
      const value = item.querySelector(".value-input").value.trim();
      if (ticker && date && strike && value) {
        const key = `${ticker}_${date}_${strike}_${type}`;
        uiState[title][key] = value;
      }
    });
  });

  const tempLines = [];
  const processedKeys = new Set();
  let currentSection = "";
  originalIniLines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      currentSection = trimmedLine.substring(1, trimmedLine.length - 1);
      tempLines.push(line);
      return;
    }
    if (!currentSection || !trimmedLine.includes("=") || trimmedLine.startsWith("#") || trimmedLine.startsWith(";")) {
      tempLines.push(line);
      return;
    }
    const key = trimmedLine.split("=")[0].trim();
    const sectionState = uiState[currentSection];
    if (sectionState && sectionState.hasOwnProperty(key)) {
      const newValue = sectionState[key];
      const commentPart = line.includes("#") ? " #" + line.split("#").slice(1).join("#") : "";
      tempLines.push(`${key} = ${newValue}${commentPart}`);
      processedKeys.add(`${currentSection}.${key}`);
    }
  });

  for (const sectionName in uiState) {
    if (!uiState.hasOwnProperty(sectionName)) continue;
    const newItemsForSection = [];
    for (const key in uiState[sectionName]) {
      if (!processedKeys.has(`${sectionName}.${key}`)) {
        const value = uiState[sectionName][key];
        newItemsForSection.push(`${key} = ${value}`);
      }
    }
    if (newItemsForSection.length > 0) {
      let sectionHeaderIndex = -1, nextSectionHeaderIndex = -1;
      for (let i = 0; i < tempLines.length; i++) {
        if (tempLines[i].trim() === `[${sectionName}]`) sectionHeaderIndex = i;
        else if (sectionHeaderIndex !== -1 && tempLines[i].trim().startsWith("[")) {
          nextSectionHeaderIndex = i; break;
        }
      }
      if (sectionHeaderIndex !== -1) {
        const insertChunkEnd = nextSectionHeaderIndex === -1 ? tempLines.length : nextSectionHeaderIndex;
        let insertionIndex = insertChunkEnd;
        while (insertionIndex > sectionHeaderIndex + 1 && tempLines[insertionIndex - 1].trim() === "") insertionIndex--;
        tempLines.splice(insertionIndex, 0, ...newItemsForSection);
      }
    }
  }
  return tempLines.join("\n");
}

function updateStatus(msg, isErr, key) {
  const el = statusMessages[key];
  if(el) { el.innerHTML = msg; el.className = `status-msg ${isErr ? "status-error" : "status-success"}`; el.style.display = msg ? "block" : "none"; }
}

function forceRefreshPage() {
  const baseUrl = window.location.origin + window.location.pathname;
  const newUrl = `${baseUrl}?t=${new Date().getTime()}`;
  window.location.href = newUrl;
}