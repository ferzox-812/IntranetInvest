// ============================================
// IntranetInvest — фронтенд
// ============================================

const PROXY = 'https://intranetinvest-proxy-v2.romaievlev618.workers.dev';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ============================================
// Тема (Светлая / Тёмная)
// ============================================
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('themeIcon').textContent = '☀️';
  } else {
    document.body.classList.remove('light-theme');
    document.getElementById('themeIcon').textContent = '🌙';
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  document.getElementById('themeIcon').textContent = isLight ? '☀️' : '🌙';
  
  if (!document.querySelector('.tab[data-tab="index"]').classList.contains('hidden')) {
    renderChart('index', 'IMOEX', { days: 365 });
  }
  if (!document.querySelector('.tab[data-tab="dollar"]').classList.contains('hidden')) {
    renderDollarChart({ days: 365 });
  }
  if (!document.querySelector('.tab[data-tab="crypto"]').classList.contains('hidden')) {
    renderCryptoChart({ days: 365 });
  }
  if (currentTicker && !document.getElementById('stockView').classList.contains('hidden')) {
    renderChart('stock', currentTicker, { days: 365 });
  }
}

initTheme();
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// ============================================
// Прокси-запросы
// ============================================
async function fetchViaProxy(targetUrl) {
  const url = `${PROXY}?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJSONViaProxy(targetUrl) {
  const text = await fetchViaProxy(targetUrl);
  try { return JSON.parse(text); }
  catch (e) { throw new Error('Ответ не JSON: ' + text.slice(0, 100)); }
}

// ============================================
// Цвет тренда
// ============================================
function getTrendColor(values) {
  const clean = values.filter(v => v != null);
  if (clean.length < 2) {
    return { border: '#888888', background: 'rgba(136, 136, 136, 0.15)' };
  }
  const first = clean[0];
  const last = clean[clean.length - 1];
  const isGrowing = last >= first;
  return isGrowing
    ? { border: '#26a269', background: 'rgba(38, 162, 105, 0.2)' }
    : { border: '#e01b24', background: 'rgba(224, 27, 36, 0.2)' };
}

// ============================================
// Настройки графиков (зависят от темы)
// ============================================
function getChartOptions() {
  const isLight = document.body.classList.contains('light-theme');
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
  const textColor = isLight ? '#666666' : '#888888';
  const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(28, 28, 30, 0.9)';
  const tooltipColor = isLight ? '#000000' : '#ffffff';
  const tooltipBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipColor,
        bodyColor: tooltipColor,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: 10,
        displayColors: false,
      }
    },
    scales: {
      x: { display: false, grid: { display: false } },
      y: {
        border: { display: false },
        grid: { color: gridColor, drawTicks: false },
        ticks: { color: textColor, padding: 10, font: { size: 10 }, maxTicksLimit: 5 }
      }
    }
  };
}

// ============================================
// Навигация
// ============================================
const SUBTITLES = {
  home: 'Главная',
  p2p: 'Приобрести криптовалюту',
  support: 'Поддержать проект',
  stocks: 'Акции',
  index: 'Индекс Мосбиржи',
  dollar: 'Валюты',
  crypto: 'Криптовалюты',
};

const LOADED = {};

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.add('hidden'));
  document.querySelector(`.tab[data-tab="${name}"]`)?.classList.remove('hidden');
  document.getElementById('pageSubtitle').textContent = SUBTITLES[name] || '';

  if (name === 'index' && !LOADED.index) { LOADED.index = true; renderChart('index', 'IMOEX', { days: 365 }); }
  if (name === 'stocks' && !LOADED.stocks) { LOADED.stocks = true; renderStocksList(); }
  if (name === 'dollar' && !LOADED.dollar) { LOADED.dollar = true; renderDollarChart({ days: 365 }); }
  if (name === 'crypto' && !LOADED.crypto) { LOADED.crypto = true; renderCryptoChart({ days: 365 }); }
}

document.querySelectorAll('.home-tile').forEach(tile => {
  tile.addEventListener('click', () => switchTab(tile.dataset.target));
});

document.querySelectorAll('.crypto-buy-banner').forEach(banner => {
  banner.addEventListener('click', () => switchTab(banner.dataset.target));
});

document.querySelectorAll('.back-btn[data-back]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.back));
});

// ============================================
// Акции
// ============================================
let allStocks = [];

async function renderStocksList() {
  const listEl = document.getElementById('stocksList');
  try {
    const url = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata';
    const data = await fetchJSONViaProxy(url);
    const secCols = data.securities.columns, secRows = data.securities.data;
    const mdCols = data.marketdata.columns, mdRows = data.marketdata.data;
    const iSecId = secCols.indexOf('SECID'), iShortName = secCols.indexOf('SHORTNAME');
    const iPrev = mdCols.indexOf('PREVPRICE'), iLast = mdCols.indexOf('LAST'), iValToday = mdCols.indexOf('VALTODAY');

    allStocks = secRows.map((row, i) => {
      const md = mdRows[i] || [];
      const last = md[iLast], prev = md[iPrev], turnover = md[iValToday] || 0;
      return {
        ticker: row[iSecId], name: row[iShortName], last,
        change: (last && prev) ? ((last - prev) / prev * 100) : null,
        turnover,
      };
    })
    .filter(s => s.last != null && s.turnover > 0)
    .sort((a, b) => b.turnover - a.turnover);

    renderStocksRows(allStocks.slice(0, 100));
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="status">Ошибка: ${e.message}</p>`;
  }
}

