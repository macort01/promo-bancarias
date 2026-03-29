const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const CACHE_TTL_MS = Number(process.env.PROMOS_CACHE_TTL_MS || 1000 * 60 * 60 * 6);
const CACHE_PATH = path.join(__dirname, '..', 'data', 'official-promotions-cache.json');

let cache = { loadedAt: 0, data: [], sources: [] };
loadCacheFromDisk();

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeText(value).toLowerCase();
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function detectCategory(text) {
  const t = slugify(text);
  if (/supermerc|hiper|carrefour|coto|dia\b|jumbo|disco|vea/.test(t)) return 'supermercados';
  if (/farmac|perfumer/.test(t)) return 'farmacias';
  if (/combust|ypf|shell|axion|estacion/.test(t)) return 'combustible';
  if (/gastr|restaurant|burger|pizza|cafe|mostaza|helad|parrilla/.test(t)) return 'gastronomia';
  if (/indument|moda|zapat|adidas|moov|dexter/.test(t)) return 'indumentaria';
  if (/electro|tecnolog|celular|notebook|tv/.test(t)) return 'electrodomesticos';
  if (/cine|teatro|show|entreten/.test(t)) return 'entretenimiento';
  if (/viaj|turismo|aerop|cabify|despegar/.test(t)) return 'viajes';
  if (/delivery|pedidosya|rappi/.test(t)) return 'delivery';
  if (/libre?r/.test(t)) return 'librerias';
  if (/gym|gimnas|fitness/.test(t)) return 'fitness';
  return 'general';
}

function detectProvince(text) {
  const t = slugify(text);
  if (/rosario|santa fe/.test(t)) return 'santa fe';
  if (/jachal|san juan/.test(t)) return 'san juan';
  if (/buenos aires|bonaerense|caba|gba/.test(t)) return 'buenos aires';
  if (/cordoba/.test(t)) return 'cordoba';
  return 'todas';
}

function detectCity(text) {
  const t = slugify(text);
  if (/rosario/.test(t)) return 'rosario';
  if (/jachal/.test(t)) return 'jachal';
  if (/san juan/.test(t)) return 'san juan';
  if (/cordoba/.test(t)) return 'cordoba';
  return '';
}

function extractDiscount(text) {
  const matches = normalizeText(text).match(/(\d{1,3})\s*%/g);
  if (!matches?.length) return 0;
  const values = matches.map((value) => Number(value.replace(/\D/g, ''))).filter(Boolean);
  if (!values.length) return 0;
  return Math.max(...values);
}

function extractTope(text) {
  const normalized = normalizeText(text).replace(/\./g, '');
  const match = normalized.match(/tope(?:\s+de\s+reintegro)?(?:\s+mensual|\s+por\s+mes|\s+por\s+semana|\s+por\s+vigencia)?\s*\$\s*([\d]+)/i)
    || normalized.match(/\$\s*([\d]{4,})\s*(?:de\s+tope|tope)/i);
  return match ? Number(match[1]) : 0;
}

function extractDays(text) {
  const t = slugify(text);
  if (/todos los dias/.test(t)) return ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].filter((day) => t.includes(day));
  return days;
}

function inferCommerce(text, fallback) {
  const normalized = normalizeText(text);
  const commercePatterns = [
    /(?:en|para|con)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ&'.-]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ&'.-]+){0,4})/g,
  ];
  for (const pattern of commercePatterns) {
    const match = pattern.exec(normalized);
    if (match?.[1] && !/%/.test(match[1])) {
      return match[1].trim();
    }
  }
  return fallback || 'Locales adheridos';
}

