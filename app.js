// ============================================
// IntranetInvest — фронтенд
// ============================================

const PROXY = 'https://intranetinvest-proxy-v2.romaievlev618.workers.dev';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ============================================
// Прокси-запрос
// ============================================
async function fetchViaProxy(targetUrl) {
  const url = `${PROXY}?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// ============================================
// Навигация по табам
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

  if (name === 'index' && !window.__imoexLoaded) {
    window.__imoexLoaded = true;
    renderChart('index', 'IMOEX', 365);
  }
  if (name === 'stocks' && !window.__stocksLoaded) {
    window.__stocksLoaded = true;
    renderStocksList();
  }
  if (name === 'bonds' && !window.__bondsLoaded) {
    window.__bondsLoaded = true;
    renderBondsList();
  }
  if (name === 'dollar' && !window.__dollarLoaded) {
    window.__dollarLoaded = true;
    renderDollarChart(365);
  }
  if (name === 'crypto' && !window.__cryptoLoaded) {
    window.__cryptoLoaded = true;
    renderCryptoChart(365);
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.target));
});

// ============================================
// Вкладка «Акции» — топ-100
// ============================================
async function renderStocksList() {
  const listEl = document.getElementById('stocksList');
  try {
    const url = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata';
    const data = await fetchViaProxy(url);

    const secCols = data.securities.columns;
    const secRows = data.securities.data;
    const mdCols = data.marketdata.columns;
    const mdRows = data.marketdata.data;

    const iSecId = secCols.indexOf('SECID');
    const iShortName = secCols.indexOf('SHORTNAME');
    const iPrev = mdCols.indexOf('PREVPRICE');
    const iLast = mdCols.indexOf('LAST');
    const iValToday = mdCols.indexOf('VALTODAY');

    const stocks = secRows.map((row, i) => {
      const md = mdRows[i] || [];
      const last = md[iLast];
      const prev = md[iPrev];
      const turnover = md[iValToday] || 0;
      const change = (last && prev) ? ((last - prev) / prev * 100) : null;
      return {
        ticker: row[iSecId],
        name: row[iShortName],
        last,
        change,
        turnover,
      };
    })
    .filter(s => s.last != null && s.turnover > 0)
    .sort((a, b) => b.turnover - a.turnover)
    .slice(0, 100);

    listEl.innerHTML = stocks.map(s => {
      const changeClass = s.change > 0 ? 'up' : (s.change < 0 ? 'down' : '');
      const changeText = s.change != null
        ? `${s.change > 0 ? '+' : ''}${s.change.toFixed(2)}%`
        : '—';
      return `
        <div class="stock-row" data-ticker="${s.ticker}" data-name="${s.name || ''}" data-type="stock">
          <div>
            <div class="stock-ticker">${s.ticker}</div>
            <div class="stock-name">${s.name || ''}</div>
          </div>
          <div class="stock-price">${s.last.toFixed(2)}</div>
          <div class="stock-change ${changeClass}">${changeText}</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.stock-row').forEach(row => {
      row.addEventListener('click', () => {
        openStockView(row.dataset.ticker, row.dataset.name, 'stock');
      });
    });

  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="status">Ошибка загрузки: ${e.message}</p>`;
  }
}

// ============================================
// Вкладка «Облигации» — топ-10 ОФЗ + топ-20 корпоративных
// ============================================
async function renderBondsList() {
  const listEl = document.getElementById('bondsList');
  try {
    const url = 'https://iss.moex.com/iss/engines/stock/markets/bonds/boards/TQOB/securities.json?iss.meta=off&iss.only=securities,marketdata';
    const data = await fetchViaProxy(url);

    const secCols = data.securities.columns;
    const secRows = data.securities.data;
    const mdCols = data.marketdata.columns;
    const mdRows = data.marketdata.data;

    const iSecId = secCols.indexOf('SECID');
    const iShortName = secCols.indexOf('SHORTNAME');
    const iCoupon = secCols.indexOf('COUPONPERCENT');

    const iLast = mdCols.indexOf('LAST');
    const iPrev = mdCols.indexOf('PREVPRICE');
    const iValToday = mdCols.indexOf('VALTODAY');
    const iYield = mdCols.indexOf('YIELDATPREVWAPRICE');

    const allBonds = secRows.map((row, i) => {
      const md = mdRows[i] || [];
      const last = md[iLast];
      const prev = md[iPrev];
      const turnover = md[iValToday] || 0;
      const coupon = row[iCoupon];
      const yieldVal = md[iYield];
      const change = (last && prev) ? ((last - prev) / prev * 100) : null;
      return {
        ticker: row[iSecId],
        name: row[iShortName],
        last,
        prev,
        coupon,
        yieldVal,
        turnover,
        change,
      };
    }).filter(b => b.last != null && b.turnover > 0);

    const ofz = allBonds
      .filter(b => b.ticker.startsWith('SU'))
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, 10);

    const corporate = allBonds
      .filter(b => !b.ticker.startsWith('SU'))
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, 20);

    const bonds = [...ofz, ...corporate];

    listEl.innerHTML = bonds.map(b => {
      const isOfz = b.ticker.startsWith('SU');
      const couponText = b.coupon != null ? b.coupon.toFixed(2) : '—';
      const priceText = b.last != null ? b.last.toFixed(2) : '—';
      const yieldText = b.yieldVal != null ? b.yieldVal.toFixed(2) : '—';
      return `
        <div class="bond-row" data-ticker="${b.ticker}" data-name="${b.name || ''}" data-type="bond">
          <div>
            <div class="stock-ticker">
              ${isOfz ? '<span class="ofz-badge">ОФЗ</span> ' : ''}${b.ticker}
            </div>
            <div class="stock-name">${b.name || ''}</div>
          </div>
          <div class="bond-cell bond-coupon">${couponText}%</div>
          <div class="bond-cell">${priceText}</div>
          <div class="bond-cell">${yieldText}%</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.bond-row').forEach(row => {
      row.addEventListener('click', () => {
        openStockView(row.dataset.ticker, row.dataset.name, 'bond');
      });
    });

  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="status">Ошибка загрузки: ${e.message}</p>`;
  }
}

// ============================================
// Экран конкретной бумаги
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
  if (stockChartInstance) {
    stockChartInstance.destroy();
    stockChartInstance = null;
  }
}

document.getElementById('stockBack').addEventListener('click', closeStockView);

document.querySelectorAll('#stockPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#stockPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (currentTicker) {
      renderChart(currentType === 'bond' ? 'bond' : 'stock', currentTicker, parseInt(btn.dataset.days, 10));
    }
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
// Универсальная загрузка истории с MOEX
// target: 'index' | 'stock' | 'bond'
// ============================================
async function loadHistory(target, secid, days) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  let baseUrl;
  if (target === 'index') {
    baseUrl = `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${secid}.json`;
  } else if (target === 'bond') {
    baseUrl = `https://iss.moex.com/iss/history/engines/stock/markets/bonds/boards/TQOB/securities/${secid}.json`;
  } else {
    baseUrl = `https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/${secid}.json`;
  }

  let allRows = [];
  let columns = null;
  let start = 0;
  const PAGE = 100;

  while (true) {
    const url = `${baseUrl}?from=${fromStr}&start=${start}`;
    const data = await fetchViaProxy(url);

    if (!data.history || !data.history.data) break;

    if (!columns) columns = data.history.columns;
    const rows = data.history.data;

    allRows = allRows.concat(rows);

    if (rows.length < PAGE) break;

    start += PAGE;
    if (start > 10000) break;
  }

  if (!columns) throw new Error('Нет данных');

  const closeIdx = columns.indexOf('CLOSE');
  const dateIdx = columns.indexOf('TRADEDATE');

  allRows.sort((a, b) => {
    const da = a[dateIdx];
    const db = b[dateIdx];
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });

  const labels = allRows.map(r => r[dateIdx]);
  const values = allRows.map(r => r[closeIdx]).filter(v => v !== null);

  return { labels, values };
}

