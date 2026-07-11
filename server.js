// Servidor de la app Gastos.
// Mismo patrón que Objetivos e Inventario: Basic Auth global + rutas + estáticos.

const express = require('express');
const path = require('path');
const basicAuth = require('express-basic-auth');

const gastosRouter = require('./routes/gastos');

const app = express();
const PORT = process.env.PORT || 3005;

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));

if (process.env.AUTH_USER && process.env.AUTH_PASS) {
  app.use(basicAuth({
    users: { [process.env.AUTH_USER]: process.env.AUTH_PASS },
    challenge: true,
    realm: 'Gastos',
  }));
} else {
  console.warn('[auth] AUTH_USER/AUTH_PASS no configurados: la app está SIN autenticación');
}

app.get('/salud', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// El router de gastos expone /api/categorias, /api/gastos, etc.
// Se monta en la raíz para que las rutas queden como /api/gastos
app.use('/', gastosRouter);

// Estáticos: sirve public/gastos/index.html
app.use(express.static(path.join(__dirname, 'public', 'gastos')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gastos', 'index.html')));

app.listen(PORT, () => {
  console.log(`[gastos] escuchando en :${PORT}`);
});
