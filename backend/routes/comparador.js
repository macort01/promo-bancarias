const express = require('express');
const { searchProducts } = require('../services/sepaService');

const router = express.Router();

router.get('/buscar', async (req, res, next) => {
  try {
    const { query, categoria, provincia, limit = 20 } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, error: 'Se requiere un término de búsqueda' });
    }

    const { products, loadedAt, source } = await searchProducts({ query, provincia, limit: Number(limit) });
    const filtered = categoria
      ? products.filter((p) => String(p.categoria || '').toLowerCase() === String(categoria).toLowerCase())
      : products;

    return res.json({
      success: true,
      count: filtered.length,
      data: filtered,
      meta: {
        source: 'SEPA',
        datasetUrl: 'https://datos.produccion.gob.ar/dataset/sepa-precios',
        loadedAt: loadedAt ? new Date(loadedAt).toISOString() : null,
        sourceFile: source,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/producto/:id', async (req, res, next) => {
  try {
    const { query = req.params.id } = req.query;
    const { products, loadedAt, source } = await searchProducts({ query, limit: 100 });
    const producto = products.find((p) => p.id === req.params.id || p.ean === req.params.id || p.nombre === req.params.id);

    if (!producto) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const prices = producto.comercios.map((c) => c.precio);
    const precioMasBajo = Math.min(...prices);
    const precioMasAlto = Math.max(...prices);
    const comercioMasBarato = producto.comercios.find((c) => c.precio === precioMasBajo);

    return res.json({
      success: true,
      data: {
        ...producto,
        precioMasBajo,
        comercioMasBarato,
        diferenciaPrecio: {
          max: precioMasAlto,
          min: precioMasBajo,
          porcentaje: precioMasBajo ? (((precioMasAlto - precioMasBajo) / precioMasBajo) * 100).toFixed(2) : '0.00',
        },
      },
      meta: {
        source: 'SEPA',
        datasetUrl: 'https://datos.produccion.gob.ar/dataset/sepa-precios',
        loadedAt: loadedAt ? new Date(loadedAt).toISOString() : null,
        sourceFile: source,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/categorias', async (req, res, next) => {
  try {
    const { products } = await searchProducts({ query: req.query.query || ' ', limit: 200 });
    const categorias = [...new Set(products.map((p) => p.categoria).filter(Boolean))];
    return res.json({ success: true, data: categorias });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