// ============================================
// Универсальная отрисовка графика
// ============================================
async function renderChart(target, secid, days) {
  const statusEl = document.getElementById(target === 'index' ? 'chartStatus' : 'stockChartStatus');
  const canvasEl = document.getElementById(target === 'index' ? 'imoexChart' : 'stockChart');

  statusEl.textContent = `Загрузка за ${days} дн...`;

  try {
    const { labels, values } = await loadHistory(target, secid, days);
    if (values.length === 0) throw new Error('Нет данных за период');

    const ctx = canvasEl.getContext('2d');

    if (target === 'index' && window.__imoexChartInstance) {
      window.__imoexChartInstance.destroy();
    }
    if (target !== 'index' && stockChartInstance) {
      stockChartInstance.destroy();
    }

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: secid,
          data: values,
          borderColor: '#2481cc',
          backgroundColor: 'rgba(36, 129, 204, 0.15)',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { display: false },
          y: {
            grid: { color: 'rgba(128,128,128,0.15)' },
            ticks: {
              color: tg.themeParams?.hint_color || '#888',
              font: { size: 10 },
            }
          }
        }
      }
    });

    if (target === 'index') window.__imoexChartInstance = chart;
    if (target !== 'index') stockChartInstance = chart;

    const last = values[values.length - 1];
    const first = values[0];
    const change = ((last - first) / first * 100).toFixed(2);
    const sign = change > 0 ? '+' : '';
    statusEl.textContent = `Текущее: ${last.toFixed(2)} • Изменение: ${sign}${change}%`;

  } catch (e) {
    console.error('Ошибка графика:', e);
    statusEl.textContent = 'Ошибка: ' + e.message;
  }
}

