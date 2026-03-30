const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const csv = require('csv-parser');
const { Readable } = require('stream');

const SEPA_DATASET_PAGE = process.env.SEPA_DATASET_PAGE || 'https://datos.produccion.gob.ar/dataset/sepa-precios';
const SEPA_CSV_PATH = process.env.SEPA_CSV_PATH || '';
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

function coalesce(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return '';
}

function parsePrice(value) {
  const cleaned = String(value || '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  return Number(cleaned) || 0;
}

async function getLatestZipUrl() {
  const response = await axios.get(SEPA_DATASET_PAGE, {
    timeout: 30000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  const html = response.data;
  const match = html.match(/https:\/\/datos\.produccion\.gob\.ar\/dataset\/[^"']+\/download\/[^"']+\.zip/);

  if (!match) {
    throw new Error('No pude detectar el ZIP más reciente de SEPA en la página pública.');
  }

  return match[0];
}

function mapRow(row) {
  return {
    id: coalesce(row, ['id_producto', 'productos_id', 'product_id']),
    ean: coalesce(row, ['productos_ean', 'ean', 'codigo_barras']),
    nombre: coalesce(row, ['productos_descripcion', 'descripcion', 'nombre', 'producto']),
    marca: coalesce(row, ['productos_marca', 'marca']),
    categoria: coalesce(row, ['categoria', 'rubro', 'productos_categoria']),
    comercio: coalesce(row, [
      'comercio_razon_social',
      'comercio_bandera',
      'banderaDescripcion',
      'sucursal_nombre',
      'bandera',
    ]),
    sucursal: coalesce(row, ['sucursal_nombre', 'sucursal_direccion', 'direccion']),
    provincia: coalesce(row, ['provincia', 'provincia_nombre']),
    localidad: coalesce(row, ['localidad', 'municipio_nombre']),
    precioLista: parsePrice(coalesce(row, ['precio_lista', 'precioLista', 'precio_regular', 'productos_precio_lista'])),
    precioPromo: parsePrice(coalesce(row, ['precio_promocion', 'precioPromocion', 'precio_oferta', 'productos_precio_unitario_promocion2'])),
    fecha: coalesce(row, ['date', 'fecha', 'fecha_vigencia']),
  };
}

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];

    Readable.from(buffer)
      .pipe(csv({ separator: '|' }))
      .on('data', (row) => {
        if (results.length >= MAX_ROWS_TO_SCAN) return;
        results.push(mapRow(row));
      })
      .on('end', () => {
        resolve(results.filter((item) => item.nombre && (item.precioPromo || item.precioLista)));
      })
      .on('error', reject);
  });
}

async function parseLocalCsvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo local SEPA: ${filePath}`);
  }

  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv({ separator: '|' }))
      .on('data', (row) => {
        if (results.length >= MAX_ROWS_TO_SCAN) return;
        results.push(mapRow(row));
      })
      .on('end', () => {
        resolve(results.filter((item) => item.nombre && (item.precioPromo || item.precioLista)));
      })
      .on('error', reject);
  });
}

async function refreshCache() {
  if (SEPA_CSV_PATH) {
    const localPath = path.resolve(SEPA_CSV_PATH);
    const rows = await parseLocalCsvFile(localPath);

    cache = {
      loadedAt: Date.now(),
      rows,
      source: localPath,
    };

    return cache;
  }

  const zipUrl = await getLatestZipUrl();
  const zipResponse = await axios.get(zipUrl, {
    timeout: 120000,
    responseType: 'arraybuffer',
    maxContentLength: 1024 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  const zip = new AdmZip(Buffer.from(zipResponse.data));
  const csvEntry = zip.getEntries().find((entry) => entry.entryName.toLowerCase().endsWith('.csv'));

  if (!csvEntry) {
    throw new Error('El ZIP de SEPA no trae un CSV legible.');
  }

  const rows = await parseCsvBuffer(csvEntry.getData());

  cache = {
    loadedAt: Date.now(),
    rows,
    source: zipUrl,
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
    const provinceOk = !provinceNeedle || normalizeText(row.provincia).includes(provinceNeedle);
    return haystack.includes(needle) && provinceOk;
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
