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
  
  if (!document.querySelector('.tab[data-tab="index"]').classList.contains('hidden')) renderChart('index', 'IMOEX', { days: 365 });
  if (!document.querySelector('.tab[data-tab="stocks"]').classList.contains('hidden')) renderStocksList();
  if (!document.querySelector('.tab[data-tab="dollar"]').classList.contains('hidden')) renderCurrencyList();
  if (!document.querySelector('.tab[data-tab="crypto"]').classList.contains('hidden')) renderCryptoList();
  
  if (currentTicker && !document.getElementById('stockView').classList.contains('hidden')) renderChart('stock', currentTicker, { days: 365 });
  if (currentCurrency && !document.getElementById('currencyView').classList.contains('hidden')) renderCurrencyChart(currentCurrency, { days: 365 });
  if (currentCoin && !document.getElementById('cryptoView').classList.contains('hidden')) renderCryptoDetail(currentCoin, { days: 365 });
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
  if (clean.length < 2) return { border: '#888888', background: 'rgba(136, 136, 136, 0.15)' };
  const isGrowing = clean[clean.length - 1] >= clean[0];
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
  if (name === 'dollar' && !LOADED.dollar) { LOADED.dollar = true; renderCurrencyList(); }
  if (name === 'crypto' && !LOADED.crypto) { LOADED.crypto = true; renderCryptoList(); }
}

document.querySelectorAll('.home-tile').forEach(tile => tile.addEventListener('click', () => switchTab(tile.dataset.target)));
document.querySelectorAll('.crypto-buy-banner').forEach(banner => banner.addEventListener('click', () => switchTab(banner.dataset.target)));
document.querySelectorAll('.back-btn[data-back]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.back)));

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
    const iSecId = secCols.indexOf('SECID'), iShortName = secCols.indexOf('SHORTNAME'), iPrev = mdCols.indexOf('PREVPRICE'), iLast = mdCols.indexOf('LAST'), iValToday = mdCols.indexOf('VALTODAY');

    allStocks = secRows.map((row, i) => {
      const md = mdRows[i] || [];
      const last = md[iLast], prev = md[iPrev], turnover = md[iValToday] || 0;
      return { ticker: row[iSecId], name: row[iShortName], last, change: (last && prev) ? ((last - prev) / prev * 100) : null, turnover };
    }).filter(s => s.last != null && s.turnover > 0).sort((a, b) => b.turnover - a.turnover);

    renderStocksRows(allStocks.slice(0, 100));
  } catch (e) { listEl.innerHTML = `<p class="status">Ошибка: ${e.message}</p>`; }
}

