const express = require('express');
const { loadPromotions } = require('../services/promotionsStore');
const { getOfficialPromotions, getOfficialSourcesStatus } = require('../services/livePromotionsService');

const router = express.Router();

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function getPromociones(options = {}) {
  const manual = loadPromotions();
  const includeOfficial = options.includeOfficial !== false;
  if (!includeOfficial) return { rows: manual, officialLoadedAt: null };

  const official = await getOfficialPromotions({ forceRefresh: options.forceRefresh });
  return {
    rows: [...manual, ...official.data],
    officialLoadedAt: official.loadedAt ? new Date(official.loadedAt).toISOString() : null,
  };
}


router.get('/sources', async (req, res, next) => {
  try {
    const refresh = String(req.query.refresh || 'false') === 'true';
    const official = await getOfficialPromotions({ forceRefresh: refresh });
    res.json({
      success: true,
      loadedAt: official.loadedAt ? new Date(official.loadedAt).toISOString() : null,
      count: (official.sources || []).length,
      data: getOfficialSourcesStatus(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/featured/destacadas', async (req, res, next) => {
  try {
    const { rows } = await getPromociones();
    const featured = rows.filter((p) => p.activa).sort((a, b) => b.descuento - a.descuento).slice(0, 8);
    res.json({ success: true, data: featured });
  } catch (error) {
    next(error);
  }
});

router.get('/banco/:banco', async (req, res, next) => {
  try {
    const { rows } = await getPromociones();
    const filtered = rows.filter((p) => normalize(p.banco) === normalize(req.params.banco) && p.activa);
    res.json({ success: true, count: filtered.length, data: filtered });
  } catch (error) {
    next(error);
  }
});

router.get('/rubro/:rubro', async (req, res, next) => {
  try {
    const { rows } = await getPromociones();
    const filtered = rows.filter((p) => normalize(p.rubro) === normalize(req.params.rubro) && p.activa);
    res.json({ success: true, count: filtered.length, data: filtered });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const {
      banco,
      rubro,
      provincia,
      ciudad,
      dia,
      minDescuento,
      search,
      fuente,
      includeOfficial = 'true',
      refresh = 'false',
      limit = 50,
      offset = 0,
    } = req.query;

    const { rows, officialLoadedAt } = await getPromociones({
      includeOfficial: includeOfficial !== 'false',
      forceRefresh: refresh === 'true',
    });

    let filtered = rows.filter((p) => p.activa);

    if (fuente) {
      filtered = filtered.filter((p) => normalize(p.fuente) === normalize(fuente));
    }

    if (banco) {
      filtered = filtered.filter((p) => normalize(p.banco) === normalize(banco));
    }

    if (rubro) {
      filtered = filtered.filter((p) => normalize(p.rubro) === normalize(rubro));
    }

    if (provincia && normalize(provincia) !== 'todas') {
      const provinceNeedle = normalize(provincia);
      filtered = filtered.filter((p) => normalize(p.provincia) === 'todas' || normalize(p.provincia) === provinceNeedle);
    }

    if (ciudad) {
      const cityNeedle = normalize(ciudad);
      filtered = filtered.filter((p) => !p.ciudad || normalize(p.ciudad) === cityNeedle || normalize(p.provincia) === cityNeedle);
    }

    if (dia && normalize(dia) !== 'all') {
      filtered = filtered.filter((p) => p.dias.includes(normalize(dia)));
    }

    if (minDescuento) {
      filtered = filtered.filter((p) => p.descuento >= Number(minDescuento));
    }

    if (search) {
      const query = normalize(search);
      filtered = filtered.filter((p) => [p.title, p.banco, p.comercio, p.rubro, p.descripcion, p.provincia, p.ciudad].some((field) => normalize(field).includes(query)));
    }

    filtered.sort((a, b) => b.descuento - a.descuento || a.banco.localeCompare(b.banco));

    const total = filtered.length;
    const paginatedResults = filtered.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      total,
      count: paginatedResults.length,
      offset: Number(offset),
      limit: Number(limit),
      data: paginatedResults,
      meta: {
        source: includeOfficial === 'false' ? 'manual' : 'manual+official',
        officialLoadedAt,
        note: 'Las promociones oficiales se buscan en sitios públicos de bancos y billeteras; si una web cambia su estructura puede requerir ajuste.',
        sourceStatuses: getOfficialSourcesStatus(),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await getPromociones();
    const promo = rows.find((p) => p.id === Number(req.params.id));
    if (!promo) {
      return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
    }
    return res.json({ success: true, data: promo });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