function renderStocksRows(stocks) {
  const listEl = document.getElementById('stocksList');
  if (stocks.length === 0) {
    listEl.innerHTML = `<p class="status">Ничего не найдено</p>`;
    return;
  }

  listEl.innerHTML = stocks.map(s => {
    const changeClass = s.change > 0 ? 'up' : (s.change < 0 ? 'down' : '');
    const changeText = s.change != null ? `${s.change > 0 ? '+' : ''}${s.change.toFixed(2)}%` : '—';
    return `<div class="stock-row" data-ticker="${s.ticker}" data-name="${s.name || ''}">
      <div><div class="stock-ticker">${s.ticker}</div><div class="stock-name">${s.name || ''}</div></div>
      <div class="stock-price">${s.last.toFixed(2)}</div>
      <div class="stock-change ${changeClass}">${changeText}</div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.stock-row').forEach(row => {
    row.addEventListener('click', () => openStockView(row.dataset.ticker, row.dataset.name));
  });
}

// ============================================
// Экран акции
// ============================================
let stockChartInstance = null;
let currentTicker = null;

function openStockView(ticker, name) {
  currentTicker = ticker;
  document.getElementById('stockTitle').textContent = ticker;
  document.getElementById('stockSubtitle').textContent = name || '';
  document.querySelectorAll('#stockPeriods .period-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#stockPeriods .period-btn[data-days="365"]')?.classList.add('active');
  document.getElementById('stockView').classList.remove('hidden');
  renderChart('stock', ticker, { days: 365 });
}

function closeStockView() {
  document.getElementById('stockView').classList.add('hidden');
  currentTicker = null;
  if (stockChartInstance) { stockChartInstance.destroy(); stockChartInstance = null; }
}

document.getElementById('stockBack').addEventListener('click', closeStockView);

// ============================================
// История MOEX
// ============================================
async function loadHistory(target, secid, period) {
  const days = period.days;
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  let endpoint;
  if (target === 'index') endpoint = `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${secid}.json`;
  else endpoint = `https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/${secid}.json`;

  let allRows = [], columns = null, start = 0;
  while (true) {
    const data = await fetchJSONViaProxy(`${endpoint}?from=${fromStr}&start=${start}`);
    if (!data.history || !data.history.data) break;
    if (!columns) columns = data.history.columns;
    allRows = allRows.concat(data.history.data);
    if (data.history.data.length < 100) break;
    start += 100;
    if (start > 10000) break;
  }

  if (!columns) throw new Error('Нет данных');
  const closeIdx = columns.indexOf('CLOSE');
  const dateIdx = columns.indexOf('TRADEDATE');

  allRows.sort((a, b) => (a[dateIdx] < b[dateIdx] ? -1 : a[dateIdx] > b[dateIdx] ? 1 : 0));
  return {
    labels: allRows.map(r => r[dateIdx]),
    values: allRows.map(r => r[closeIdx]).filter(v => v !== null),
  };
}

async function renderChart(target, secid, period) {
  const statusEl = document.getElementById(target === 'index' ? 'chartStatus' : 'stockChartStatus');
  const canvasEl = document.getElementById(target === 'index' ? 'imoexChart' : 'stockChart');
  statusEl.textContent = `Загрузка за ${period.days} дн...`;

  try {
    const { labels, values } = await loadHistory(target, secid, period);
    if (values.length === 0) throw new Error('Нет данных за период');
    const ctx = canvasEl.getContext('2d');
    if (target === 'index' && window.__imoexChartInstance) window.__imoexChartInstance.destroy();
    if (target !== 'index' && stockChartInstance) stockChartInstance.destroy();

    const color = getTrendColor(values);
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, color.background);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: secid,
          data: values,
          borderColor: color.border,
          backgroundColor: gradient,
          fill: true, tension: 0.3, pointRadius: 0,
          pointHoverRadius: 4, pointHoverBackgroundColor: color.border,
          pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
          borderWidth: 2,
        }]
      },
      options: getChartOptions()
    });

    if (target === 'index') window.__imoexChartInstance = chart;
    else stockChartInstance = chart;

    const last = values[values.length - 1];
    const first = values[0];
    const change = ((last - first) / first * 100).toFixed(2);
    statusEl.textContent = `Текущее: ${last.toFixed(2)} • Изменение: ${change > 0 ? '+' : ''}${change}%`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Ошибка: ' + e.message;
  }
}

document.querySelectorAll('#indexPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#indexPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderChart('index', 'IMOEX', { days: parseInt(btn.dataset.days, 10) });
  });
});

document.querySelectorAll('#stockPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#stockPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (currentTicker) {
      renderChart('stock', currentTicker, { days: parseInt(btn.dataset.days, 10) });
    }
  });
});

// ============================================
// Валюты — USD, EUR, CNY
// ============================================
let usdChartInstance = null;
let eurChartInstance = null;
let cnyChartInstance = null;

async function loadCurrencyHistory(baseCurrency, period) {
  const days = period.days;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const url = `https://api.frankfurter.dev/v2/rates?base=${baseCurrency}&quotes=RUB&from=${fmt(start)}&to=${fmt(end)}`;
  const data = await fetchJSONViaProxy(url);

  if (!Array.isArray(data)) throw new Error('Неверный формат Frankfurter');
  const sorted = data.slice().sort((a, b) => a.date.localeCompare(b.date));

  return {
    labels: sorted.map(row => row.date),
    values: sorted.map(row => row.rate),
  };
}

function drawCurrencyChart(canvasId, statusId, data, label, currentInstance) {
  const statusEl = document.getElementById(statusId);
  const canvasEl = document.getElementById(canvasId);

  if (currentInstance) currentInstance.destroy();
  const color = getTrendColor(data.values);
  
  const ctx = canvasEl.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color.background);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        label: label,
        data: data.values,
        borderColor: color.border,
        backgroundColor: gradient,
        fill: true, tension: 0.3, pointRadius: 0,
        pointHoverRadius: 4, pointHoverBackgroundColor: color.border,
        pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        borderWidth: 2,
      }]
    },
    options: getChartOptions()
  });

  const last = data.values[data.values.length - 1];
  statusEl.textContent = `${last.toFixed(4)} ₽`;
  return chart;
}