// ============================================
// Вкладка «Доллар» — курс USD/RUB с MOEX
// ============================================
let dollarChartInstance = null;

async function loadDollarHistory(days) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  const baseUrl = `https://iss.moex.com/iss/history/engines/currency/markets/selt/boards/CETS/securities/USD000UTSTOM.json`;

  let allRows = [];
  let columns = null;
  let start = 0;
  const PAGE = 100;

  while (true) {
    const url = `${baseUrl}?from=${fromStr}&start=${start}`;
    const data = await fetchViaProxy(url);

    if (!data.history || !data.history.data) break;

    if (!columns) columns = data.history.columns;
    const rows = data.history.data;

    allRows = allRows.concat(rows);

    if (rows.length < PAGE) break;

    start += PAGE;
    if (start > 10000) break;
  }

  if (!columns) throw new Error('Нет данных');

  const closeIdx = columns.indexOf('CLOSE');
  const dateIdx = columns.indexOf('TRADEDATE');

  allRows.sort((a, b) => {
    const da = a[dateIdx];
    const db = b[dateIdx];
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });

  const labels = allRows.map(r => r[dateIdx]);
  const values = allRows.map(r => r[closeIdx]).filter(v => v !== null);

  return { labels, values };
}

async function renderDollarChart(days) {
  const statusEl = document.getElementById('dollarStatus');
  const canvasEl = document.getElementById('dollarChart');
  statusEl.textContent = `Загрузка за ${days} дн...`;

  try {
    const { labels, values } = await loadDollarHistory(days);
    if (values.length === 0) throw new Error('Нет данных за период');

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
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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

    const last = values[values.length - 1];
    statusEl.textContent = `Текущий курс: ${last.toFixed(4)} ₽`;
  } catch (e) {
    console.error('Ошибка курса доллара:', e);
    statusEl.textContent = 'Ошибка: ' + e.message;
  }
}

// Кнопки периодов для доллара
document.querySelectorAll('#dollarPeriods .period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#dollarPeriods .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderDollarChart(parseInt(btn.dataset.days, 10));
  });
});

// ============================================
// Вкладка «Крипта» — BTC + TON + ETH через CoinGecko
// ============================================
let cryptoChartInstance = null;

async function loadCryptoHistory(coinId, days) {
  // CoinGecko: доступны только 1, 7, 14, 30, 90, 180, 365
  const allowed = [1, 7, 14, 30, 90, 180, 365];
  let daysParam = 365;
  for (const d of allowed) {
    if (days <= d) { daysParam = d; break; }
  }

  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${daysParam}`;
  const data = await fetchViaProxy(url);

  if (!Array.isArray(data)) throw new Error('Неверный формат данных');

  // Формат: [timestamp, open, high, low, close]
  const labels = data.map(row => {
    const d = new Date(row[0]);
    return d.toISOString().slice(0, 10);
  });
  const values = data.map(row => row[4]);

  return { labels, values };
}

async function renderCryptoChart(days) {
  const statusEl = document.getElementById('cryptoStatus');
  const canvasEl = document.getElementById('cryptoChart');
  statusEl.textContent = `Загрузка за ${days} дн...`;

  try {
    const [btc, ton, eth] = await Promise.all([
      loadCryptoHistory('bitcoin', days),
      loadCryptoHistory('the-open-network', days),
      loadCryptoHistory('ethereum', days),
    ]);

    const ctx = canvasEl.getContext('2d');
    if (cryptoChartInstance) cryptoChartInstance.destroy();

    cryptoChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: btc.labels,
        datasets: [
          {
            label: 'BTC',
            data: btc.values,
            borderColor: '#f2a900',
            backgroundColor: 'rgba(242, 169, 0, 0.05)',
            fill: false,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'TON',
            data: ton.values,
            borderColor: '#2481cc',
            backgroundColor: 'rgba(36, 129, 204, 0.05)',
            fill: false,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'ETH',
            data: eth.values,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
            fill: false,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 2,
          },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: tg.themeParams?.text_color || '#000',
              font: { size: 11 },
            }
          },
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

// Кнопки периодов для крипты
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
