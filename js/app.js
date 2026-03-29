const API_BASE_URL = '/api';

const STORAGE_KEYS = {
  favorites: 'favorites',
  customLists: 'customLists',
  profile: 'profile',
  settings: 'settings',
};

const DEFAULT_PROFILE = {
  name: 'Usuario',
  email: 'usuario@email.com',
  location: '',
  favoriteBanks: [],
};

const DEFAULT_SETTINGS = {
  notifications: true,
};

const state = {
  promotions: [],
  filteredPromotions: [],
  favorites: readJSON(STORAGE_KEYS.favorites, []),
  customLists: readJSON(STORAGE_KEYS.customLists, []),
  profile: { ...DEFAULT_PROFILE, ...readJSON(STORAGE_KEYS.profile, {}) },
  settings: { ...DEFAULT_SETTINGS, ...readJSON(STORAGE_KEYS.settings, {}) },
  activePage: detectPage(),
  filters: {
    day: 'all',
    bank: '',
    province: '',
    city: '',
    category: '',
    minDiscount: 0,
    search: '',
  },
};

const dayNames = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const ui = {
  promotionsGrid: document.getElementById('promotionsGrid'),
  favoritesGrid: document.getElementById('favoritesGrid'),
  customLists: document.getElementById('customLists'),
  filterBtn: document.getElementById('filterBtn'),
  filterModal: document.getElementById('filterModal'),
  closeFilterModal: document.getElementById('closeFilterModal'),
  applyFiltersBtn: document.getElementById('applyFilters'),
  clearFiltersBtn: document.getElementById('clearFilters'),
  dayFilters: Array.from(document.querySelectorAll('.day-chip')),
  mainSearch: document.getElementById('mainSearch'),
  discountSlider: document.getElementById('discountSlider'),
  discountValue: document.getElementById('discountValue'),
  provinceFilter: document.getElementById('provinciaFilter'),
  bankFilter: document.getElementById('bankFilter'),
  categoryFilter: document.getElementById('categoryFilter'),
  locationFilter: document.getElementById('locationFilter'),
  notifBtn: document.getElementById('notifBtn'),
  comparatorBtn: document.getElementById('comparatorBtn'),
  addListBtn: document.getElementById('addListBtn'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail'),
};

window.addEventListener('DOMContentLoaded', async () => {
  hydrateProfile();
  setupBaseEvents();

  if (state.activePage === 'home') {
    await initializeHomePage();
  }

  if (state.activePage === 'lists') {
    await initializeListsPage();
  }

  if (state.activePage === 'account') {
    initializeAccountPage();
  }
});

function detectPage() {
  const path = window.location.pathname;
  if (path.endsWith('/mis-listas.html')) return 'lists';
  if (path.endsWith('/mi-cuenta.html')) return 'account';
  if (path.endsWith('/buscador.html')) return 'search';
  return 'home';
}

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(fn, wait = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function hydrateProfile() {
  if (ui.userName) ui.userName.textContent = state.profile.name || DEFAULT_PROFILE.name;
  if (ui.userEmail) ui.userEmail.textContent = state.profile.email || DEFAULT_PROFILE.email;
}

function setupBaseEvents() {
  ui.comparatorBtn?.addEventListener('click', () => {
    window.location.href = '/buscador.html';
  });

  ui.notifBtn?.addEventListener('click', async () => {
    const latest = await fetchPromotions({ limit: 5 });
    const items = latest.slice(0, 5).map((promo) => `<li><strong>${escapeHtml(promo.banco)}</strong>: ${escapeHtml(promo.title)}</li>`).join('');
    openDialog({
      title: 'Novedades',
      body: `<p>Estas son algunas promos recientes cargadas desde la app:</p><ul style="padding-left:18px;margin-top:12px;">${items || '<li>No hay novedades por ahora.</li>'}</ul>`,
      confirmText: 'Cerrar',
      hideCancel: true,
    });
  });

  document.querySelectorAll('[data-action="view-all"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      clearFilters(true);
      document.getElementById('promotionsGrid')?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

async function initializeHomePage() {
  bindFilterEvents();
  await loadPromotions();
}

async function fetchPromotions(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const response = await fetch(`${API_BASE_URL}/promociones?${search.toString()}`);
  if (!response.ok) throw new Error('No se pudieron obtener las promociones');
  const payload = await response.json();
  return payload.data || [];
}

async function loadPromotions() {
  showLoadingCards();
  try {
    state.promotions = await fetchPromotions();
    fillFilterSelects();
    applyPromotionsFilter();
  } catch (error) {
    console.error(error);
    showError('Error al cargar promociones. Verificá que el servidor tenga salida a internet para consultar fuentes oficiales.');
  }
}

function fillFilterSelects() {
  const banks = [...new Set(state.promotions.map((promo) => promo.banco).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categories = [...new Set(state.promotions.map((promo) => promo.rubro).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  if (ui.bankFilter) {
    const current = ui.bankFilter.value;
    ui.bankFilter.innerHTML = '<option value="">Todos</option>' + banks.map((bank) => `<option value="${escapeHtml(bank)}">${escapeHtml(bank)}</option>`).join('');
    ui.bankFilter.value = current;
  }

  if (ui.categoryFilter) {
    const current = ui.categoryFilter.value;
    ui.categoryFilter.innerHTML = '<option value="">Todos</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(toTitleCase(category))}</option>`).join('');
    ui.categoryFilter.value = current;
  }
}

function bindFilterEvents() {
  ui.dayFilters.forEach((chip) => {
    chip.addEventListener('click', () => {
      ui.dayFilters.forEach((item) => item.classList.remove('active'));
      chip.classList.add('active');
      state.filters.day = chip.dataset.day || 'all';
      applyPromotionsFilter();
    });
  });

  ui.filterBtn?.addEventListener('click', openFilterModal);
  ui.closeFilterModal?.addEventListener('click', closeFilterModal);
  ui.applyFiltersBtn?.addEventListener('click', () => {
    state.filters.bank = ui.bankFilter?.value || '';
    state.filters.province = ui.provinceFilter?.value || '';
    state.filters.city = ui.locationFilter?.value || '';
    state.filters.category = ui.categoryFilter?.value || '';
    state.filters.minDiscount = Number(ui.discountSlider?.value || 0);
    applyPromotionsFilter();
    closeFilterModal();
  });
  ui.clearFiltersBtn?.addEventListener('click', () => clearFilters(false));

  ui.mainSearch?.addEventListener('input', debounce((event) => {
    state.filters.search = event.target.value || '';
    applyPromotionsFilter();
  }, 250));

  ui.discountSlider?.addEventListener('input', (event) => {
    const value = Number(event.target.value || 0);
    state.filters.minDiscount = value;
    if (ui.discountValue) ui.discountValue.textContent = `${value}%`;
  });

  document.querySelectorAll('.category-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      event.preventDefault();
      state.filters.category = card.dataset.category || '';
      if (ui.categoryFilter) ui.categoryFilter.value = state.filters.category;
      applyPromotionsFilter();
      document.getElementById('promotionsGrid')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  ui.filterModal?.addEventListener('click', (event) => {
    if (event.target === ui.filterModal) closeFilterModal();
  });
}

function clearFilters(renderImmediately = true) {
  state.filters = {
    day: 'all',
    bank: '',
    province: '',
    city: '',
    category: '',
    minDiscount: 0,
    search: '',
  };

  ui.dayFilters.forEach((chip) => chip.classList.toggle('active', chip.dataset.day === 'all'));
  if (ui.mainSearch) ui.mainSearch.value = '';
  if (ui.bankFilter) ui.bankFilter.value = '';
  if (ui.provinceFilter) ui.provinceFilter.value = '';
  if (ui.locationFilter) ui.locationFilter.value = '';
  if (ui.categoryFilter) ui.categoryFilter.value = '';
  if (ui.discountSlider) ui.discountSlider.value = '0';
  if (ui.discountValue) ui.discountValue.textContent = '0%';

  if (renderImmediately) applyPromotionsFilter();
  closeFilterModal();
}

function matchesLocation(promo) {
  const provinceNeedle = normalizeText(state.filters.province);
  const cityNeedle = normalizeText(state.filters.city);
  const profileLocation = normalizeText(state.profile.location);
  const province = normalizeText(promo.provincia);
  const city = normalizeText(promo.ciudad);

  if (provinceNeedle && province !== 'todas' && province !== provinceNeedle) return false;
  if (cityNeedle && city && city !== cityNeedle) return false;
  if (!provinceNeedle && !cityNeedle && profileLocation) {
    if (province !== 'todas' && city && city !== profileLocation && province !== profileLocation) return false;
  }
  return true;
}

function applyPromotionsFilter() {
  const bankNeedle = normalizeText(state.filters.bank);
  const categoryNeedle = normalizeText(state.filters.category);
  const dayNeedle = normalizeText(state.filters.day);
  const searchNeedle = normalizeText(state.filters.search);

  state.filteredPromotions = state.promotions.filter((promo) => {
    if (dayNeedle && dayNeedle !== 'all' && !promo.dias.includes(dayNeedle)) return false;
    if (bankNeedle && normalizeText(promo.banco) !== bankNeedle) return false;
    if (categoryNeedle && normalizeText(promo.rubro) !== categoryNeedle) return false;
    if (!matchesLocation(promo)) return false;
    if (promo.descuento < Number(state.filters.minDiscount || 0)) return false;

    if (searchNeedle) {
      const haystack = normalizeText([
        promo.title,
        promo.banco,
        promo.comercio,
        promo.rubro,
        promo.descripcion,
        promo.provincia,
        promo.ciudad,
      ].join(' '));
      if (!haystack.includes(searchNeedle)) return false;
    }

    return true;
  });

  renderPromotions(state.filteredPromotions, ui.promotionsGrid);
}

function renderPromotions(promotions, container = ui.promotionsGrid) {
  if (!container) return;
  container.innerHTML = '';
  if (!promotions.length) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 20px;">
        <i class="fas fa-search" style="font-size:48px;color:var(--gray-300);margin-bottom:16px;"></i>
        <p style="color:var(--gray-600);font-size:16px;">No se encontraron promociones con esos filtros.</p>
      </div>
    `;
    return;
  }
  promotions.forEach((promo) => container.appendChild(createPromotionCard(promo)));
}

function createPromotionCard(promo) {
  const card = document.createElement('article');
  card.className = 'promotion-card';
  const isFavorite = state.favorites.includes(promo.id);
  const locationText = [promo.ciudad, promo.provincia].filter(Boolean).join(', ') || 'Todo el país';

  card.innerHTML = `
    <div class="promotion-header">
      <span class="promo-tag"><i class="fas fa-percentage"></i> ${promo.descuento}% OFF</span>
      <button class="promo-favorite ${isFavorite ? 'active' : ''}" type="button" aria-label="Favorito">
        <i class="fas fa-heart"></i>
      </button>
    </div>
    <h4 class="promo-title">${escapeHtml(promo.title)}</h4>
    <div class="promo-details">
      <div class="promo-detail"><i class="fas fa-store"></i><span>${escapeHtml(promo.comercio)}</span></div>
      <div class="promo-detail"><i class="fas fa-calendar"></i><span>${formatDias(promo.dias)}</span></div>
      <div class="promo-detail"><i class="fas fa-location-dot"></i><span>${escapeHtml(locationText)}</span></div>
      <div class="promo-detail"><i class="fas fa-money-bill-wave"></i><span>Tope: ${formatCurrency(promo.topeReintegro)}</span></div>
    </div>
    <div class="promo-footer-row">
      <span class="promo-bank">${escapeHtml(promo.banco)}</span>
      <span class="promo-source">${promo.fuente === 'oficial' ? 'Oficial' : 'Manual'}</span>
    </div>
  `;

  card.querySelector('.promo-favorite').addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(promo.id);
    card.replaceWith(createPromotionCard(promo));
  });

  card.addEventListener('click', () => showPromoDetail(promo));
  return card;
}

function showPromoDetail(promo) {
  const locationText = [promo.ciudad, promo.provincia].filter(Boolean).join(', ') || 'Todo el país';
  const listsOptions = state.customLists.map((list) => `<option value="${list.id}">${escapeHtml(list.name)}</option>`).join('');
  openDialog({
    title: promo.title,
    body: `
      <div style="display:grid;gap:10px;line-height:1.45;">
        <div><strong>Banco:</strong> ${escapeHtml(promo.banco)}</div>
        <div><strong>Comercio:</strong> ${escapeHtml(promo.comercio)}</div>
        <div><strong>Descuento:</strong> ${promo.descuento}%</div>
        <div><strong>Días:</strong> ${escapeHtml(formatDias(promo.dias))}</div>
        <div><strong>Ubicación:</strong> ${escapeHtml(locationText)}</div>
        <div><strong>Tope:</strong> ${formatCurrency(promo.topeReintegro)}</div>
        <div><strong>Descripción:</strong> ${escapeHtml(promo.descripcion || 'Sin descripción')}</div>
        <div><strong>Condiciones:</strong> ${escapeHtml(promo.condiciones || 'Ver sitio oficial')}</div>
        ${promo.sourceUrl ? `<div><a href="${promo.sourceUrl}" target="_blank" rel="noopener noreferrer">Ver fuente oficial</a></div>` : ''}
        ${state.customLists.length ? `
          <div>
            <label style="display:block;margin-bottom:6px;font-weight:600;">Agregar a lista</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <select id="promoListSelect" style="flex:1;min-width:160px;padding:10px;border:1px solid #d1d5db;border-radius:10px;">${listsOptions}</select>
              <button id="promoAddToListBtn" class="btn-primary" type="button">Guardar</button>
            </div>
          </div>
        ` : '<p style="margin:0;color:#6b7280;">Creá una lista en “Mis listas” para guardar esta promo.</p>'}
      </div>
    `,
    confirmText: 'Cerrar',
    hideCancel: true,
    onRender: (modal) => {
      modal.querySelector('#promoAddToListBtn')?.addEventListener('click', () => {
        const listId = modal.querySelector('#promoListSelect')?.value;
        if (!listId) return;
        addPromotionToList(listId, promo.id);
        modal.remove();
        toast('Promoción agregada a la lista.');
      });
    },
  });
}

function formatDias(days = []) {
  if (!Array.isArray(days) || days.length === 0) return 'Consultar sitio oficial';
  if (days.length === 7) return 'Todos los días';
  const names = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };
  return days.map((day) => names[day] || toTitleCase(day)).join(', ');
}

function formatCurrency(amount) {
  const value = Number(amount || 0);
  return value ? value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : 'Sin tope informado';
}

function toTitleCase(value) {
  return String(value || '').replace(/\b\w/g, (char) => char.toUpperCase());
}

function showLoadingCards() {
  if (!ui.promotionsGrid) return;
  ui.promotionsGrid.innerHTML = new Array(3).fill('<div class="promotion-card loading-card"><div class="shimmer"></div></div>').join('');
}

function showError(message) {
  if (!ui.promotionsGrid) return;
  ui.promotionsGrid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:40px 20px;">
      <i class="fas fa-exclamation-triangle" style="font-size:48px;color:var(--danger);margin-bottom:16px;"></i>
      <p style="color:var(--gray-600);font-size:16px;margin-bottom:16px;">${escapeHtml(message)}</p>
      <button type="button" onclick="location.reload()" style="padding:12px 24px;background:var(--primary-blue);color:white;border:none;border-radius:8px;cursor:pointer;">Reintentar</button>
    </div>
  `;
}

function toggleFavorite(promoId) {
  const already = state.favorites.includes(promoId);
  state.favorites = already ? state.favorites.filter((id) => id !== promoId) : [...state.favorites, promoId];
  writeJSON(STORAGE_KEYS.favorites, state.favorites);
  if (state.activePage === 'lists') renderFavoritesSection();
}

async function initializeListsPage() {
  ui.addListBtn?.addEventListener('click', promptCreateList);
  await renderFavoritesSection();
  renderCustomLists();
}

async function renderFavoritesSection() {
  if (!ui.favoritesGrid) return;
  if (!state.favorites.length) {
    ui.favoritesGrid.innerHTML = `
      <div style="grid-column:1/-1;" class="empty-state">
        <i class="fas fa-heart"></i>
        <h4>No tenés favoritos todavía</h4>
        <p>Tocá el corazón en las promociones que te interesen.</p>
      </div>
    `;
    return;
  }
  const allPromos = state.promotions.length ? state.promotions : await fetchPromotions();
  const favoritePromos = allPromos.filter((promo) => state.favorites.includes(promo.id));
  renderPromotions(favoritePromos, ui.favoritesGrid);
}

function promptCreateList() {
  openDialog({
    title: 'Crear lista',
    body: `
      <label style="display:block;font-weight:600;margin-bottom:6px;">Nombre de la lista</label>
      <input id="newListName" type="text" placeholder="Ej: Super del finde" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;">
    `,
    confirmText: 'Crear',
    onConfirm: (modal) => {
      const name = modal.querySelector('#newListName')?.value?.trim();
      if (!name) {
        toast('Poné un nombre para la lista.');
        return false;
      }
      state.customLists.push({ id: cryptoRandomId(), name, promoIds: [] });
      persistLists();
      renderCustomLists();
      toast('Lista creada.');
      return true;
    },
  });
}

function renderCustomLists() {
  if (!ui.customLists) return;
  if (!state.customLists.length) {
    ui.customLists.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard-list"></i>
        <h4>No tenés listas todavía</h4>
        <p>Creá tu primera lista para organizar promociones favoritas.</p>
        <button class="create-list-btn" type="button" id="inlineCreateListBtn"><i class="fas fa-plus"></i> Crear lista</button>
      </div>
    `;
    ui.customLists.querySelector('#inlineCreateListBtn')?.addEventListener('click', promptCreateList);
    return;
  }

  const promosById = new Map(state.promotions.map((promo) => [promo.id, promo]));
  ui.customLists.innerHTML = state.customLists.map((list) => {
    const items = list.promoIds.map((id) => promosById.get(id)).filter(Boolean);
    return `
      <article class="result-card" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <h4 style="margin-bottom:4px;">${escapeHtml(list.name)}</h4>
            <div class="muted">${items.length} promociones guardadas</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" class="btn-secondary list-rename" data-id="${list.id}">Renombrar</button>
            <button type="button" class="btn-secondary list-delete" data-id="${list.id}">Eliminar</button>
          </div>
        </div>
        <div style="margin-top:16px;display:grid;gap:10px;">
          ${items.length ? items.slice(0, 6).map((promo) => `<div class="result-line"><span>${escapeHtml(promo.title)}</span><strong>${promo.descuento}%</strong></div>`).join('') : '<div class="muted">Todavía no agregaste promociones a esta lista.</div>'}
        </div>
      </article>
    `;
  }).join('');

  ui.customLists.querySelectorAll('.list-delete').forEach((button) => {
    button.addEventListener('click', () => deleteList(button.dataset.id));
  });
  ui.customLists.querySelectorAll('.list-rename').forEach((button) => {
    button.addEventListener('click', () => renameList(button.dataset.id));
  });
}

function persistLists() {
  writeJSON(STORAGE_KEYS.customLists, state.customLists);
}

function addPromotionToList(listId, promoId) {
  state.customLists = state.customLists.map((list) => {
    if (list.id !== listId) return list;
    if (list.promoIds.includes(promoId)) return list;
    return { ...list, promoIds: [...list.promoIds, promoId] };
  });
  persistLists();
  renderCustomLists();
}

function deleteList(listId) {
  openDialog({
    title: 'Eliminar lista',
    body: '<p>Esta acción no se puede deshacer.</p>',
    confirmText: 'Eliminar',
    onConfirm: () => {
      state.customLists = state.customLists.filter((list) => list.id !== listId);
      persistLists();
      renderCustomLists();
      toast('Lista eliminada.');
      return true;
    },
  });
}

function renameList(listId) {
  const list = state.customLists.find((item) => item.id === listId);
  if (!list) return;
  openDialog({
    title: 'Renombrar lista',
    body: `<input id="renameListInput" type="text" value="${escapeHtml(list.name)}" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;">`,
    confirmText: 'Guardar',
    onConfirm: (modal) => {
      const name = modal.querySelector('#renameListInput')?.value?.trim();
      if (!name) {
        toast('El nombre no puede quedar vacío.');
        return false;
      }
      state.customLists = state.customLists.map((item) => item.id === listId ? { ...item, name } : item);
      persistLists();
      renderCustomLists();
      toast('Lista actualizada.');
      return true;
    },
  });
}

function initializeAccountPage() {
  hydrateProfile();
  document.querySelectorAll('[data-account-action]').forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const action = item.dataset.accountAction;
      if (action === 'profile') return editProfile();
      if (action === 'banks') return editFavoriteBanks();
      if (action === 'notifications') return editNotifications();
      if (action === 'location') return editLocation();
      if (action === 'faq') return showFaq();
      if (action === 'feedback') return giveFeedback();
      if (action === 'about') return showAbout();
    });
  });
}

function editProfile() {
  openDialog({
    title: 'Editar perfil',
    body: `
      <div style="display:grid;gap:12px;">
        <div><label style="display:block;margin-bottom:6px;font-weight:600;">Nombre</label><input id="profileName" type="text" value="${escapeHtml(state.profile.name)}" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;"></div>
        <div><label style="display:block;margin-bottom:6px;font-weight:600;">Email</label><input id="profileEmail" type="email" value="${escapeHtml(state.profile.email)}" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;"></div>
      </div>
    `,
    confirmText: 'Guardar',
    onConfirm: (modal) => {
      const name = modal.querySelector('#profileName')?.value?.trim();
      const email = modal.querySelector('#profileEmail')?.value?.trim();
      state.profile = { ...state.profile, name: name || DEFAULT_PROFILE.name, email: email || DEFAULT_PROFILE.email };
      writeJSON(STORAGE_KEYS.profile, state.profile);
      hydrateProfile();
      toast('Perfil actualizado.');
      return true;
    },
  });
}

function editFavoriteBanks() {
  const banks = [...new Set(state.promotions.map((promo) => promo.banco).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  openDialog({
    title: 'Bancos y billeteras favoritas',
    body: `<div style="display:grid;gap:10px;">${banks.map((bank) => `
      <label style="display:flex;gap:10px;align-items:center;">
        <input type="checkbox" value="${escapeHtml(bank)}" ${state.profile.favoriteBanks.includes(bank) ? 'checked' : ''}>
        <span>${escapeHtml(bank)}</span>
      </label>
    `).join('')}</div>`,
    confirmText: 'Guardar',
    onConfirm: (modal) => {
      const selected = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
      state.profile = { ...state.profile, favoriteBanks: selected };
      writeJSON(STORAGE_KEYS.profile, state.profile);
      toast('Favoritos guardados.');
      return true;
    },
  });
}

function editNotifications() {
  openDialog({
    title: 'Notificaciones',
    body: `
      <label style="display:flex;gap:10px;align-items:center;">
        <input id="notificationsToggle" type="checkbox" ${state.settings.notifications ? 'checked' : ''}>
        <span>Quiero recibir avisos de promociones destacadas.</span>
      </label>
    `,
    confirmText: 'Guardar',
    onConfirm: (modal) => {
      state.settings = { ...state.settings, notifications: !!modal.querySelector('#notificationsToggle')?.checked };
      writeJSON(STORAGE_KEYS.settings, state.settings);
      toast('Preferencias actualizadas.');
      return true;
    },
  });
}

function editLocation() {
  openDialog({
    title: 'Mi ubicación',
    body: `
      <label style="display:block;margin-bottom:6px;font-weight:600;">Elegí tu ciudad o provincia</label>
      <select id="profileLocation" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;">
        <option value="">Sin preferencia</option>
        <option value="rosario" ${state.profile.location === 'rosario' ? 'selected' : ''}>Rosario</option>
        <option value="san juan" ${state.profile.location === 'san juan' ? 'selected' : ''}>San Juan</option>
        <option value="jachal" ${state.profile.location === 'jachal' ? 'selected' : ''}>Jáchal</option>
        <option value="buenos aires" ${state.profile.location === 'buenos aires' ? 'selected' : ''}>Buenos Aires</option>
      </select>
    `,
    confirmText: 'Guardar',
    onConfirm: (modal) => {
      state.profile = { ...state.profile, location: modal.querySelector('#profileLocation')?.value || '' };
      writeJSON(STORAGE_KEYS.profile, state.profile);
      toast('Ubicación guardada.');
      return true;
    },
  });
}

function showFaq() {
  openDialog({
    title: 'Preguntas frecuentes',
    body: `
      <div style="display:grid;gap:14px;line-height:1.5;">
        <div><strong>¿De dónde salen las promos?</strong><br>De promociones cargadas manualmente y de sitios oficiales de bancos y billeteras.</div>
        <div><strong>¿Cómo actualizo?</strong><br>Recargá la app o buscá nuevamente para consultar datos actualizados.</div>
        <div><strong>¿Cómo guardo favoritos?</strong><br>Tocá el corazón de cualquier promoción.</div>
      </div>
    `,
    confirmText: 'Cerrar',
    hideCancel: true,
  });
}

function giveFeedback() {
  window.location.href = 'mailto:soporte@promosar.app?subject=Feedback%20PromosAR&body=Contanos%20qué%20te%20gustaría%20mejorar%20de%20la%20app.';
}

function showAbout() {
  openDialog({
    title: 'Sobre la app',
    body: '<p>PromosAR reúne promociones bancarias y comparación de precios. Está preparada para ejecutarse en EasyPanel y consultar fuentes oficiales desde el servidor.</p>',
    confirmText: 'Cerrar',
    hideCancel: true,
  });
}

function openFilterModal() {
  ui.filterModal?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeFilterModal() {
  ui.filterModal?.classList.remove('active');
  document.body.style.overflow = '';
}

function openDialog({ title, body, confirmText = 'Aceptar', cancelText = 'Cancelar', hideCancel = false, onConfirm, onRender }) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog-card">
      <div class="dialog-header"><h3>${escapeHtml(title)}</h3></div>
      <div class="dialog-body">${body}</div>
      <div class="dialog-footer">
        ${hideCancel ? '' : `<button type="button" class="btn-secondary dialog-cancel">${escapeHtml(cancelText)}</button>`}
        <button type="button" class="btn-primary dialog-confirm">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
  };

  overlay.querySelector('.dialog-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector('.dialog-confirm')?.addEventListener('click', () => {
    const shouldClose = onConfirm ? onConfirm(overlay) !== false : true;
    if (shouldClose) close();
  });

  if (onRender) onRender(overlay);
  return overlay;
}

function toast(message) {
  const toastEl = document.createElement('div');
  toastEl.className = 'simple-toast';
  toastEl.textContent = message;
  document.body.appendChild(toastEl);
  requestAnimationFrame(() => toastEl.classList.add('visible'));
  setTimeout(() => {
    toastEl.classList.remove('visible');
    setTimeout(() => toastEl.remove(), 250);
  }, 2400);
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

window.fetchPromotions = fetchPromotions;
window.renderPromotions = renderPromotions;
window.createPromotionCard = createPromotionCard;
