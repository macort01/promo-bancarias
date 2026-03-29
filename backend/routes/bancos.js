const express = require('express');
const router = express.Router();

const bancos = [
  { id: 'santander', nombre: 'Santander', tipo: 'banco', logo: '/icons/banks/santander.png', descripcion: 'Banco Santander Argentina' },
  { id: 'galicia', nombre: 'Banco Galicia', tipo: 'banco', logo: '/icons/banks/galicia.png', descripcion: 'Banco Galicia' },
  { id: 'bbva', nombre: 'BBVA', tipo: 'banco', logo: '/icons/banks/bbva.png', descripcion: 'BBVA Argentina' },
  { id: 'macro', nombre: 'Banco Macro', tipo: 'banco', logo: '/icons/banks/macro.png', descripcion: 'Banco Macro' },
  { id: 'nacion', nombre: 'Banco Nación', tipo: 'banco', logo: '/icons/banks/nacion.png', descripcion: 'Banco de la Nación Argentina' },
  { id: 'icbc', nombre: 'ICBC', tipo: 'banco', logo: '/icons/banks/icbc.png', descripcion: 'ICBC Argentina' },
  { id: 'provincia', nombre: 'Banco Provincia', tipo: 'banco', logo: '/icons/banks/provincia.png', descripcion: 'Banco Provincia de Buenos Aires' },
  { id: 'mercadopago', nombre: 'Mercado Pago', tipo: 'billetera', logo: '/icons/banks/mercadopago.png', descripcion: 'Billetera virtual Mercado Pago' },
  { id: 'uala', nombre: 'Ualá', tipo: 'billetera', logo: '/icons/banks/uala.png', descripcion: 'Billetera virtual Ualá' },
  { id: 'personalpay', nombre: 'Personal Pay', tipo: 'billetera', logo: '/icons/banks/personalpay.png', descripcion: 'Billetera virtual Personal Pay' },
  { id: 'modo', nombre: 'Modo', tipo: 'billetera', logo: '/icons/banks/modo.png', descripcion: 'Billetera virtual Modo' },
  { id: 'naranjax', nombre: 'Naranja X', tipo: 'billetera', logo: '/icons/banks/naranjax.png', descripcion: 'Billetera virtual Naranja X' },
];

router.get('/tipo/bancos', (req, res) => {
  const filtered = bancos.filter((b) => b.tipo === 'banco');
  res.json({ success: true, count: filtered.length, data: filtered });
});

router.get('/tipo/billeteras', (req, res) => {
  const filtered = bancos.filter((b) => b.tipo === 'billetera');
  res.json({ success: true, count: filtered.length, data: filtered });
});

router.get('/', (req, res) => {
  const { tipo } = req.query;
  const filtered = tipo ? bancos.filter((b) => b.tipo === tipo) : bancos;
  res.json({ success: true, count: filtered.length, data: filtered });
});

router.get('/:id', (req, res) => {
  const banco = bancos.find((b) => b.id === req.params.id);
  if (!banco) {
    return res.status(404).json({ success: false, error: 'Banco o billetera no encontrada' });
  }
  return res.json({ success: true, data: banco });
});

module.exports = router;
