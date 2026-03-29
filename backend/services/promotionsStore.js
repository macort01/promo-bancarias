const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'promociones.json');

function loadPromotions() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(normalizePromotion).filter(Boolean);
  } catch (error) {
    console.error('No se pudo leer promociones.json:', error.message);
    return [];
  }
}

function normalizePromotion(promo) {
  if (!promo || typeof promo !== 'object') return null;
  return {
    id: Number(promo.id),
    title: String(promo.title || '').trim(),
    banco: String(promo.banco || '').trim(),
    rubro: String(promo.rubro || '').trim().toLowerCase(),
    comercio: String(promo.comercio || '').trim(),
    descuento: Number(promo.descuento || 0),
    dias: Array.isArray(promo.dias) ? promo.dias.map((d) => String(d).trim().toLowerCase()) : [],
    topeReintegro: Number(promo.topeReintegro || 0),
    provincia: String(promo.provincia || 'todas').trim().toLowerCase(),
    ciudad: String(promo.ciudad || '').trim().toLowerCase(),
    vigencia: String(promo.vigencia || ''),
    descripcion: String(promo.descripcion || '').trim(),
    condiciones: String(promo.condiciones || '').trim(),
    activa: promo.activa !== false,
    fuente: String(promo.fuente || 'manual').trim(),
    sourceUrl: String(promo.sourceUrl || '').trim(),
    sourceLabel: String(promo.sourceLabel || '').trim(),
    updatedAt: String(promo.updatedAt || '').trim(),
  };
}

module.exports = { loadPromotions, normalizePromotion };