async function renderDollarChart(period) {
  const usdStatus = document.getElementById('usdStatus');
  const eurStatus = document.getElementById('eurStatus');
  const cnyStatus = document.getElementById('cnyStatus');

  usdStatus.textContent = 'Загрузка...';
  eurStatus.textContent = 'Ожидание...';
  cnyStatus.textContent = 'Ожидание...';

  try {
    const usd = await loadCurrencyHistory('USD', period);
    usdChartInstance = drawCurrencyChart('usdChart', 'usdStatus', usd, 'USD/RUB', usdChartInstance);

    await new Promise(r => setTimeout(r, 500));
    eurStatus.textContent = 'Загрузка...';
    const eur = await loadCurrencyHistory('EUR', period);
    eurChartInstance = drawCurrencyChart('eurChart', 'eurStatus', eur, 'EUR/RUB', eurChartInstance);

    await new Promise(r => setTimeout(r, 500));
    cnyStatus.textContent = 'Загрузка...';
    const cny = await loadCurrencyHistory('CNY', period);
    cnyChartInstance = drawCurrencyChart('cnyChart', 'cnyStatus', cny, 'CNY/RUB', cnyChartInstance);
  } catch (e) {
    console.error('Ошибка валют:', e);
    [usdStatus, eurStatus, cnyStatus].forEach(s => {
      if (s.textContent.includes('Загрузка') || s.textContent.includes('Ожидание')) {
        s.textContent = 'Ошибка: ' + e.message;
      }
    });
  }
}

document.querySelectorAll('#dollarPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#dollarPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderDollarChart({ days: parseInt(btn.dataset.days, 10) });
  });
});

// ============================================
// Крипта — Kraken
// ============================================
let btcChartInstance = null;
let tonChartInstance = null;
let ethChartInstance = null;

