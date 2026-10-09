// ============================================
// IntranetInvest — фронтенд
// ============================================

const PROXY = 'https://intranetinvest-proxy-v2.romaievlev618.workers.dev';

// Инициализация Telegram
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
  rate: 'Ключевая ставка',
  inflation: 'Инфляция',
};

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${name}"]`)?.classList.remove('hidden');
  document.querySelector(`.tab-btn[data-target="${name}"]`)?.classList.add('active');

  document.getElementById('pageSubtitle').textContent = SUBTITLES[name] || '';

  // Ленивая загрузка данных при первом открытии вкладки
  if (name === 'index' && !window.__imoexLoaded) {
    window.__imoexLoaded = true;
    renderIMOEXChart();
  }
  if (name === 'stocks' && !window.__stocksLoaded) {
    window.__stocksLoaded = true;
    renderStocksList();
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
    // Берём все акции с основного режима TQBR
    const url = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata';
    const data = await fetchViaProxy(url);

    const secCols = data.securities.columns;
    const secRows = data.securities.data;
    const mdCols = data.marketdata.columns;
    const mdRows = data.marketdata.data;

    // Индексы нужных колонок
    const iSecId = secCols.indexOf('SECID');
    const iShortName = secCols.indexOf('SHORTNAME');
    const iPrev = mdCols.indexOf('PREVPRICE');
    const iLast = mdCols.indexOf('LAST');
    const iValToday = mdCols.indexOf('VALTODAY');

    // Собираем объекты и сортируем по обороту за день
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

    // Рендер
    listEl.innerHTML = stocks.map(s => {
      const changeClass = s.change > 0 ? 'up' : (s.change < 0 ? 'down' : '');
      const changeText = s.change != null
        ? `${s.change > 0 ? '+' : ''}${s.change.toFixed(2)}%`
        : '—';
      return `
        <div class="stock-row">
          <div>
            <div class="stock-ticker">${s.ticker}</div>
            <div class="stock-name">${s.name || ''}</div>
          </div>
          <div class="stock-price">${s.last.toFixed(2)}</div>
          <div class="stock-change ${changeClass}">${changeText}</div>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="status">Ошибка загрузки: ${e.message}</p>`;
  }
}

// ============================================
// Вкладка «Индекс» — график IMOEX
// ============================================
async function loadIMOEX() {
  const url = 'https://iss.moex.com/iss/history/engines/stock/markets/index/securities/IMOEX.json?from=2024-01-01';
  const data = await fetchViaProxy(url);

  const { columns, data: rows } = data.history;
  const closeIdx = columns.indexOf('CLOSE');
  const dateIdx = columns.indexOf('TRADEDATE');

  const sorted = rows.slice().reverse();
  const labels = sorted.map(r => r[dateIdx]);
  const values = sorted.map(r => r[closeIdx]).filter(v => v !== null);

  return { labels, values };
}

async function renderIMOEXChart() {
  const statusEl = document.getElementById('chartStatus');
  statusEl.textContent = 'Загрузка данных...';

  try {
    const { labels, values } = await loadIMOEX();
    if (values.length === 0) throw new Error('Пустой массив данных');

    const ctx = document.getElementById('imoexChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'IMOEX',
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
// Старт: открываем вкладку «Индекс» по умолчанию
// ============================================
switchTab('index');
