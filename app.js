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

  try {
    const { labels, values } = await loadHistory(target, secid, period);
    if (values.length === 0) throw new Error('Нет данных за период');
    const ctx = canvasEl.getContext('2d');
    if (target === 'index' && window.__imoexChartInstance) window.__imoexChartInstance.destroy();
    if (target !== 'index' && stockChartInstance) stockChartInstance.destroy();

    const color = getTrendColor(values);

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: secid,
          data: values,
          borderColor: color.border,
          backgroundColor: color.background,
          fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { display: false },
          y: {
            grid: { color: 'rgba(128,128,128,0.15)' },
            ticks: { color: tg.themeParams?.hint_color || '#888', font: { size: 10 } }
          }
        }
      }
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

// Обработчики периодов: индекс
document.querySelectorAll('#indexPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#indexPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const period = btn.dataset.hours ? { hours: 24 } : { days: parseInt(btn.dataset.days, 10) };
    renderChart('index', 'IMOEX', period);
  });
});

// Обработчики периодов: бумага
document.querySelectorAll('#stockPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#stockPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (currentTicker) {
      const period = btn.dataset.hours ? { hours: 24 } : { days: parseInt(btn.dataset.days, 10) };
      renderChart(currentType === 'bond' ? 'bond' : 'stock', currentTicker, period);
    }
  });
});

// ============================================
// Доллар — Frankfurter API
// ============================================
let dollarChartInstance = null;

async function loadDollarHistory(period) {
  const days = period.hours === 24 ? 7 : period.days;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const url = `https://api.frankfurter.dev/v2/rates?base=USD&quotes=RUB&from=${fmt(start)}&to=${fmt(end)}`;
  const data = await fetchJSONViaProxy(url);

  if (!Array.isArray(data)) throw new Error('Неверный формат Frankfurter');
  const sorted = data.slice().sort((a, b) => a.date.localeCompare(b.date));

  const labels = sorted.map(row => row.date);
  const values = sorted.map(row => row.rate);

  if (values.length === 0) throw new Error('Frankfurter не вернул данные');
  return { labels, values };
}

async function renderDollarChart(period) {
  const statusEl = document.getElementById('dollarStatus');
  const canvasEl = document.getElementById('dollarChart');
  const label = period.hours ? '24Ч (7 дней)' : `${period.days} дн`;
  statusEl.textContent = `Загрузка за ${label}...`;

  try {
    const { labels, values } = await loadDollarHistory(period);
    if (values.length === 0) throw new Error('Нет данных');
    const ctx = canvasEl.getContext('2d');
    if (dollarChartInstance) dollarChartInstance.destroy();

    const color = getTrendColor(values);

    dollarChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'USD/RUB',
          data: values,
          borderColor: color.border,
          backgroundColor: color.background,
          fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { display: false },
          y: {
            grid: { color: 'rgba(128,128,128,0.15)' },
            ticks: { color: tg.themeParams?.hint_color || '#888', font: { size: 10 } }
          }
        }
      }
    });

    statusEl.textContent = `Курс USD/RUB: ${values[values.length - 1].toFixed(4)} ₽`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Ошибка: ' + e.message;
  }
}

document.querySelectorAll('#dollarPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#dollarPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const period = btn.dataset.hours ? { hours: 24 } : { days: parseInt(btn.dataset.days, 10) };
    renderDollarChart(period);
  });
});

// ============================================
// Крипта — Kraken API (часовые свечи для 24Ч)
// ============================================
let btcChartInstance = null;
let tonChartInstance = null;
let ethChartInstance = null;

async function loadCryptoHistory(symbol, period) {
  const pairMap = {
    'bitcoin': 'XBTUSD',
    'the-open-network': 'TONUSD',
    'ethereum': 'ETHUSD',
  };
  const pair = pairMap[symbol] || symbol;

  const is24h = period.hours === 24;
  const interval = is24h ? 60 : 1440;
  const limit = is24h ? 24 : period.days;

  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`;
  const data = await fetchJSONViaProxy(url);

  if (!data.result) throw new Error('Неверный формат Kraken');
  const resultKey = Object.keys(data.result).find(k => k !== 'last');
  if (!resultKey) throw new Error('Нет данных Kraken');

  const candles = data.result[resultKey];
  const recent = candles.slice(-limit);

  const labels = recent.map(c => {
    const d = new Date(c[0] * 1000);
    return is24h
      ? d.toISOString().slice(11, 16)
      : d.toISOString().slice(0, 10);
  });
  const values = recent.map(c => parseFloat(c[4]));

  return { labels, values };
}

function drawCryptoChart(canvasId, statusId, data, label, currentInstance) {
  const statusEl = document.getElementById(statusId);
  const canvasEl = document.getElementById(canvasId);

  if (currentInstance) currentInstance.destroy();
  const color = getTrendColor(data.values);

  const ctx = canvasEl.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        label: label,
        data: data.values,
        borderColor: color.border,
        backgroundColor: color.background,
        fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { display: false },
        y: {
          grid: { color: 'rgba(128,128,128,0.15)' },
          ticks: { color: tg.themeParams?.hint_color || '#888', font: { size: 10 } }
        }
      }
    }
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
    const ton = await loadCryptoHistory('the-open-network', period);
    tonChartInstance = drawCryptoChart('tonChart', 'tonStatus', ton, 'TON', tonChartInstance);

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
    const period = btn.dataset.hours ? { hours: 24 } : { days: parseInt(btn.dataset.days, 10) };
    renderCryptoChart(period);
  });
});

// ============================================
// Старт
// ============================================
switchTab('home');
