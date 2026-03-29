# Comparador SEPA

Aplicación simplificada para buscar precios en un archivo local de SEPA.

## Qué hace
- búsqueda manual por nombre de producto
- búsqueda por código de barras
- escaneo con cámara si el navegador soporta `BarcodeDetector`
- resultados con precio más barato, supermercado y tarjeta del producto

## Archivo requerido
La app consulta solo un CSV local de SEPA.

Dejá el archivo en:

```bash
backend/data/sepa.csv
```

O configurá una ruta distinta con:

```env
SEPA_CSV_PATH=/ruta/al/archivo/sepa.csv
```

## Variables sugeridas
```env
PORT=3000
NODE_ENV=production
CORS_ORIGIN=*
SEPA_CACHE_TTL_MS=21600000
```

## Nota
Para usar la cámara del escáner, el sitio debe abrirse por HTTPS o desde localhost.
