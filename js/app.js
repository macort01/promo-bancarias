const API_URL = '/api/comparador/buscar';

const form = document.querySelector('form');
const input = document.querySelector('input[name="query"], #producto');
const resultsContainer = document.querySelector('#results');
const estadoBox = document.querySelector('#estado');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  buscar(query);
});

async function buscar(query) {
  resultsContainer.innerHTML = '<p>Buscando...</p>';

  try {
    const res = await fetch(`${API_URL}?query=${encodeURIComponent(query)}&limit=12`);
    const data = await res.json();

    if (!data.success || !data.data.length) {
      mostrarSinResultados();
      return;
    }

    ocultarEstado();
    renderResultados(data.data);

  } catch (error) {
    console.error('Error frontend:', error);
    resultsContainer.innerHTML = '<p>Error al buscar.</p>';
  }
}

function ocultarEstado() {
  if (estadoBox) {
    estadoBox.style.display = 'none';
  }
}

function mostrarSinResultados() {
  resultsContainer.innerHTML = `
    <div class="no-results">
      <p>No se encontraron resultados.</p>
    </div>
  `;
}

function renderResultados(productos) {
  resultsContainer.innerHTML = productos.map(renderCard).join('');
}

function renderCard(producto) {
  const mejor = producto.comercios?.[0];

  const precio = mejor?.precio || 0;
  const comercio = mejor?.nombre || 'Sin datos';
  const ubicacion = mejor?.ubicacion || '';

  return `
    <div class="card">
      <div class="card-body">
        <h3>${producto.nombre}</h3>
        <p>${producto.marca || ''}</p>

        <div class="precio">
          <span>Precio más barato</span>
          <strong>$${Number(precio).toLocaleString('es-AR')}</strong>
          <p>${comercio}</p>
          ${ubicacion ? `<small>${ubicacion}</small>` : ''}
        </div>
      </div>
    </div>
  `;
}
