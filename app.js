// ============================================
// IntranetInvest — фронтенд
// Путь А: отдельный Cloudflare Worker как прокси
// ============================================

// ⚠️ ЗАМЕНИ на свой URL из Cloudflare Worker
const PROXY = 'https://intranetinvest-proxy-v2.romaievlev618.workers.dev';

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Применяем тему Telegram (если открыто внутри Telegram)
if (tg.themeParams) {
  document.body.style.background = tg.themeParams.bg_color || '#fff';
  document.body.style.color = tg.themeParams.text_color || '#000';
}

// ============================================
// Утилита: запрос через прокси
// ============================================
async function fetchViaProxy(targetUrl) {
  const url = `${PROXY}?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

// ============================================
// Загрузка истории Индекса Мосбиржи (IMOEX)
// ============================================
async function loadIMOEX() {
  const url = 'https://iss.moex.com/iss/history/engines/stock/markets/index/securities/IMOEX.json?from=2024-01-01';
  const data = await fetchViaProxy(url);

  // Проверяем структуру ответа
  if (!data.history || !data.history.columns || !data.history.data) {
    throw new Error('Неверный формат ответа MOEX');
  }

  const { columns, data: rows } = data.history;
  const closeIdx = columns.indexOf('CLOSE');
  const dateIdx = columns.indexOf('TRADEDATE');

  if (closeIdx === -1 || dateIdx === -1) {
    throw new Error('Нет полей CLOSE или TRADEDATE');
  }

  // MOEX отдаёт данные от новых к старым — разворачиваем
  const sorted = rows.slice().reverse();
  const labels = sorted.map(r => r[dateIdx]);
  const values = sorted.map(r => r[closeIdx]).filter(v => v !== null);

  return { labels, values };
}

// ============================================
// Отрисовка графика
// ============================================
async function renderChart() {
  const statusEl = document.getElementById('chartStatus');
  statusEl.textContent = 'Загрузка данных...';

  try {
    const { labels, values } = await loadIMOEX();

    if (values.length === 0) {
      throw new Error('Пустой массив данных');
    }

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
          tooltip: {
            mode: 'index',
            intersect: false,
          }
        },
        scales: {
          x: {
            display: false,
          },
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

    // Итоговая статистика под графиком
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

// Запуск
renderChart();
