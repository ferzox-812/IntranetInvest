// ============================================
// IntranetInvest — фронтенд
// ============================================

const PROXY = 'https://intranetinvest-proxy-v2.romaievlev618.workers.dev';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

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
    ? { border: '#26a269', background: 'rgba(38, 162, 105, 0.15)' }
    : { border: '#e01b24', background: 'rgba(224, 27, 36, 0.15)' };
}

// ============================================
// Навигация
// ============================================
const SUBTITLES = {
  home: 'Главная',
  markets: 'Акции и облигации',
  p2p: 'Приобрести криптовалюту',
  stocks: 'Акции',
  bonds: 'Облигации',
  index: 'Индекс Мосбиржи',
  dollar: 'Курс доллара',
  crypto: 'Криптовалюты',
};

const LOADED = {};

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.add('hidden'));
  document.querySelector(`.tab[data-tab="${name}"]`)?.classList.remove('hidden');
  document.getElementById('pageSubtitle').textContent = SUBTITLES[name] || '';

  if (name === 'index' && !LOADED.index) { LOADED.index = true; renderChart('index', 'IMOEX', { days: 365 }); }
  if (name === 'stocks' && !LOADED.stocks) { LOADED.stocks = true; renderStocksList(); }
  if (name === 'bonds' && !LOADED.bonds) { LOADED.bonds = true; renderBondsList(); }
  if (name === 'dollar' && !LOADED.dollar) { LOADED.dollar = true; renderDollarChart({ days: 365 }); }
  if (name === 'crypto' && !LOADED.crypto) { LOADED.crypto = true; renderCryptoChart({ days: 365 }); }
}

// Клик по плиткам
document.querySelectorAll('.home-tile').forEach(tile => {
  tile.addEventListener('click', () => switchTab(tile.dataset.target));
});

// Клик по рамке "Приобрести криптовалюту"
document.querySelectorAll('.crypto-buy-banner').forEach(banner => {
  banner.addEventListener('click', () => switchTab(banner.dataset.target));
});

// Клик по "Назад"
document.querySelectorAll('.back-btn[data-back]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.back));
});

