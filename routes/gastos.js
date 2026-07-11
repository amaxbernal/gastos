const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const TABLA = 'gastos_kv';

const CATEGORIAS_DEFAULT = [
  'Comida y supermercado',
  'Restaurantes y cafés',
  'Alquiler y vivienda',
  'Servicios',
  'Transporte',
  'Salud y farmacia',
  'Deporte',
  'Ropa y calzado',
  'Electrónica',
  'Suscripciones',
  'Ocio',
  'Viaje España',
  'Otros'
];

// ---------- Categorías ----------
router.get('/api/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TABLA)
      .select('value')
      .eq('key', 'categorias')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      await supabase.from(TABLA).upsert({ key: 'categorias', value: CATEGORIAS_DEFAULT });
      return res.json(CATEGORIAS_DEFAULT);
    }
    res.json(data.value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/categorias', async (req, res) => {
  try {
    const { categorias } = req.body;
    if (!Array.isArray(categorias) || categorias.some(c => typeof c !== 'string' || !c.trim())) {
      return res.status(400).json({ error: 'categorias debe ser un array de strings no vacíos' });
    }
    const limpias = categorias.map(c => c.trim());
    const { error } = await supabase
      .from(TABLA)
      .upsert({ key: 'categorias', value: limpias });
    if (error) throw error;
    res.json({ ok: true, categorias: limpias });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Gastos ----------
router.get('/api/gastos', async (req, res) => {
  try {
    const mes = req.query.mes; // YYYY-MM opcional — sin él devuelve todo

    const { data, error } = await supabase
      .from(TABLA)
      .select('key, value')
      .like('key', 'gasto:%');

    if (error) throw error;

    let gastos = (data || [])
      .map(row => row.value)
      .filter(g => g && g.date);
    if (mes) gastos = gastos.filter(g => g.date.startsWith(mes));
    gastos.sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at));

    res.json(gastos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Borrar todos los gastos (útil para limpiar tras probar con datos de ejemplo)
router.delete('/api/gastos', async (req, res) => {
  try {
    const { error } = await supabase
      .from(TABLA)
      .delete()
      .like('key', 'gasto:%');
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Datos de ejemplo: genera ~6 meses de gastos realistas incluyendo un viaje a España
router.post('/api/seed', async (req, res) => {
  try {
    const gastos = generarDatosEjemplo();
    const filas = gastos.map(g => ({ key: `gasto:${g.id}`, value: g }));
    const BATCH = 500;
    for (let i = 0; i < filas.length; i += BATCH) {
      const chunk = filas.slice(i, i + BATCH);
      const { error } = await supabase.from(TABLA).upsert(chunk);
      if (error) throw error;
    }
    res.json({ ok: true, count: gastos.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generarDatosEjemplo() {
  const ahora = new Date();
  const manila = new Date(ahora.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const gastos = [];

  const rand = (min, max) => Math.round((Math.random() * (max - min) + min) * 100) / 100;
  const dateISO = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const isoTs = (y, m, d) => new Date(Date.UTC(y, m, d, 12)).toISOString();

  const mk = (y, m, d, category, amountPhp) => ({
    id: randomUUID(),
    amount_php: Math.round(amountPhp * 100) / 100,
    amount_original: Math.round(amountPhp * 100) / 100,
    currency: 'PHP',
    exchange_rate: null,
    category,
    date: dateISO(y, m, d),
    created_at: isoTs(y, m, d)
  });

  const mkEur = (y, m, d, category, amountEur, rate) => ({
    id: randomUUID(),
    amount_php: Math.round(amountEur * rate * 100) / 100,
    amount_original: Math.round(amountEur * 100) / 100,
    currency: 'EUR',
    exchange_rate: rate,
    category,
    date: dateISO(y, m, d),
    created_at: isoTs(y, m, d)
  });

  for (let atras = 5; atras >= 0; atras--) {
    const target = new Date(manila.getFullYear(), manila.getMonth() - atras, 1);
    const y = target.getFullYear();
    const m = target.getMonth();
    const diasEnMes = new Date(y, m + 1, 0).getDate();
    const esMesActual = atras === 0;
    const maxDia = esMesActual ? Math.min(manila.getDate(), diasEnMes) : diasEnMes;

    // Fijos recurrentes
    gastos.push(mk(y, m, 1, 'Alquiler y vivienda', 28000));
    gastos.push(mk(y, m, 3, 'Servicios', rand(2800, 4500))); // electricidad (AC alto)
    gastos.push(mk(y, m, 3, 'Servicios', rand(400, 700)));   // agua
    gastos.push(mk(y, m, 5, 'Servicios', 1799));             // internet
    gastos.push(mk(y, m, 5, 'Suscripciones', 549));          // netflix
    gastos.push(mk(y, m, 5, 'Suscripciones', 250));          // spotify
    gastos.push(mk(y, m, 10, 'Suscripciones', 1150));        // ia

    // Variables diarios/semanales
    for (let d = 1; d <= maxDia; d++) {
      if (Math.random() < 0.35) gastos.push(mk(y, m, d, 'Comida y supermercado', rand(350, 2200)));
      if (Math.random() < 0.28) gastos.push(mk(y, m, d, 'Restaurantes y cafés', rand(250, 1600)));
      if (Math.random() < 0.45) gastos.push(mk(y, m, d, 'Transporte', rand(120, 480)));
      if (Math.random() < 0.15) gastos.push(mk(y, m, d, 'Ocio', rand(200, 2500)));
    }

    // Ocasionales
    if (Math.random() < 0.7) gastos.push(mk(y, m, Math.max(1, Math.floor(rand(5, maxDia))), 'Salud y farmacia', rand(200, 1500)));
    if (Math.random() < 0.5) gastos.push(mk(y, m, Math.max(1, Math.floor(rand(5, maxDia))), 'Deporte', rand(500, 2800)));
    if (Math.random() < 0.25) gastos.push(mk(y, m, Math.max(1, Math.floor(rand(5, maxDia))), 'Ropa y calzado', rand(600, 2500)));
    if (Math.random() < 0.15) gastos.push(mk(y, m, Math.max(1, Math.floor(rand(5, maxDia))), 'Electrónica', rand(1200, 12000)));
  }

  // Viaje a España: 3 meses atrás, 3 semanas en EUR
  const viaje = new Date(manila.getFullYear(), manila.getMonth() - 3, 1);
  const vy = viaje.getFullYear();
  const vm = viaje.getMonth();
  const tasa = 61.5;
  gastos.push(mkEur(vy, vm, 5, 'Viaje España', 780, tasa));   // vuelo ida y vuelta
  for (let d = 8; d <= 28; d++) {
    if (Math.random() < 0.85) gastos.push(mkEur(vy, vm, d, 'Viaje España', rand(15, 65), tasa));
  }

  return gastos;
}

function calcularPhp({ amount_original, currency, exchange_rate }) {
  const orig = Number(amount_original);
  if (currency === 'PHP') return Math.round(orig * 100) / 100;
  return Math.round(orig * Number(exchange_rate) * 100) / 100;
}

function validarGasto(body) {
  const { amount_original, currency, category, date } = body;
  if (amount_original === undefined || amount_original === null || Number.isNaN(Number(amount_original)) || Number(amount_original) <= 0) {
    return 'Cantidad inválida';
  }
  if (currency !== 'PHP' && currency !== 'EUR') return 'Moneda inválida';
  if (currency === 'EUR' && (!body.exchange_rate || Number.isNaN(Number(body.exchange_rate)) || Number(body.exchange_rate) <= 0)) {
    return 'Tasa de cambio inválida';
  }
  if (!category || typeof category !== 'string') return 'Categoría inválida';
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Fecha inválida (formato YYYY-MM-DD)';
  return null;
}

router.post('/api/gastos', async (req, res) => {
  try {
    const err = validarGasto(req.body);
    if (err) return res.status(400).json({ error: err });

    const { amount_original, currency, exchange_rate, category, date } = req.body;
    const gasto = {
      id: randomUUID(),
      amount_php: calcularPhp({ amount_original, currency, exchange_rate }),
      amount_original: Number(amount_original),
      currency,
      exchange_rate: currency === 'EUR' ? Number(exchange_rate) : null,
      category,
      date,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from(TABLA)
      .upsert({ key: `gasto:${gasto.id}`, value: gasto });
    if (error) throw error;

    res.json(gasto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/gastos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const err = validarGasto(req.body);
    if (err) return res.status(400).json({ error: err });

    const { data: existing, error: fetchError } = await supabase
      .from(TABLA)
      .select('value')
      .eq('key', `gasto:${id}`)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) return res.status(404).json({ error: 'Gasto no encontrado' });

    const { amount_original, currency, exchange_rate, category, date } = req.body;
    const gasto = {
      ...existing.value,
      amount_php: calcularPhp({ amount_original, currency, exchange_rate }),
      amount_original: Number(amount_original),
      currency,
      exchange_rate: currency === 'EUR' ? Number(exchange_rate) : null,
      category,
      date
    };

    const { error } = await supabase
      .from(TABLA)
      .upsert({ key: `gasto:${id}`, value: gasto });
    if (error) throw error;

    res.json(gasto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/gastos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from(TABLA)
      .delete()
      .eq('key', `gasto:${id}`);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