async function loadCryptoHistory(symbol, period) {
  const pairMap = { 'bitcoin': 'XBTUSD', 'gram': 'TONUSD', 'ethereum': 'ETHUSD' };
  const pair = pairMap[symbol] || symbol;

  const is24h = period.hours === 24;
  const interval = is24h ? 60 : 1440;
  const limit = is24h ? 24 : period.days;

  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`;
  const data = await fetchJSONViaProxy(url);

  if (!data.result) throw new Error('Неверный формат Kraken');
  const resultKey = Object.keys(data.result).find(k => k !== 'last');
  if (!resultKey) throw new Error('Нет данных Kraken');

  const candles = data.result[resultKey].slice(-limit);

  return {
    labels: candles.map(c => {
      const d = new Date(c[0] * 1000);
      return is24h ? d.toISOString().slice(11, 16) : d.toISOString().slice(0, 10);
    }),
    values: candles.map(c => parseFloat(c[4])),
  };
}

function drawCryptoChart(canvasId, statusId, data, label, currentInstance) {
  const statusEl = document.getElementById(statusId);
  const canvasEl = document.getElementById(canvasId);

  if (currentInstance) currentInstance.destroy();
  const color = getTrendColor(data.values);

  const ctx = canvasEl.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color.background);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        label: label,
        data: data.values,
        borderColor: color.border,
        backgroundColor: gradient,
        fill: true, tension: 0.3, pointRadius: 0,
        pointHoverRadius: 4, pointHoverBackgroundColor: color.border,
        pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        borderWidth: 2,
      }]
    },
    options: getChartOptions()
  });

  const last = data.values[data.values.length - 1];
  const first = data.values[0];
  const change = ((last - first) / first * 100).toFixed(2);
  statusEl.textContent = `$${last.toFixed(2)} • ${change > 0 ? '+' : ''}${change}%`;
  return chart;
}

async function renderCryptoChart(period) {
  const btcStatus = document.getElementById('btcStatus');
  const tonStatus = document.getElementById('tonStatus');
  const ethStatus = document.getElementById('ethStatus');

  btcStatus.textContent = 'Загрузка...';
  tonStatus.textContent = 'Ожидание...';
  ethStatus.textContent = 'Ожидание...';

  try {
    const btc = await loadCryptoHistory('bitcoin', period);
    btcChartInstance = drawCryptoChart('btcChart', 'btcStatus', btc, 'BTC', btcChartInstance);

    await new Promise(r => setTimeout(r, 1000));
    tonStatus.textContent = 'Загрузка...';
    const gram = await loadCryptoHistory('gram', period);
    tonChartInstance = drawCryptoChart('tonChart', 'tonStatus', gram, 'GRAM', tonChartInstance);

    await new Promise(r => setTimeout(r, 1000));
    ethStatus.textContent = 'Загрузка...';
    const eth = await loadCryptoHistory('ethereum', period);
    ethChartInstance = drawCryptoChart('ethChart', 'ethStatus', eth, 'ETH', ethChartInstance);
  } catch (e) {
    console.error('Ошибка крипты:', e);
    [btcStatus, tonStatus, ethStatus].forEach(s => {
      if (s.textContent.includes('Загрузка') || s.textContent.includes('Ожидание')) {
        s.textContent = 'Ошибка: ' + e.message;
      }
    });
  }
}

document.querySelectorAll('#cryptoPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cryptoPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCryptoChart(btn.dataset.hours ? { hours: 24 } : { days: parseInt(btn.dataset.days, 10) });
  });
});

// ============================================
// Поиск по акциям
// ============================================
function filterList(query, list) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return list.filter(item => {
    const ticker = (item.ticker || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    return ticker.includes(q) || name.includes(q);
  });
}

document.getElementById('stocksSearch')?.addEventListener('input', (e) => {
  const q = e.target.value.trim();
  if (!q) { renderStocksRows(allStocks.slice(0, 100)); return; }
  const filtered = filterList(q, allStocks) || [];
  renderStocksRows(filtered.slice(0, 100));
});

// ============================================
// Копирование адресов кошельков
// ============================================
document.querySelectorAll('.wallet-card').forEach(card => {
  card.addEventListener('click', async () => {
    const address = card.dataset.copy;
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = address;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    // Показываем галочку на 1.5 сек
    const icon = card.querySelector('.wallet-copy-icon');
    const originalIcon = icon.textContent;
    icon.textContent = '✅';
    icon.style.opacity = '1';
    
    // Эффект вибрации (если поддерживается)
    if (tg.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred('success');
    }

    setTimeout(() => {
      icon.textContent = originalIcon;
      icon.style.opacity = '0.6';
    }, 1500);
  });
});

// ============================================
// Lottie: бриллиант
// ============================================
if (typeof lottie !== 'undefined') {
  lottie.loadAnimation({
    container: document.getElementById('gemAnimation'),
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: 'gem.json',
  });
}

// ============================================
// Старт
// ============================================
switchTab('home');
