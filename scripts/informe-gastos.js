/**
 * Informe mensual de gastos → Telegram.
 * Se ejecuta el día 1 de cada mes a las 11:00 de Manila (03:00 UTC).
 * Reporta el mes ANTERIOR y lo compara con el mes previo a ese.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const TABLA = 'gastos_kv';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const NOMBRES_MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fmt(n) {
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mesISO(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function nombreMes(iso) {
  const [y, m] = iso.split('-');
  return `${NOMBRES_MES[Number(m) - 1]} ${y}`;
}

/**
 * Devuelve el mes anterior a "ahora" y el previo a ese, en formato YYYY-MM.
 * Usamos hora de Manila para decidir qué mes es "el pasado".
 */
function mesesReferencia() {
  const ahora = new Date();
  const manila = new Date(ahora.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  // primer día del mes actual en Manila
  const primerDiaEsteMes = new Date(manila.getFullYear(), manila.getMonth(), 1);
  // mes anterior
  const mesAnt = new Date(primerDiaEsteMes);
  mesAnt.setMonth(mesAnt.getMonth() - 1);
  // dos meses atrás
  const mesPrev = new Date(primerDiaEsteMes);
  mesPrev.setMonth(mesPrev.getMonth() - 2);
  return { mesAnterior: mesISO(mesAnt), mesPrevio: mesISO(mesPrev) };
}

async function cargarGastos(mesISO) {
  const { data, error } = await supabase
    .from(TABLA)
    .select('key, value')
    .like('key', 'gasto:%');
  if (error) throw error;
  return (data || [])
    .map(r => r.value)
    .filter(g => g && g.date && g.date.startsWith(mesISO));
}

function agregarPorCategoria(gastos) {
  const map = {};
  for (const g of gastos) map[g.category] = (map[g.category] || 0) + Number(g.amount_php);
  return map;
}

function porcentaje(actual, previo) {
  if (!previo) return actual > 0 ? '+∞%' : '—';
  const pct = ((actual - previo) / previo) * 100;
  const signo = pct >= 0 ? '+' : '';
  return `${signo}${pct.toFixed(1)}%`;
}

function construirInforme(mesAnterior, gastosMes, mesPrevio, gastosPrev) {
  const totalMes = gastosMes.reduce((s, g) => s + Number(g.amount_php), 0);
  const totalPrev = gastosPrev.reduce((s, g) => s + Number(g.amount_php), 0);
  const catMes = agregarPorCategoria(gastosMes);
  const catPrev = agregarPorCategoria(gastosPrev);

  const lineas = [];
  lineas.push(`📊 *Informe de ${nombreMes(mesAnterior)}*`);
  lineas.push('');
  lineas.push(`*Total del mes*: ${fmt(totalMes)} PHP`);
  lineas.push(`vs ${nombreMes(mesPrevio)}: ${fmt(totalPrev)} PHP (${porcentaje(totalMes, totalPrev)})`);
  lineas.push('');

  // Desglose por categoría, ordenado por gasto de este mes
  const categorias = new Set([...Object.keys(catMes), ...Object.keys(catPrev)]);
  const filas = [...categorias]
    .map(c => ({ cat: c, actual: catMes[c] || 0, previo: catPrev[c] || 0 }))
    .filter(f => f.actual > 0 || f.previo > 0)
    .sort((a, b) => b.actual - a.actual);

  if (filas.length) {
    lineas.push('*Por categoría*:');
    for (const f of filas) {
      const delta = porcentaje(f.actual, f.previo);
      lineas.push(`• ${f.cat}: ${fmt(f.actual)} PHP (${delta})`);
    }
    lineas.push('');
  }

  // Top 5 gastos más grandes
  const top = [...gastosMes]
    .sort((a, b) => Number(b.amount_php) - Number(a.amount_php))
    .slice(0, 5);
  if (top.length) {
    lineas.push('*Top 5 gastos*:');
    for (const g of top) {
      const dia = g.date.slice(8, 10);
      const orig = g.currency === 'EUR' ? ` _(${fmt(g.amount_original)} EUR)_` : '';
      lineas.push(`• ${dia} — ${g.category}: ${fmt(g.amount_php)} PHP${orig}`);
    }
  }

  if (!gastosMes.length) {
    return `📊 *${nombreMes(mesAnterior)}*\n\nNo hay gastos registrados este mes.`;
  }

  return lineas.join('\n');
}

async function enviarTelegram(texto) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'Markdown'
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram falló: ${err}`);
  }
}

(async () => {
  try {
    const { mesAnterior, mesPrevio } = mesesReferencia();
    console.log(`Generando informe: mes=${mesAnterior}, comparación=${mesPrevio}`);
    const [gastosMes, gastosPrev] = await Promise.all([
      cargarGastos(mesAnterior),
      cargarGastos(mesPrevio)
    ]);
    const texto = construirInforme(mesAnterior, gastosMes, mesPrevio, gastosPrev);
    console.log('--- Informe ---\n' + texto + '\n---');
    await enviarTelegram(texto);
    console.log('Enviado ✓');
  } catch (err) {
    console.error('Error generando informe:', err);
    process.exit(1);
  }
})();
