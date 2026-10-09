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
// Навигация
// ============================================
const SUBTITLES = {
  stocks: 'Акции',
  bonds: 'Облигации',
  index: 'Индекс Мосбиржи',
  dollar: 'Курс доллара',
  crypto: 'Криптовалюты',
};

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${name}"]`)?.classList.remove('hidden');
  document.querySelector(`.tab-btn[data-target="${name}"]`)?.classList.add('active');
  document.getElementById('pageSubtitle').textContent = SUBTITLES[name] || '';

  if (name === 'index' && !window.__imoexLoaded) { window.__imoexLoaded = true; renderChart('index', 'IMOEX', 365); }
  if (name === 'stocks' && !window.__stocksLoaded) { window.__stocksLoaded = true; renderStocksList(); }
  if (name === 'bonds' && !window.__bondsLoaded) { window.__bondsLoaded = true; renderBondsList(); }
  if (name === 'dollar' && !window.__dollarLoaded) { window.__dollarLoaded = true; renderDollarChart(365); }
  if (name === 'crypto' && !window.__cryptoLoaded) { window.__cryptoLoaded = true; renderCryptoChart(365); }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.target));
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
        ticker: row[iSecId],
        name: row[iShortName],
        last,
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
  renderChart(type === 'bond' ? 'bond' : 'stock', ticker, 365);
}

function closeStockView() {
  document.getElementById('stockView').classList.add('hidden');
  currentTicker = null;
  currentType = null;
  if (stockChartInstance) { stockChartInstance.destroy(); stockChartInstance = null; }
}

document.getElementById('stockBack').addEventListener('click', closeStockView);

document.querySelectorAll('#stockPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#stockPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (currentTicker) renderChart(currentType === 'bond' ? 'bond' : 'stock', currentTicker, parseInt(btn.dataset.days, 10));
  });
});

document.querySelectorAll('#indexPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#indexPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderChart('index', 'IMOEX', parseInt(btn.dataset.days, 10));
  });
});

// ============================================
// История MOEX
// ============================================
async function loadHistory(target, secid, days) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  let baseUrl;
  if (target === 'index') baseUrl = `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${secid}.json`;
  else if (target === 'bond') baseUrl = `https://iss.moex.com/iss/history/engines/stock/markets/bonds/boards/TQOB/securities/${secid}.json`;
  else baseUrl = `https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/${secid}.json`;

  let allRows = [], columns = null, start = 0;

  while (true) {
    const data = await fetchJSONViaProxy(`${baseUrl}?from=${fromStr}&start=${start}`);
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

async function renderChart(target, secid, days) {
  const statusEl = document.getElementById(target === 'index' ? 'chartStatus' : 'stockChartStatus');
  const canvasEl = document.getElementById(target === 'index' ? 'imoexChart' : 'stockChart');
  statusEl.textContent = `Загрузка за ${days} дн...`;

  try {
    const { labels, values } = await loadHistory(target, secid, days);
    if (values.length === 0) throw new Error('Нет данных за период');
    const ctx = canvasEl.getContext('2d');
    if (target === 'index' && window.__imoexChartInstance) window.__imoexChartInstance.destroy();
    if (target !== 'index' && stockChartInstance) stockChartInstance.destroy();

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: secid,
          data: values,
          borderColor: '#2481cc',
          backgroundColor: 'rgba(36, 129, 204, 0.15)',
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

// ============================================
// Доллар — ЦБ РФ (Windows-1251 → UTF-8)
// ============================================
let dollarChartInstance = null;

function decodeWindows1251(bytes) {
  const cp1251 = {
    0x80:'Ђ',0x81:'Ѓ',0x82:'‚',0x83:'ѓ',0x84:'„',0x85:'…',0x86:'†',0x87:'‡',0x88:'€',0x89:'‰',0x8A:'Љ',0x8B:'‹',0x8C:'Њ',0x8D:'Ќ',0x8E:'Ћ',0x8F:'Џ',
    0x90:'ђ',0x91:'‘',0x92:'’',0x93:'“',0x94:'”',0x95:'•',0x96:'–',0x97:'—',0x99:'™',0x9A:'љ',0x9B:'›',0x9C:'њ',0x9D:'ќ',0x9E:'ћ',0x9F:'џ',
    0xA0:' ',0xA1:'Ў',0xA2:'ў',0xA3:'Ј',0xA4:'¤',0xA5:'Ґ',0xA6:'¦',0xA7:'§',0xA8:'Ё',0xA9:'©',0xAA:'Є',0xAB:'«',0xAC:'¬',0xAD:'­',0xAE:'®',0xAF:'Ї',
    0xB0:'°',0xB1:'±',0xB2:'І',0xB3:'і',0xB4:'ґ',0xB5:'µ',0xB6:'¶',0xB7:'·',0xB8:'ё',0xB9:'№',0xBA:'є',0xBB:'»',0xBC:'ј',0xBD:'Ѕ',0xBE:'ѕ',0xBF:'ї',
  };
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    result += b < 128 ? String.fromCharCode(b) : (cp1251[b] || '?');
  }
  return result;
}

function parseCBRXml(xmlText) {
  const labels = [], values = [];
  const matches = xmlText.match(/<Record[^>]*>/g);
  if (!matches) return { labels, values };
  for (const tag of matches) {
    const dateMatch = tag.match(/Date="([^"]+)"/);
    const valueMatch = tag.match(/Value="([^"]+)"/);
    if (dateMatch && valueMatch) {
      const val = parseFloat(valueMatch[1].replace(',', '.'));
      if (!isNaN(val)) {
        const [d, m, y] = dateMatch[1].split('.');
        labels.push(`${y}-${m}-${d}`);
        values.push(val);
      }
    }
  }
  return { labels, values };
}