function buildPromo(source, raw = {}) {
  const text = normalizeText(raw.text || raw.title || raw.description);
  const discount = Number(raw.discount ?? extractDiscount(text));
  if (!text || !discount) return null;

  const comercio = raw.comercio || inferCommerce(text, source.defaultCommerce || source.name);
  const dias = Array.isArray(raw.dias) ? raw.dias : extractDays(text);

  return {
    id: Number(`${source.id}${String(Math.abs(hashCode(`${text}|${comercio}`))).slice(0, 8)}`),
    title: raw.title || `${discount}% en ${comercio}`,
    banco: source.name,
    rubro: raw.rubro || detectCategory(text),
    comercio,
    descuento: discount,
    dias,
    topeReintegro: Number((raw.topeReintegro ?? extractTope(text)) || 0),
    provincia: raw.provincia || detectProvince(text),
    ciudad: raw.ciudad || detectCity(text),
    vigencia: raw.vigencia || '',
    descripcion: raw.description || text,
    condiciones: raw.condiciones || 'Ver condiciones y medios de pago en el sitio oficial.',
    activa: true,
    fuente: 'oficial',
    sourceUrl: raw.sourceUrl || source.url,
    sourceLabel: raw.sourceLabel || source.name,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: 45000,
    responseType: 'text',
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      Connection: 'keep-alive',
      DNT: '1',
      Referer: 'https://www.google.com/',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  return {
    html: response.data,
    finalUrl: response.request?.res?.responseUrl || url,
    status: response.status,
  };
}

function uniquePromos(promos) {
  const seen = new Set();
  return promos.filter((promo) => {
    if (!promo) return false;
    const key = slugify(`${promo.banco}|${promo.title}|${promo.comercio}|${promo.descuento}|${promo.sourceUrl}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (raw && Array.isArray(raw.data)) {
      cache = {
        loadedAt: Number(raw.loadedAt || 0),
        data: raw.data,
        sources: Array.isArray(raw.sources) ? raw.sources : [],
      };
    }
  } catch (error) {
    console.error('No se pudo leer la caché de promociones oficiales:', error.message);
  }
}

function persistCache() {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('No se pudo guardar la caché de promociones oficiales:', error.message);
  }
}

function extractCandidatesFromText(text, source) {
  const normalized = normalizeText(text);
  const candidates = [];

  const sentencePattern = /[^.!?\n]{0,120}\d{1,3}\s*%[^.!?\n]{0,220}/g;
  const matches = normalized.match(sentencePattern) || [];
  matches.forEach((chunk) => {
    const discount = extractDiscount(chunk);
    if (!discount || discount > 100) return;
    candidates.push(buildPromo(source, { text: chunk }));
  });

  return candidates.filter(Boolean);
}

function extractMetaPromos($, source) {
  const texts = [];
  ['description', 'og:description', 'twitter:description'].forEach((name) => {
    const selector = name.startsWith('og:') || name.startsWith('twitter:')
      ? `meta[property="${name}"]`
      : `meta[name="${name}"]`;
    const value = $(selector).attr('content');
    if (value) texts.push(value);
  });
  return texts.flatMap((value) => extractCandidatesFromText(value, source));
}

function extractPromosByPatterns(text, source) {
  const normalized = normalizeText(text);
  const promos = [];
  (source.patterns || []).forEach((patternConfig) => {
    const regex = patternConfig.regex;
    const matches = normalized.match(regex) || [];
    matches.forEach((value) => {
      promos.push(buildPromo(source, {
        text: value,
        title: patternConfig.title,
        rubro: patternConfig.rubro,
        comercio: patternConfig.comercio,
        provincia: patternConfig.provincia,
        ciudad: patternConfig.ciudad,
      }));
    });
  });
  return promos.filter(Boolean);
}

function extractPromosBySelectors($, source) {
  const promos = [];
  (source.selectors || []).forEach((selector) => {
    $(selector).each((_, element) => {
      const text = normalizeText($(element).text());
      const built = buildPromo(source, { text });
      if (built) promos.push(built);
    });
  });
  return promos;
}

const sources = [
  {
    id: 11,
    name: 'BBVA',
    url: 'https://www.bbva.com.ar/personas/productos/tarjetas/credito.html',
    defaultCommerce: 'Locales adheridos',
    selectors: ['body'],
    patterns: [
      { regex: /20% de reintegro en coto, dia, vea, jumbo, disco y mas/gi, rubro: 'supermercados', comercio: 'Coto, Dia, Vea, Jumbo y Disco' },
      { regex: /20% de reintegro todos los dias en kansas, dandy, burger54 y muchos mas/gi, rubro: 'gastronomia', comercio: 'Kansas, Dandy, Burger54 y más' },
      { regex: /hasta 20% y cuotas en moov, dexter, adidas y muchas mas/gi, rubro: 'indumentaria', comercio: 'Moov, Dexter, Adidas y más' },
      { regex: /100% de descuento para ir o volver al aeropuerto.*?cabify/gi, rubro: 'viajes', comercio: 'Cabify' },
    ],
  },
  {
    id: 12,
    name: 'Santander',
    url: 'https://www.santander.com.ar/personas/beneficios',
    defaultCommerce: 'Locales adheridos',
    selectors: ['body'],
    patterns: [
      { regex: /25% de ahorro en mostaza todos los miercoles/gi, rubro: 'gastronomia', comercio: 'Mostaza' },
      { regex: /ahorro en los mejores supermercados pagando con modo desde la app santander/gi, rubro: 'supermercados', comercio: 'Supermercados adheridos' },
      { regex: /25% de ahorro todos los dias, sin tope de reintegro/gi, rubro: 'general', comercio: 'Comercios adheridos' },
    ],
  },
  {
    id: 13,
    name: 'Cuenta DNI',
    url: 'https://www.bancoprovincia.com.ar/cuentadni/contenidos/cdnibeneficios/',
    defaultCommerce: 'Comercios adheridos',
    selectors: ['body'],
    patterns: [
      { regex: /lunes a viernes 20 ?% de ahorro con la aplicacion cuenta dni/gi, rubro: 'supermercados', provincia: 'buenos aires' },
      { regex: /full ypf sabados y domingos 25 ?% de ahorro con la aplicacion cuenta dni/gi, rubro: 'combustible', comercio: 'Full YPF', provincia: 'buenos aires' },
      { regex: /ferias y mercados bonaerenses todos los dias 40 ?% de ahorro/gi, rubro: 'alimentos', comercio: 'Ferias y Mercados Bonaerenses', provincia: 'buenos aires' },
      { regex: /farmacias y perfumerias miercoles y jueves 10 ?% de ahorro/gi, rubro: 'farmacias', comercio: 'Farmacias y perfumerías', provincia: 'buenos aires' },
    ],
  },
  {
    id: 14,
    name: 'Mercado Pago',
    url: 'https://www.mercadopago.com.ar/ayuda/Como-funcionan-los-descuentos-con-QR_4324',
    defaultCommerce: 'Locales adheridos',
    fallbackOnly: true,
    fallbackPromos: [
      {
        text: 'Descuentos con QR en combustible, gastronomia y locales adheridos, segun promociones vigentes en la app.',
        title: 'Descuentos con QR en locales adheridos',
        rubro: 'general',
        comercio: 'Locales adheridos',
        discount: 10,
        sourceUrl: 'https://www.mercadopago.com.ar/promociones',
      },
    ],
  },
];

async function scrapeSource(source) {
  const startedAt = Date.now();
  try {
    if (source.fallbackOnly) {
      const promos = (source.fallbackPromos || []).map((promo) => buildPromo(source, promo)).filter(Boolean);
      return {
        name: source.name,
        url: source.url,
        ok: true,
        method: 'fallback',
        count: promos.length,
        durationMs: Date.now() - startedAt,
        finalUrl: source.url,
        promos,
      };
    }

    const { html, finalUrl, status } = await fetchHtml(source.url);
    const $ = cheerio.load(html);
    const bodyText = $('body').text();
    const promos = uniquePromos([
      ...extractPromosByPatterns(bodyText, source),
      ...extractPromosBySelectors($, source),
      ...extractMetaPromos($, source),
      ...extractCandidatesFromText(bodyText, source),
    ]).slice(0, 25);

    return {
      name: source.name,
      url: source.url,
      ok: promos.length > 0,
      method: 'html',
      count: promos.length,
      status,
      durationMs: Date.now() - startedAt,
      finalUrl,
      promos,
      error: promos.length ? null : 'No se detectaron promociones parseables en la página actual.',
    };
  } catch (error) {
    return {
      name: source.name,
      url: source.url,
      ok: false,
      method: 'html',
      count: 0,
      durationMs: Date.now() - startedAt,
      error: error.message,
      promos: [],
    };
  }
}

async function refreshOfficialPromotions() {
  const results = await Promise.all(sources.map(scrapeSource));
  const promos = uniquePromos(results.flatMap((result) => result.promos || []));
  cache = {
    loadedAt: Date.now(),
    data: promos,
    sources: results.map(({ promos: _promos, ...rest }) => rest),
  };
  persistCache();
  return cache;
}

async function getOfficialPromotions({ forceRefresh = false } = {}) {
  const isFresh = !forceRefresh && cache.loadedAt && ((Date.now() - cache.loadedAt) < CACHE_TTL_MS) && cache.data.length > 0;
  if (isFresh) return cache;
  return refreshOfficialPromotions();
}

function getOfficialSourcesStatus() {
  return cache.sources || [];
}

module.exports = {
  getOfficialPromotions,
  refreshOfficialPromotions,
  getOfficialSourcesStatus,
};