// ============================================
// Акции
// ============================================
async function renderStocksList() {
  const listEl = document.getElementById('stocksList');
  try {
    const url = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata';
    const data = await fetchJSONViaProxy(url);
    const secCols = data.securities.columns, secRows = data.securities.data;
    const mdCols = data.marketdata.columns, mdRows = data.marketdata.data;
    const iSecId = secCols.indexOf('SECID'), iShortName = secCols.indexOf('SHORTNAME');
    const iPrev = mdCols.indexOf('PREVPRICE'), iLast = mdCols.indexOf('LAST'), iValToday = mdCols.indexOf('VALTODAY');

    const stocks = secRows.map((row, i) => {
      const md = mdRows[i] || [];
      const last = md[iLast], prev = md[iPrev], turnover = md[iValToday] || 0;
      return {
        ticker: row[iSecId], name: row[iShortName], last,
        change: (last && prev) ? ((last - prev) / prev * 100) : null,
        turnover,
      };
    })
    .filter(s => s.last != null && s.turnover > 0)
    .sort((a, b) => b.turnover - a.turnover)
    .slice(0, 100);

    listEl.innerHTML = stocks.map(s => {
      const changeClass = s.change > 0 ? 'up' : (s.change < 0 ? 'down' : '');
      const changeText = s.change != null ? `${s.change > 0 ? '+' : ''}${s.change.toFixed(2)}%` : '—';
      return `<div class="stock-row" data-ticker="${s.ticker}" data-name="${s.name || ''}" data-type="stock">
        <div><div class="stock-ticker">${s.ticker}</div><div class="stock-name">${s.name || ''}</div></div>
        <div class="stock-price">${s.last.toFixed(2)}</div>
        <div class="stock-change ${changeClass}">${changeText}</div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.stock-row').forEach(row => {
      row.addEventListener('click', () => openStockView(row.dataset.ticker, row.dataset.name, 'stock'));
    });
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="status">Ошибка: ${e.message}</p>`;
  }
}

// ============================================
// Облигации
// ============================================
async function renderBondsList() {
  const listEl = document.getElementById('bondsList');
  try {
    const url = 'https://iss.moex.com/iss/engines/stock/markets/bonds/boards/TQOB/securities.json?iss.meta=off&iss.only=securities,marketdata';
    const data = await fetchJSONViaProxy(url);
    const secCols = data.securities.columns, secRows = data.securities.data;
    const mdCols = data.marketdata.columns, mdRows = data.marketdata.data;
    const iSecId = secCols.indexOf('SECID'), iShortName = secCols.indexOf('SHORTNAME'), iCoupon = secCols.indexOf('COUPONPERCENT');
    const iLast = mdCols.indexOf('LAST'), iPrev = mdCols.indexOf('PREVPRICE');
    const iValToday = mdCols.indexOf('VALTODAY'), iYield = mdCols.indexOf('YIELDATPREVWAPRICE');

    const allBonds = secRows.map((row, i) => {
      const md = mdRows[i] || [];
      return {
        ticker: row[iSecId], name: row[iShortName],
        last: md[iLast], prev: md[iPrev], coupon: row[iCoupon],
        yieldVal: md[iYield], turnover: md[iValToday] || 0,
      };
    }).filter(b => b.last != null && b.turnover > 0);

    const ofz = allBonds.filter(b => b.ticker.startsWith('SU')).sort((a, b) => b.turnover - a.turnover).slice(0, 10);
    const corporate = allBonds.filter(b => !b.ticker.startsWith('SU')).sort((a, b) => b.turnover - a.turnover).slice(0, 20);
    const bonds = [...ofz, ...corporate];

    listEl.innerHTML = bonds.map(b => {
      const isOfz = b.ticker.startsWith('SU');
      return `<div class="bond-row" data-ticker="${b.ticker}" data-name="${b.name || ''}" data-type="bond">
        <div><div class="stock-ticker">${isOfz ? '<span class="ofz-badge">ОФЗ</span> ' : ''}${b.ticker}</div><div class="stock-name">${b.name || ''}</div></div>
        <div class="bond-cell bond-coupon">${b.coupon != null ? b.coupon.toFixed(2) : '—'}%</div>
        <div class="bond-cell">${b.last != null ? b.last.toFixed(2) : '—'}</div>
        <div class="bond-cell">${b.yieldVal != null ? b.yieldVal.toFixed(2) : '—'}%</div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.bond-row').forEach(row => {
      row.addEventListener('click', () => openStockView(row.dataset.ticker, row.dataset.name, 'bond'));
    });
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="status">Ошибка: ${e.message}</p>`;
  }
}

// ============================================
// Экран бумаги
// ============================================
let stockChartInstance = null;
let currentTicker = null;
let currentType = null;

function openStockView(ticker, name, type) {
  currentTicker = ticker;
  currentType = type;
  document.getElementById('stockTitle').textContent = ticker;
  document.getElementById('stockSubtitle').textContent = name || '';
  document.querySelectorAll('#stockPeriods .period-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#stockPeriods .period-btn[data-days="365"]')?.classList.add('active');
  document.getElementById('stockView').classList.remove('hidden');
  renderChart(type === 'bond' ? 'bond' : 'stock', ticker, { days: 365 });
}

function closeStockView() {
  document.getElementById('stockView').classList.add('hidden');
  currentTicker = null;
  currentType = null;
  if (stockChartInstance) { stockChartInstance.destroy(); stockChartInstance = null; }
}

document.getElementById('stockBack').addEventListener('click', closeStockView);

// ============================================
// История MOEX
// ============================================
async function loadHistory(target, secid, period) {
  const is24h = period.hours === 24;
  const days = is24h ? 3 : period.days;

  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  let endpoint;
  if (target === 'index') endpoint = `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${secid}.json`;
  else if (target === 'bond') endpoint = `https://iss.moex.com/iss/history/engines/stock/markets/bonds/boards/TQOB/securities/${secid}.json`;
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
  const label = period.hours ? '24Ч' : `${period.days} дн`;
  statusEl.textContent = `Загрузка за ${label}...`;

  try