async function loadDollarHistory(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const url = `https://www.cbr.ru/scripts/XML_dynamic.asp?date_req1=${fmt(start)}&date_req2=${fmt(end)}&VAL_NM_RQ=R01235`;

  // Запрашиваем бинарно и декодируем из Windows-1251
  const response = await fetch(`${PROXY}?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const xmlText = decodeWindows1251(new Uint8Array(buffer));

  const { labels, values } = parseCBRXml(xmlText);
  if (values.length === 0) throw new Error('ЦБ не вернул данные');

  const combined = labels.map((d, i) => ({ d, v: values[i] }));
  combined.sort((a, b) => a.d.localeCompare(b.d));
  return { labels: combined.map(x => x.d), values: combined.map(x => x.v) };
}

async function renderDollarChart(days) {
  const statusEl = document.getElementById('dollarStatus');
  const canvasEl = document.getElementById('dollarChart');
  statusEl.textContent = `Загрузка за ${days} дн...`;

  try {
    const { labels, values } = await loadDollarHistory(days);
    if (values.length === 0) throw new Error('Нет данных');
    const ctx = canvasEl.getContext('2d');
    if (dollarChartInstance) dollarChartInstance.destroy();

    dollarChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'USD/RUB',
          data: values,
          borderColor: '#26a269',
          backgroundColor: 'rgba(38, 162, 105, 0.15)',
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

    statusEl.textContent = `Курс ЦБ РФ: ${values[values.length - 1].toFixed(4)} ₽`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Ошибка: ' + e.message;
  }
}

document.querySelectorAll('#dollarPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#dollarPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderDollarChart(parseInt(btn.dataset.days, 10));
  });
});

// ============================================
// Крипта — CoinGecko (последовательно с задержкой)
// ============================================
let cryptoChartInstance = null;

async function loadCryptoHistory(coinId, days) {
  const allowed = [1, 7, 14, 30, 90, 180, 365];
  let daysParam = 365;
  for (const d of allowed) {
    if (days <= d) { daysParam = d; break; }
  }
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${daysParam}`;
  const data = await fetchJSONViaProxy(url);
  if (!Array.isArray(data)) throw new Error('Неверный формат CoinGecko');

  // Формат: [timestamp, open, high, low, close]
  const labels = data.map(row => new Date(row[0]).toISOString().slice(0, 10));
  const values = data.map(row => row[4]);
  return { labels, values };
}

async function renderCryptoChart(days) {
  const statusEl = document.getElementById('cryptoStatus');
  const canvasEl = document.getElementById('cryptoChart');
  statusEl.textContent = `Загрузка за ${days} дн...`;

  try {
    // Последовательно, чтобы не получить 429
    statusEl.textContent = 'Загрузка BTC...';
    const btc = await loadCryptoHistory('bitcoin', days);

    await new Promise(r => setTimeout(r, 1500));
    statusEl.textContent = 'Загрузка TON...';
    const ton = await loadCryptoHistory('the-open-network', days);

    await new Promise(r => setTimeout(r, 1500));
    statusEl.textContent = 'Загрузка ETH...';
    const eth = await loadCryptoHistory('ethereum', days);

    const ctx = canvasEl.getContext('2d');
    if (cryptoChartInstance) cryptoChartInstance.destroy();

    cryptoChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: btc.labels,
        datasets: [
          { label: 'BTC', data: btc.values, borderColor: '#f2a900', backgroundColor: 'rgba(242, 169, 0, 0.05)', fill: false, tension: 0.25, pointRadius: 0, borderWidth: 2 },
          { label: 'TON', data: ton.values, borderColor: '#2481cc', backgroundColor: 'rgba(36, 129, 204, 0.05)', fill: false, tension: 0.25, pointRadius: 0, borderWidth: 2 },
          { label: 'ETH', data: eth.values, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.05)', fill: false, tension: 0.25, pointRadius: 0, borderWidth: 2 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: tg.themeParams?.text_color || '#000', font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { display: false },
          y: {
            grid: { color: 'rgba(128,128,128,0.15)' },
            ticks: { color: tg.themeParams?.hint_color || '#888', font: { size: 10 } }
          }
        }
      }
    });

    statusEl.textContent = 'BTC (жёлтый) • TON (синий) • ETH (фиолетовый)';
  } catch (e) {
    console.error('Ошибка крипты:', e);
    statusEl.textContent = 'Ошибка: ' + e.message;
  }
}

document.querySelectorAll('#cryptoPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cryptoPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCryptoChart(parseInt(btn.dataset.days, 10));
  });
});

// ============================================
// Старт
// ============================================
switchTab('index');
