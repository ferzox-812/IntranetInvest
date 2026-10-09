// Укажи свой Worker URL
const PROXY = 'https://intranetinvest-proxy.твой-субдомен.workers.dev';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Функция для запросов через прокси
async function fetchViaProxy(targetUrl) {
  const url = `${PROXY}?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Ошибка запроса');
  return response.json();
}

// Загрузка истории Индекса Мосбиржи
async function loadIMOEX() {
  const url = 'https://iss.moex.com/iss/history/engines/stock/markets/index/securities/IMOEX.json?from=2024-01-01';
  const data = await fetchViaProxy(url);
  
  // Парсим структуру ответа MOEX
  const history = data.history;
  const columns = history.columns;
  const rows = history.data;
  
  const closeIdx = columns.indexOf('CLOSE');
  const dateIdx = columns.indexOf('TRADEDATE');
  
  const labels = rows.map(r => r[dateIdx]).reverse();
  const values = rows.map(r => r[closeIdx]).reverse();
  
  return { labels, values };
}

// Рисуем график
async function renderChart() {
  try {
    const { labels, values } = await loadIMOEX();
    
    const ctx = document.getElementById('imoexChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'IMOEX',
          data: values,
          borderColor: '#2481cc',
          backgroundColor: 'rgba(36, 129, 204, 0.1)',
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: false },
          y: { 
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#aaa' }
          }
        }
      }
    });
  } catch (e) {
    console.error('Ошибка графика:', e);
    document.getElementById('chartStatus').textContent = 'Не удалось загрузить данные';
  }
}

renderChart();
