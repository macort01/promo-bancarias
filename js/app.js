const API_BASE_URL = '/api';

const elements = {
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  provinceInput: document.getElementById('provinceInput'),
  limitInput: document.getElementById('limitInput'),
  scanButton: document.getElementById('scanButton'),
  manualButton: document.getElementById('manualButton'),
  manualForm: document.getElementById('manualForm'),
  manualBarcodeInput: document.getElementById('manualBarcodeInput'),
  scannerModal: document.getElementById('scannerModal'),
  manualModal: document.getElementById('manualModal'),
  scannerVideo: document.getElementById('scannerVideo'),
  scannerHint: document.getElementById('scannerHint'),
  statusTitle: document.getElementById('statusTitle'),
  statusText: document.getElementById('statusText'),
  datasetMeta: document.getElementById('datasetMeta'),
  resultsTitle: document.getElementById('resultsTitle'),
  resultsCount: document.getElementById('resultsCount'),
  resultsGrid: document.getElementById('resultsGrid'),
  setupNotice: document.getElementById('setupNotice'),
  setupText: document.getElementById('setupText'),
};

let scannerStream = null;
let scannerTimer = null;
let detector = null;
let lastBarcode = '';

window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadStatus();
});

function bindEvents() {
  elements.searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch({ query: elements.searchInput.value.trim() });
  });

  elements.manualForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const barcode = (elements.manualBarcodeInput.value || '').trim();
    if (!barcode) return;
    closeModal('manual');
    elements.searchInput.value = barcode;
    runSearch({ barcode });
  });

  elements.scanButton?.addEventListener('click', openScanner);
  elements.manualButton?.addEventListener('click', () => openModal('manual'));

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.dataset.close));
  });
}

