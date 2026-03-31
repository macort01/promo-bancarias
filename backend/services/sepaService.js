const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const SEPA_CSV_PATH = process.env.SEPA_CSV_PATH || '/app/backend/data/productos.csv';
const SEPA_COMERCIO_PATH = process.env.SEPA_COMERCIO_PATH || '/app/backend/data/comercio.csv';
const SEPA_SUCURSALES_PATH = process.env.SEPA_SUCURSALES_PATH || '/app/backend/data/sucursales.csv';
const CACHE_TTL_MS = Number(process.env.SEPA_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const MAX_ROWS_TO_SCAN = Number(process.env.SEPA_MAX_ROWS_TO_SCAN || 250000);

let cache = {
  loadedAt: 0,
  rows: [],
  source: null,
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parsePrice(value) {
  const cleaned = String(value || '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  return Number(cleaned) || 0;
}

function readPipeCsv(filePath, mapper) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`No existe el archivo: ${filePath}`));
    }

    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv({ separator: '|' }))
      .on('data', (row) => {
        results.push(mapper ? mapper(row) : row);
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function loadSucursales() {
  const rows = await readPipeCsv(SEPA_SUCURSALES_PATH);
  const map = new Map();

  for (const row of rows) {
    const idComercio = String(row.id_comercio || '').trim();
    const idSucursal = String(row.id_sucursal || '').trim();

    const key = `${idComercio}-${idSucursal}`;

    map.set(key, {
      id_comercio: idComercio,
      id_sucursal: idSucursal,

      provincia:
        row.sucursales_provincia ||
        row.provincia ||
        '',

      localidad:
        row.sucursales_localidad ||
        row.localidad ||
        '',

      direccion:
        `${row.sucursales_calle || ''} ${row.sucursales_numero || ''}`.trim(),

      sucursal_nombre:
        row.sucursales_nombre ||
        row.sucursal_nombre ||
        '',
    });
  }

  return map;
}
  return map;
}

async function loadSucursales() {
  const rows = await readPipeCsv(SEPA_SUCURSALES_PATH);
  const map = new Map();

  for (const row of rows) {
    const idComercio = String(row.id_comercio || '').trim();
    const idSucursal = String(row.id_sucursal || '').trim();

    const key = `${idComercio}-${idSucursal}`;
    map.set(key, {
      id_comercio: idComercio,
      id_sucursal: idSucursal,
      provincia: row.nom_provincia || row.provincia || '',
      localidad: row.nom_localidad || row.localidad || '',
      direccion: row.domicilio || row.direccion || '',
      sucursal_nombre: row.sucursal_nombre || row.nom_sucursal || '',
    });
  }

  return map;
}

async function loadProductos(comerciosMap, sucursalesMap) {
  return new Promise((resolve, reject) => {
    const results = [];

    if (!fs.existsSync(SEPA_CSV_PATH)) {
      return reject(new Error(`No existe el archivo: ${SEPA_CSV_PATH}`));
    }

    fs.createReadStream(SEPA_CSV_PATH)
      .pipe(csv({ separator: '|' }))
      .on('data', (row) => {
        if (results.length >= MAX_ROWS_TO_SCAN) return;

        const idComercio = String(row.id_comercio || '').trim();
        const idBandera = String(row.id_bandera || '').trim();
        const idSucursal = String(row.id_sucursal || '').trim();

        const comercioKey = `${idComercio}-${idBandera}`;
        const sucursalKey = `${idComercio}-${idSucursal}`;

        const comercio = comerciosMap.get(comercioKey);
        let sucursal = sucursalesMap.get(sucursalKey);

// fallback si no encuentra (IMPORTANTE)
if (!sucursal) {
  const match = Array.from(sucursalesMap.values()).find(s =>
    String(s.id_comercio).trim() === idComercio &&
    String(s.id_sucursal).trim().replace(/^0+/, '') === idSucursal.replace(/^0+/, '')
  );
  if (match) sucursal = match;
}

        const item = {
          id: row.id_producto || '',
          ean: row.productos_ean || '',
          nombre: row.productos_descripcion || '',
          marca: row.productos_marca || '',
          categoria: row.categoria || row.rubro || '',
          comercio: comercio?.nombre || `Comercio ${idComercio}`,
          sucursal: sucursal?.sucursal_nombre || sucursal?.direccion || '',
          provincia: sucursal?.provincia || '',
          localidad: sucursal?.localidad || '',
          precioLista: parsePrice(row.productos_precio_lista || row.precio_lista),
          precioPromo: parsePrice(row.productos_precio_unitario_promocion2 || row.precio_promocion),
          fecha: row.fecha || '',
        };

        if (item.nombre && (item.precioPromo || item.precioLista)) {
          results.push(item);
        }
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function refreshCache() {
  const comerciosMap = await loadComercios();
  const sucursalesMap = await loadSucursales();
  const rows = await loadProductos(comerciosMap, sucursalesMap);

  cache = {
    loadedAt: Date.now(),
    rows,
    source: SEPA_CSV_PATH,
  };

  return cache;
}

async function getRows() {
  const isFresh =
    cache.loadedAt &&
    Date.now() - cache.loadedAt < CACHE_TTL_MS &&
    cache.rows.length > 0;

  if (isFresh) return cache;
  return refreshCache();
}

async function searchProducts({ query, provincia, limit = 20 }) {
  const { rows, loadedAt, source } = await getRows();
  const needle = normalizeText(query);
  const provinceNeedle = normalizeText(provincia);

  const filtered = rows.filter((row) => {
    const haystack = normalizeText(`${row.nombre} ${row.marca} ${row.ean}`);
    const palabras = needle.split(' ').filter(Boolean);

    const match = palabras.every((p) => haystack.includes(p));

    const provinceOk =
      !provinceNeedle ||
      normalizeText(row.provincia).includes(provinceNeedle);

    return match && provinceOk;
  });

  const grouped = new Map();

  for (const row of filtered) {
    const key = row.ean || normalizeText(`${row.nombre} ${row.marca}`);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const products = Array.from(grouped.entries())
    .map(([key, items]) => ({
      id: key,
      nombre: items[0].nombre,
      marca: items[0].marca,
      categoria: items[0].categoria || 'sin categoria',
      ean: items[0].ean,
      comercios: items
        .map((item) => ({
          nombre: item.comercio || 'Comercio no informado',
          sucursal: item.sucursal || '',
          ubicacion: [item.localidad, item.provincia].filter(Boolean).join(', '),
          precio: item.precioPromo || item.precioLista,
          precioLista: item.precioLista,
          precioPromocion: item.precioPromo,
          fecha: item.fecha,
        }))
        .filter((item) => item.precio > 0)
        .sort((a, b) => a.precio - b.precio),
    }))
    .filter((product) => product.comercios.length > 0)
    .sort((a, b) => a.comercios[0].precio - b.comercios[0].precio)
    .slice(0, limit)
    .map((product, index) => ({ ...product, localId: index + 1 }));

  return { products, loadedAt, source };
}

module.exports = {
  searchProducts,
  getRows,
};
