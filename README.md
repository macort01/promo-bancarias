# 🚀 Promos Argentina - PWA de Promociones Bancarias

## 📱 ¿Qué es esto?

Una Progressive Web App (PWA) **100% gratuita** para buscar promociones bancarias, comparar precios y encontrar los mejores descuentos en Argentina. Compatible con todos los bancos y billeteras virtuales.

### ✨ Características

- ✅ Instalable en Android como app nativa
- ✅ Funciona offline
- ✅ Búsqueda avanzada de promociones
- ✅ Comparador de precios
- ✅ Filtros por banco, rubro, día, provincia
- ✅ Sistema de favoritos y listas
- ✅ Backend API completo
- ✅ 100% responsive
- ✅ Diseño único argentino

---

## 🖥️ Instalación en tu VPS Contabo

### Requisitos previos

Tu VPS necesita tener instalado:
- Node.js 16 o superior
- npm
- Git (opcional)

### Paso 1: Conectarse al VPS

```bash
ssh root@tu-ip-del-servidor
```

### Paso 2: Instalar Node.js (si no está instalado)

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Verificar instalación
node --version
npm --version
```

### Paso 3: Subir el proyecto al servidor

**Opción A: Usando SCP desde tu computadora**
```bash
# Desde tu computadora local
scp -r promo-bancarias root@tu-ip-del-servidor:/var/www/
```

**Opción B: Crear directamente en el servidor**
```bash
# En el servidor
mkdir -p /var/www/promo-bancarias
cd /var/www/promo-bancarias

# Aquí subirías los archivos por FTP/SFTP
# O puedes copiarlos manualmente
```

### Paso 4: Instalar dependencias del backend

```bash
cd /var/www/promo-bancarias/backend
npm install
```

### Paso 5: Configurar variables de entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar configuración
nano .env

# Configurar:
# - PORT=3000 (o el puerto que prefieras)
# - Otras variables según necesites
```

### Paso 6: Probar el servidor

```bash
# Modo desarrollo (para probar)
npm run dev

# O modo producción
npm start
```

Ahora abrí en el navegador: `http://tu-ip-del-servidor:3000`

---

## 🌐 Configurar con tu Dominio

### Opción 1: Nginx como Reverse Proxy (Recomendado)

#### 1. Instalar Nginx

```bash
apt install nginx -y
```

#### 2. Crear configuración del sitio

```bash
nano /etc/nginx/sites-available/promos-argentina
```

**Pegar esta configuración:**

```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### 3. Activar el sitio

```bash
# Crear symlink
ln -s /etc/nginx/sites-available/promos-argentina /etc/nginx/sites-enabled/

# Test de configuración
nginx -t

# Reiniciar Nginx
systemctl restart nginx
```

#### 4. Instalar SSL con Let's Encrypt (HTTPS)

```bash
# Instalar Certbot
apt install certbot python3-certbot-nginx -y

# Obtener certificado SSL
certbot --nginx -d tudominio.com -d www.tudominio.com

# Renovación automática ya está configurada
```

### Opción 2: PM2 para mantener el servidor corriendo

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Ir al directorio del backend
cd /var/www/promo-bancarias/backend

# Iniciar con PM2
pm2 start server.js --name "promos-argentina"

# Guardar configuración
pm2 save

# Configurar inicio automático
pm2 startup
```

**Comandos útiles de PM2:**
```bash
pm2 status          # Ver estado
pm2 logs            # Ver logs
pm2 restart all     # Reiniciar
pm2 stop all        # Detener
pm2 delete all      # Eliminar
```

---

## 🎯 Configurar DNS del Dominio

En el panel de tu proveedor de dominios (ej: GoDaddy, Namecheap, etc.):

1. **Registro A:**
   - Host: `@`
   - Apunta a: `IP_DE_TU_VPS`
   - TTL: 3600

