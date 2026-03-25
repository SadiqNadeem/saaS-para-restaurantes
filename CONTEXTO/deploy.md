# Guía de despliegue — Hostinger

## 1. Requisitos previos

- Node.js 18+
- Proyecto de Supabase activo con las tablas creadas
- Credenciales de Supabase a mano (URL y anon key)

---

## 2. Configurar variables de entorno antes del build

Edita el archivo `.env.production` (en la raíz del proyecto) y rellena los valores:

```
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...TU_ANON_KEY...
VITE_STRIPE_ENABLED=false
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...   # solo si usas Stripe
```

> **Importante:** Vite incrusta las variables `VITE_*` en el bundle en tiempo de build.
> Debes rellenar `.env.production` **antes** de ejecutar `npm run build`.

---

## 3. Generar el build de producción

```bash
npm run build
```

Esto crea la carpeta `/dist` con todos los archivos estáticos optimizados.

Chunks generados (con caché independiente por vendor):
- `vendor-react` — React + React Router
- `vendor-supabase` — cliente Supabase
- `vendor-ui` — iconos Lucide
- `vendor-pdf` — jsPDF

---

## 4. Subir a Hostinger

### Qué subir
Sube **todo el contenido de la carpeta `/dist`** al directorio raíz de tu hosting
(normalmente `public_html/`):

```
dist/
├── index.html          ← punto de entrada
├── assets/             ← JS y CSS con hash de versión
│   ├── vendor-react-[hash].js
│   ├── vendor-supabase-[hash].js
│   └── ...
└── .htaccess           ← necesario para React Router en Apache
```

> **No subas** la carpeta `dist` como carpeta — sube su **contenido** directamente
> dentro de `public_html/`.

### Método recomendado: File Manager de Hostinger
1. Panel Hostinger → **File Manager** → `public_html`
2. Borra los archivos anteriores (si hay una versión vieja)
3. Sube todos los archivos de `/dist` (arrastra y suelta o "Upload files")
4. Verifica que `.htaccess` está en la raíz de `public_html`

### Método alternativo: FTP (FileZilla)
1. Conéctate con las credenciales FTP de Hostinger
2. Navega a `public_html/`
3. Arrastra el contenido de `/dist` al panel de servidor

---

## 5. Verificar el despliegue

Accede a tu dominio y comprueba:

- [ ] La landing page carga correctamente
- [ ] `/gestion/login` carga la app de gestión
- [ ] Login con admin/1234 funciona
- [ ] Las tablas de Supabase responden (productos, clientes, pedidos)
- [ ] Crear un pedido descuenta el stock correctamente
- [ ] La descarga de PDF funciona

Si hay rutas que devuelven **404**, el problema es el `.htaccess`.
Verifica que Apache tiene `mod_rewrite` activo (en Hostinger está activo por defecto).

---

## 6. Actualizar en producción

Cada vez que cambies el código:

```bash
# 1. Haz los cambios en el código
# 2. Genera nuevo build
npm run build

# 3. Sube los nuevos archivos de /dist a Hostinger
#    (reemplaza los existentes)
```

---

## 7. Variables de entorno — reglas de seguridad

| Archivo          | Commitar | Propósito |
|------------------|----------|-----------|
| `.env.local`     | ❌ NO    | Desarrollo local (valores reales) |
| `.env.production`| ❌ NO    | Producción (valores reales) |
| `.env.example`   | ✅ SÍ    | Plantilla con claves vacías |

### ⚠️ NUNCA subas `.env` o `.env.production` a git
Los archivos `.env*` están en `.gitignore`. Compruébalo con:
```bash
git status  # no deben aparecer .env.local ni .env.production
```

Si alguna clave se expone accidentalmente en git:
1. Regenera inmediatamente la clave en el panel de Supabase
2. Actualiza `.env.local` y `.env.production` con la nueva clave
3. Haz nuevo build y despliega

---

## 8. Datos de acceso del proyecto Supabase

- **Project ID:** `ewxarutpvgelwdswjolz`
- **Dashboard:** https://supabase.com/dashboard/project/ewxarutpvgelwdswjolz
- **Tablas creadas:** `productos`, `clientes`, `pedidos`, `pedido_items`
- **RPC:** `decrement_stock(p_producto_id, p_cantidad)` — descuento atómico de stock