function renderStocksRows(stocks) {
  const listEl = document.getElementById('stocksList');
  if (stocks.length === 0) { listEl.innerHTML = `<p class="status">Ничего не найдено</p>`; return; }
  listEl.innerHTML = stocks.map(s => {
    const changeClass = s.change > 0 ? 'up' : (s.change < 0 ? 'down' : '');
    const changeText = s.change != null ? `${s.change > 0 ? '+' : ''}${s.change.toFixed(2)}%` : '—';
    return `<div class="stock-row" data-ticker="${s.ticker}" data-name="${s.name || ''}">
      <div><div class="stock-ticker">${s.ticker}</div><div class="stock-name">${s.name || ''}</div></div>
      <div class="stock-price">${s.last.toFixed(2)}</div>
      <div class="stock-change ${changeClass}">${changeText}</div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('.stock-row').forEach(row => row.addEventListener('click', () => openStockView(row.dataset.ticker, row.dataset.name)));
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
// Валюты (Список)
// ============================================
async function renderCurrencyList() {
  try {
    const [usd, eur, cny] = await Promise.all([
      loadCurrencyHistory('USD', { days: 7 }),
      loadCurrencyHistory('EUR', { days: 7 }),
      loadCurrencyHistory('CNY', { days: 7 })
    ]);
    
    const update = (data, priceId) => {
      const el = document.getElementById(priceId);
      if (data.values.length > 0) el.textContent = `${data.values[data.values.length - 1].toFixed(4)} ₽`;
    };
    update(usd, 'usdPriceList'); update(eur, 'eurPriceList'); update(cny, 'cnyPriceList');
  } catch (e) {
    console.error('Ошибка списка валют:', e);
  }
}

document.querySelectorAll('#dollarList .stock-row').forEach(row => {
  row.addEventListener('click', () => openCurrencyView(row.dataset.currency));
});

// ============================================
// Крипта (Список)
// ============================================
async function renderCryptoList() {
  try {
    const [btc, gram, eth] = await Promise.all([
      loadCryptoHistory('bitcoin', { days: 7 }),
      loadCryptoHistory('gram', { days: 7 }),
      loadCryptoHistory('ethereum', { days: 7 })
    ]);
    
    const update = (data, priceId) => {
      const el = document.getElementById(priceId);
      if (data.values.length > 0) el.textContent = `$${data.values[data.values.length - 1].toFixed(2)}`;
    };
    update(btc, 'btcPriceList'); update(gram, 'tonPriceList'); update(eth, 'ethPriceList');
  } catch (e) {
    console.error('Ошибка списка крипты:', e);
  }
}

document.querySelectorAll('#cryptoList .stock-row').forEach(row => {
  row.addEventListener('click', () => openCryptoView(row.dataset.coin));
});

// ============================================
// Экран Валюты
// ============================================
let currencyChartInstance = null;
let currentCurrency = null;

function openCurrencyView(currency) {
  currentCurrency = currency;
  const names = { USD: 'Доллар (USD/RUB)', EUR: 'Евро (EUR/RUB)', CNY: 'Юань (CNY/RUB)' };
  document.getElementById('currencyTitle').textContent = names[currency] || currency;
  document.querySelectorAll('#currencyPeriods .period-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#currencyPeriods .period-btn[data-days="365"]')?.classList.add('active');
  document.getElementById('currencyView').classList.remove('hidden');
  renderCurrencyChart(currency, { days: 365 });
}

function closeCurrencyView() {
  document.getElementById('currencyView').classList.add('hidden');
  currentCurrency = null;
  if (currencyChartInstance) { currencyChartInstance.destroy(); currencyChartInstance = null; }
}

document.getElementById('currencyBack').addEventListener('click', closeCurrencyView);

// ============================================
// Экран Крипты
// ============================================
let cryptoDetailChartInstance = null;
let currentCoin = null;

function openCryptoView(coin) {
  currentCoin = coin;
  const names = { bitcoin: 'Bitcoin (BTC)', gram: 'Gram (GRAM)', ethereum: 'Ethereum (ETH)' };
  document.getElementById('cryptoTitle').textContent = names[coin] || coin;
  document.querySelectorAll('#cryptoDetailPeriods .period-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#cryptoDetailPeriods .period-btn[data-days="365"]')?.classList.add('active');
  document.getElementById('cryptoView').classList.remove('hidden');
  renderCryptoDetail(coin, { days: 365 });
}

function closeCryptoView() {
  document.getElementById('cryptoView').classList.add('hidden');
  currentCoin = null;
  if (cryptoDetailChartInstance) { cryptoDetailChartInstance.destroy(); cryptoDetailChartInstance = null; }
}

document.getElementById('cryptoBack').addEventListener('click', closeCryptoView);

// ============================================
// Загрузка истории
// ============================================
async function loadHistory(target, secid, period) {
  const days = period.days;
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);
  let endpoint = target === 'index' ? `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${secid}.json` : `https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/${secid}.json`;
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
  const closeIdx = columns.indexOf('CLOSE'), dateIdx = columns.indexOf('TRADEDATE');
  allRows.sort((a, b) => (a[dateIdx] < b[dateIdx] ? -1 : a[dateIdx] > b[dateIdx] ? 1 : 0));
  return { labels: allRows.map(r => r[dateIdx]), values: allRows.map(r => r[closeIdx]).filter(v => v !== null) };
}

async function loadCurrencyHistory(baseCurrency, period) {
  const end = new Date(), start = new Date();
  start.setDate(start.getDate() - period.days);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `https://api.frankfurter.dev/v2/rates?base=${baseCurrency}&quotes=RUB&from=${fmt(start)}&to=${fmt(end)}`;
  const data = await fetchJSONViaProxy(url);
  if (!Array.isArray(data)) throw new Error('Ошибка Frankfurter');
  const sorted = data.slice().sort((a, b) => a.date.localeCompare(b.date));
  return { labels: sorted.map(row => row.date), values: sorted.map(row => row.rate) };
}

async function loadCryptoHistory(symbol, period) {
  const pairMap = { 'bitcoin': 'XBTUSD', 'gram': 'TONUSD', 'ethereum': 'ETHUSD' };
  const pair = pairMap[symbol] || symbol;
  const is24h = period.hours === 24;
  const interval = is24h ? 60 : 1440;
  const limit = is24h ? 24 : period.days;
  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`;
  const data = await fetchJSONViaProxy(url);
  if (!data.result) throw new Error('Ошибка Kraken');
  const resultKey = Object.keys(data.result).find(k => k !== 'last');
  if (!resultKey) throw new Error('Нет данных Kraken');
  const candles = data.result[resultKey].slice(-limit);
  return { labels: candles.map(c => { const d = new Date(c[0] * 1000); return is24h ? d.toISOString().slice(11, 16) : d.toISOString().slice(0, 10); }), values: candles.map(c => parseFloat(c[4])) };
}

// ============================================
// Отрисовка графиков
// ============================================
function drawSimpleChart(canvasEl, statusEl, data, label, instance) {
  if (instance) instance.destroy();
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
        fill: true, 
        tension: 0.3, 
        pointRadius: 0, 
        pointHoverRadius: 4, 
        pointHoverBackgroundColor: color.border, 
        pointHoverBorderColor: '#fff', 
        pointHoverBorderWidth: 2, 
        borderWidth: 2 
      }] 
    }, 
    options: getChartOptions() 
  });
  
  const last = data.values[data.values.length - 1], first = data.values[0];
  const change = ((last - first) / first * 100).toFixed(2);
  statusEl.textContent = `Текущее: ${last.toFixed(4)} • Изменение: ${change > 0 ? '+' : ''}${change}%`;
  return chart;
}

async function renderChart(target, secid, period) {
  const statusEl = document.getElementById(target === 'index' ? 'chartStatus' : 'stockChartStatus');
  const canvasEl = document.getElementById(target === 'index' ? 'imoexChart' : 'stockChart');
  statusEl.textContent = 'Загрузка...';
  try {
    const data = await loadHistory(target, secid, period);
    if (target === 'index') window.__imoexChartInstance = drawSimpleChart(canvasEl, statusEl, data, secid, window.__imoexChartInstance);
    else stockChartInstance = drawSimpleChart(canvasEl, statusEl, data, secid, stockChartInstance);
  } catch (e) { statusEl.textContent = 'Ошибка: ' + e.message; }
}

async function renderCurrencyChart(currency, period) {
  const statusEl = document.getElementById('currencyChartStatus');
  const canvasEl = document.getElementById('currencyChart');
  statusEl.textContent = 'Загрузка...';
  try {
    const data = await loadCurrencyHistory(currency, period);
    currencyChartInstance = drawSimpleChart(canvasEl, statusEl, data, currency, currencyChartInstance);
    statusEl.textContent = `${data.values[data.values.length - 1].toFixed(4)} ₽ • Изменение: ${((data.values[data.values.length - 1] - data.values[0]) / data.values[0] * 100).toFixed(2)}%`;
  } catch (e) { statusEl.textContent = 'Ошибка: ' + e.message; }
}

async function renderCryptoDetail(coin, period) {
  const statusEl = document.getElementById('cryptoDetailStatus');
  const canvasEl = document.getElementById('cryptoDetailChart');
  statusEl.textContent = 'Загрузка...';
  try {
    const data = await loadCryptoHistory(coin, period);
    cryptoDetailChartInstance = drawSimpleChart(canvasEl, statusEl, data, coin.toUpperCase(), cryptoDetailChartInstance);
    statusEl.textContent = `$${data.values[data.values.length - 1].toFixed(2)} • Изменение: ${((data.values[data.values.length - 1] - data.values[0]) / data.values[0] * 100).toFixed(2)}%`;
  } catch (e) { statusEl.textContent = 'Ошибка: ' + e.message; }
}

// ============================================
// Обработчики кнопок периодов
// ============================================
document.querySelectorAll('#indexPeriods .period-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('#indexPeriods .period-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderChart('index', 'IMOEX', { days: parseInt(btn.dataset.days) }); }));
document.querySelectorAll('#stockPeriods .period-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('#stockPeriods .period-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); if (currentTicker) renderChart('stock', currentTicker, { days: parseInt(btn.dataset.days) }); }));
document.querySelectorAll('#currencyPeriods .period-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('#currencyPeriods .period-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); if (currentCurrency) renderCurrencyChart(currentCurrency, { days: parseInt(btn.dataset.days) }); }));
document.querySelectorAll('#cryptoDetailPeriods .period-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('#cryptoDetailPeriods .period-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); if (currentCoin) renderCryptoDetail(currentCoin, btn.dataset.hours ? { hours: 24 } : { days: parseInt(btn.dataset.days) }); }));

// ============================================
// Поиск
// ============================================
document.getElementById('stocksSearch')?.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderStocksRows(allStocks.slice(0, 100)); return; }
  renderStocksRows(allStocks.filter(s => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).slice(0, 100));
});

// ============================================
// Копирование кошельков
// ============================================
document.querySelectorAll('.wallet-card').forEach(card => card.addEventListener('click', async () => {
  const address = card.dataset.copy;
  if (!address) return;
  try { await navigator.clipboard.writeText(address); } catch (e) { const t = document.createElement('textarea'); t.value = address; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  const icon = card.querySelector('.wallet-copy-icon');
  const orig = icon.textContent;
  icon.textContent = '✅'; icon.style.opacity = '1';
  if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  setTimeout(() => { icon.textContent = orig; icon.style.opacity = '0.6'; }, 1500);
}));

// ============================================
// Lottie
// ============================================
if (typeof lottie !== 'undefined') {
  lottie.loadAnimation({ container: document.getElementById('gemAnimation'), renderer: 'svg', loop: true, autoplay: true, path: 'gem.json' });
}

// ============================================
// Старт
// ============================================
switchTab('home');