async function loadStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/comparador/status`);
    const payload = await response.json();
    updateStatus(payload.meta);
  } catch (error) {
    elements.datasetMeta.textContent = 'No pude leer el estado del dataset.';
  }
}

function updateStatus(meta = {}) {
  if (meta.ready) {
    elements.statusTitle.textContent = 'SEPA cargado y listo';
    elements.statusText.textContent = 'Podés buscar por nombre o escanear un código de barras.';
    elements.datasetMeta.textContent = meta.message || 'Dataset listo.';
    elements.setupNotice.classList.add('notice--hidden');
  } else {
    elements.statusTitle.textContent = 'Falta cargar el archivo SEPA';
    elements.statusText.textContent = 'Subí backend/data/sepa.csv al repositorio y volvé a implementar la app.';
    elements.datasetMeta.textContent = meta.message || 'Sin archivo configurado.';
    elements.setupNotice.classList.remove('notice--hidden');
    elements.setupText.innerHTML = `${escapeHtml(meta.message || 'No se detectó SEPA.')}. Subí <code>backend/data/sepa.csv</code> o configurá <code>SEPA_CSV_PATH</code>.`;
  }
}

async function runSearch({ query = '', barcode = '' }) {
  const term = barcode || query;
  if (!term) {
    renderEmpty('Escribí un producto o ingresá un código de barras.');
    return;
  }

  elements.statusTitle.textContent = 'Buscando precios';
  elements.statusText.textContent = barcode ? `Buscando el código ${barcode}...` : `Buscando “${term}”...`;
  elements.resultsTitle.textContent = 'Buscando...';
  elements.resultsCount.textContent = '...';
  elements.resultsGrid.innerHTML = loadingCard();

  const params = new URLSearchParams();
  if (barcode) {
    params.set('barcode', barcode);
  } else {
    params.set('query', term);
  }
  if (elements.provinceInput.value.trim()) params.set('provincia', elements.provinceInput.value.trim());
  if (elements.limitInput.value) params.set('limit', elements.limitInput.value);

  try {
    const response = await fetch(`${API_BASE_URL}/comparador/buscar?${params.toString()}`);
    const payload = await response.json();

    updateStatus(payload.meta || {});

    if (!payload.success) {
      renderEmpty(payload.error || 'No se pudo completar la búsqueda.');
      return;
    }

    const data = payload.data || [];
    elements.resultsTitle.textContent = data.length ? `Resultados para “${escapeHtml(term)}”` : `Sin resultados para “${escapeHtml(term)}”`;
    elements.resultsCount.textContent = `${data.length} producto${data.length === 1 ? '' : 's'}`;

    if (!data.length) {
      renderEmpty(payload.meta?.message || 'No encontré coincidencias con ese producto.');
      return;
    }

    elements.resultsGrid.innerHTML = data.map(renderProductCard).join('');
  } catch (error) {
    renderEmpty('Ocurrió un error al consultar el comparador.');
  }
}

function renderProductCard(product) {
  const offers = (product.ofertas || []).slice(0, 6).map((offer, index) => `
    <div class="offer-row">
      <div>
        <strong>${index === 0 ? 'Más barato:' : ''} ${escapeHtml(offer.supermercado || 'Supermercado')}</strong>
        <small>${escapeHtml(offer.sucursal || offer.ubicacion || 'Ubicación no informada')}</small>
      </div>
      <div>
        <strong>$${formatPrice(offer.precio)}</strong>
      </div>
    </div>
  `).join('');

  const bestOffer = product.ofertas?.[0] || {};

  return `
    <article class="product-card card">
      <div class="product-card__hero">
        <img class="product-image" src="${product.imageUrl}" alt="${escapeHtml(product.nombre)}">
        <div>
          <h4 class="product-title">${escapeHtml(product.nombreCompleto || product.nombre)}</h4>
          <p class="muted">${escapeHtml(product.marca || 'Marca no informada')}</p>
          <div class="meta-grid">
            ${product.codigoBarras ? `<span class="chip">EAN ${escapeHtml(product.codigoBarras)}</span>` : ''}
            ${product.presentacion ? `<span class="chip">${escapeHtml(product.presentacion)}</span>` : ''}
          </div>
        </div>
      </div>

      <div>
        <p class="eyebrow">Precio más barato</p>
        <div class="price-highlight">
          <strong>$${formatPrice(product.precioMinimo || bestOffer.precio || 0)}</strong>
          <span class="muted">en ${escapeHtml(bestOffer.supermercado || 'sin datos')}</span>
        </div>
      </div>

      <div class="offer-list">${offers}</div>
    </article>
  `;
}

function renderEmpty(message) {
  elements.resultsTitle.textContent = 'Sin resultados';
  elements.resultsCount.textContent = '0 productos';
  elements.resultsGrid.innerHTML = `
    <div class="empty-state card">
      <div class="empty-state__icon">📦</div>
      <h4>No encontré coincidencias</h4>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function loadingCard() {
  return `
    <div class="empty-state card">
      <div class="empty-state__icon">⏳</div>
      <h4>Consultando SEPA</h4>
      <p>Esto puede tardar unos segundos si el archivo es grande.</p>
    </div>
  `;
}

function openModal(type) {
  const modal = type === 'scanner' ? elements.scannerModal : elements.manualModal;
  modal?.classList.add('is-open');
  modal?.setAttribute('aria-hidden', 'false');
}

function closeModal(type) {
  const modal = type === 'scanner' ? elements.scannerModal : elements.manualModal;
  modal?.classList.remove('is-open');
  modal?.setAttribute('aria-hidden', 'true');
  if (type === 'scanner') stopScanner();
}

async function openScanner() {
  openModal('scanner');

  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    elements.scannerHint.textContent = 'Tu navegador no soporta escaneo automático. Usá “Ingresar código manual”.';
    return;
  }

  try {
    detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    elements.scannerVideo.srcObject = scannerStream;
    await elements.scannerVideo.play();
    elements.scannerHint.textContent = 'Apuntá la cámara al código. La búsqueda arranca sola cuando lo detecta.';
    scannerTimer = setInterval(scanFrame, 650);
  } catch (error) {
    elements.scannerHint.textContent = 'No pude abrir la cámara. Revisá permisos o usá ingreso manual.';
  }
}

async function scanFrame() {
  if (!detector || !elements.scannerVideo || elements.scannerVideo.readyState < 2) return;
  try {
    const results = await detector.detect(elements.scannerVideo);
    const barcode = results?.[0]?.rawValue;
    if (barcode && barcode !== lastBarcode) {
      lastBarcode = barcode;
      elements.searchInput.value = barcode;
      closeModal('scanner');
      runSearch({ barcode });
    }
  } catch (_) {}
}

function stopScanner() {
  if (scannerTimer) {
    clearInterval(scannerTimer);
    scannerTimer = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }
  lastBarcode = '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
