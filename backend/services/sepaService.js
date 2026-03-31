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