2. **Registro A (www):**
   - Host: `www`
   - Apunta a: `IP_DE_TU_VPS`
   - TTL: 3600

Esperar 5-30 minutos para propagación DNS.

---

## 📂 Estructura del Proyecto

```
promo-bancarias/
├── index.html              # Página principal
├── buscador.html          # Buscador avanzado
├── mis-listas.html        # Listas de favoritos
├── mi-cuenta.html         # Perfil de usuario
├── manifest.json          # Configuración PWA
├── service-worker.js      # Funcionalidad offline
├── css/
│   └── styles.css         # Estilos principales
├── js/
│   └── app.js            # Lógica de la app
├── icons/                 # Iconos de la PWA
└── backend/
    ├── server.js         # Servidor Express
    ├── package.json      # Dependencias
    ├── routes/           # Rutas de la API
    │   ├── promociones.js
    │   ├── bancos.js
    │   └── comparador.js
    ├── models/           # Modelos de datos
    ├── scrapers/         # Scrapers (futuro)
    └── config/           # Configuración
```

---

## 🔧 API Endpoints

### Promociones

- `GET /api/promociones` - Todas las promociones
- `GET /api/promociones/:id` - Promoción por ID
- `GET /api/promociones/banco/:banco` - Por banco
- `GET /api/promociones/rubro/:rubro` - Por rubro

**Parámetros de consulta:**
- `banco` - Filtrar por banco
- `rubro` - Filtrar por categoría
- `provincia` - Filtrar por provincia
- `dia` - Filtrar por día
- `minDescuento` - Descuento mínimo
- `search` - Búsqueda de texto

### Bancos

- `GET /api/bancos` - Todos los bancos/billeteras
- `GET /api/bancos/:id` - Banco por ID
- `GET /api/bancos/tipo/bancos` - Solo bancos
- `GET /api/bancos/tipo/billeteras` - Solo billeteras

### Comparador

- `GET /api/comparador/buscar?query=producto` - Buscar productos
- `GET /api/comparador/producto/:id` - Comparar precios
- `GET /api/comparador/categorias` - Categorías
- `POST /api/comparador/agregar` - Agregar precio

---

## 🔥 Próximos pasos / Mejoras futuras

1. **Base de datos real** (MongoDB/PostgreSQL)
2. **Panel de administración** para cargar promociones
3. **Scraping automático** de sitios oficiales
4. **Notificaciones push** de nuevas promociones
5. **Integración con SEPA** para precios oficiales
6. **Sistema de usuarios** con autenticación
7. **Comparador de productos** más robusto
8. **Geolocalización** para promociones cercanas

---

## 🛠️ Solución de Problemas

### El servidor no arranca

```bash
# Ver logs
cd /var/www/promo-bancarias/backend
npm start

# Ver errores de PM2
pm2 logs
```

### Puerto 3000 ocupado

```bash
# Ver qué está usando el puerto
lsof -i :3000

# Cambiar puerto en .env
nano .env
# Modificar: PORT=8080
```

### Firewall bloqueando el puerto

```bash
# Abrir puerto en UFW
ufw allow 3000/tcp

# O si usás Nginx (puerto 80 y 443)
ufw allow 'Nginx Full'
```

### El dominio no funciona

1. Verificar DNS propagado: https://dnschecker.org
2. Verificar Nginx: `nginx -t`
3. Ver logs de Nginx: `tail -f /var/log/nginx/error.log`

---

## 📝 Licencia

MIT License - Uso libre para proyectos personales y comerciales.

---

## 💬 Soporte

¿Problemas con la instalación? Abrí un issue o contactame.

---

## 🎉 ¡Listo!

Tu PWA de promociones bancarias ya está corriendo. Ahora podés:

1. Acceder desde `https://tudominio.com`
2. Instalarla en Android
3. Agregar promociones
4. Compartir con amigos

**¡Éxito con tu proyecto!** 🚀🇦🇷
