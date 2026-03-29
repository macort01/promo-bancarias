const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const promocionesRoutes = require('./routes/promociones');
const bancosRoutes = require('./routes/bancos');
const comparadorRoutes = require('./routes/comparador');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.join(__dirname, '..');
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map((item) => item.trim()) }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(0)),
  });
});

app.use('/api/promociones', promocionesRoutes);
app.use('/api/bancos', bancosRoutes);
app.use('/api/comparador', comparadorRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Promos Argentina escuchando en puerto ${PORT}`);
});

module.exports = app;
