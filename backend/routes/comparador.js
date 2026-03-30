const express = require('express');
const router = express.Router();
const { searchProducts } = require('../services/sepaService');

router.get('/buscar', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const provincia = String(req.query.provincia || '').trim();
    const limit = Number(req.query.limit || 20);

    if (!query) {
      return res.json({
        success: true,
        total: 0,
        data: [],
      });
    }

    const { products, loadedAt, source } = await searchProducts({
      query,
      provincia,
      limit,
    });

    return res.json({
      success: true,
      total: products.length,
      loadedAt,
      source,
      data: products,
    });
  } catch (error) {
    console.error('Error general comparador:', error);
    return res.status(200).json({
      success: false,
      error: 'No se pudo procesar la búsqueda',
      data: [],
    });
  }
});

module.exports = router;
