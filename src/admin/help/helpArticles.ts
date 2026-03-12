export type HelpArticle = {
  id: string;
  category: string;
  title: string;
  description: string;
  content: string;
  videoUrl?: string;
  relatedArticles?: string[];
  tags: string[];
  readTime: number;
};

export const HELP_CATEGORIES = [
  { id: 'getting-started', label: ' Primeros pasos', icon: '' },
  { id: 'menu', label: ' Menú y productos', icon: '' },
  { id: 'orders', label: ' Pedidos', icon: '' },
  { id: 'delivery', label: ' Delivery', icon: '' },
  { id: 'pos', label: ' TPV / Caja', icon: '' },
  { id: 'tables', label: ' Mesas', icon: '' },
  { id: 'printing', label: ' Impresión', icon: '' },
  { id: 'marketing', label: ' Marketing', icon: '' },
  { id: 'settings', label: ' Ajustes', icon: '' },
  { id: 'billing', label: ' Facturación', icon: '' },
];

export const HELP_ARTICLES: HelpArticle[] = [

  // GETTING STARTED
  {
    id: 'gs-001',
    category: 'getting-started',
    title: 'Cómo configurar tu restaurante paso a paso',
    description: 'Guía completa para poner en marcha tu restaurante digital en menos de 10 minutos.',
    tags: ['inicio', 'configuración', 'setup'],
    readTime: 5,
    content: `
# Cómo configurar tu restaurante paso a paso

Bienvenido! En esta guía te explicamos cómo configurar tu restaurante
digital de principio a fin.

## Paso 1: Crea tus categorías
Antes de añadir productos, crea las categorías de tu carta:
1. Ve a **Menú → Categorías**
2. Haz clic en **+ Nueva categoría**
3. Ponle nombre: "Principales", "Bebidas", "Postres"...
4. Guarda los cambios

## Paso 2: Añade tus productos
1. Ve a **Menú → Productos**
2. Haz clic en **+ Nuevo producto**
3. Rellena: nombre, precio, categoría, foto (opcional)
4. Activa el producto y guarda

## Paso 3: Configura tus ajustes
1. Ve a **Ajustes**
2. Configura tu horario de apertura
3. Activa los métodos de pago (efectivo / tarjeta)
4. Si haces delivery: configura la zona de reparto

## Paso 4: Activa los pedidos
1. En **Ajustes**, activa "Aceptar pedidos"
2. Comparte tu carta: copia la URL desde "Ver menú público"

## Paso 5: Prueba tu carta
Abre la URL de tu carta y haz un pedido de prueba.
¡Debería aparecerte en **Pedidos** en tiempo real!
    `
  },
  {
    id: 'gs-002',
    category: 'getting-started',
    title: 'Cómo compartir tu carta digital con clientes',
    description: 'Aprende a compartir tu URL, generar QR y configurar tu carta pública.',
    tags: ['qr', 'url', 'compartir', 'carta'],
    readTime: 3,
    content: `
# Cómo compartir tu carta digital

Tu carta digital tiene una URL única que puedes compartir con tus clientes.

## Tu URL de carta
La encontrarás en la barra de navegación o en **Ajustes → Ver QR**.
Formato: \`tudominio.com/r/nombre-restaurante\`

## Generar y descargar el QR
1. Ve a **Ajustes** y baja hasta la sección **Código QR**
2. Verás el QR de tu carta generado automáticamente
3. Haz clic en **Descargar QR** para guardarlo como imagen PNG
4. Imprímelo y ponlo en las mesas, mostrador o escaparate

## Compartir por WhatsApp o redes
Copia la URL desde **Ver menú público** y compártela donde quieras.

## QR por mesa
Si tienes mesas configuradas, cada mesa tiene su propio QR.
Ve a **Mesas**, selecciona una mesa y descarga su QR individual.
    `
  },

  // MENU
  {
    id: 'menu-001',
    category: 'menu',
    title: 'Cómo añadir y editar productos',
    description: 'Guía completa para gestionar tu carta: crear, editar, activar y organizar productos.',
    tags: ['productos', 'carta', 'menú', 'precio', 'añadir'],
    readTime: 4,
    content: `
# Cómo añadir y editar productos

## Crear un producto nuevo
1. Ve a **Menú → Productos**
2. Haz clic en **+ Nuevo producto**
3. Rellena los campos:
   - **Nombre**: el nombre que verán los clientes
   - **Precio**: usa punto para decimales (ej: 8.50)
   - **Categoría**: selecciona o crea una nueva
   - **Descripción**: opcional pero recomendado
   - **Foto**: sube una imagen apetecible
4. Activa el producto con el toggle **Activo**
5. Guarda

## Editar un producto existente
Haz clic en el icono de editar (lápiz) en cualquier producto.

## Activar / desactivar productos
Usa el toggle **Activo** para mostrar u ocultar un producto
sin eliminarlo. Útil para productos de temporada.

## Productos con precio 0
Si un producto tiene precio 0, verás un aviso en naranja.
Asegúrate de que es correcto antes de publicarlo.

## Añadir modificadores
Los modificadores permiten personalizar productos (extras, salsas, puntos de cocción).
Ve a **Menú → Modificadores** para crearlos y luego asígnalos al producto.
    `
  },
  {
    id: 'menu-002',
    category: 'menu',
    title: 'Cómo usar modificadores y extras',
    description: 'Configura opciones personalizables para tus productos: tamaños, extras, salsas...',
    tags: ['modificadores', 'extras', 'opciones', 'personalizar'],
    readTime: 5,
    content: `
# Modificadores y extras

Los modificadores permiten que los clientes personalicen sus pedidos.

## Ejemplos de uso
- **Punto de la carne**: poco hecho, al punto, muy hecho
- **Extras**: queso extra (+1€), bacon (+1.50€)
- **Salsas**: ketchup, mayonesa, barbacoa (gratis)
- **Tamaño**: pequeño, mediano, grande

## Crear un grupo de modificadores
1. Ve a **Menú → Modificadores**
2. Haz clic en **+ Grupo**
3. Ponle nombre: "Punto de la carne"
4. Configura mínimo y máximo:
   - **Mínimo 0**: opcional (el cliente puede no elegir)
   - **Mínimo 1**: obligatorio (debe elegir al menos uno)
   - **Máximo 1**: solo puede elegir una opción
   - **Máximo 4**: puede elegir hasta 4

## Añadir opciones al grupo
1. Selecciona el grupo
2. Haz clic en **+ Opción**
3. Ponle nombre y precio (0 si es gratis)

## Asignar a un producto
1. Ve al producto
2. Haz clic en **Gestionar modificadores**
3. Añade los grupos que quieras

## Orden de los modificadores
Puedes reordenarlos arrastrando para controlar en qué orden
los ve el cliente.
    `
  },

  // ORDERS
  {
    id: 'orders-001',
    category: 'orders',
    title: 'Cómo gestionar pedidos en tiempo real',
    description: 'Aprende a aceptar, preparar y entregar pedidos desde el panel.',
    tags: ['pedidos', 'tiempo real', 'estados', 'gestión'],
    readTime: 4,
    content: `
# Gestión de pedidos en tiempo real

## El panel de pedidos
En **Pedidos** verás todos los pedidos del día actualizándose en tiempo real.
El punto verde indica que la conexión en vivo está activa.

## Estados de un pedido
1. **Pendiente** — acaba de llegar, necesita atención
2. **Aceptado** — confirmado, en espera de preparación
3. **Preparando** — en cocina
4. **Listo** — preparado para recoger o entregar
5. **En reparto** — en camino (delivery)
6. **Entregado** — completado
7. **Cancelado** — anulado

## Cambiar el estado de un pedido
Haz clic en el pedido para abrirlo y usa los botones de estado.
O desde la tarjeta del pedido haz clic en **Aceptar**.

## Sonido de alerta
Cuando llega un pedido nuevo suena una alerta.
Usa el botón **Silenciar** si no quieres sonido.

## Filtros
Usa los filtros de arriba para ver solo Pendientes, En preparación, etc.

## No me llegan pedidos
Comprueba:
1. ¿Está activo "Aceptar pedidos" en Ajustes?
2. ¿Estás dentro del horario configurado?
3. ¿Tienes productos activos?
    `
  },

  // DELIVERY
  {
    id: 'delivery-001',
    category: 'delivery',
    title: 'Cómo configurar el delivery',
    description: 'Configura zona de reparto, precio de envío, pedido mínimo y tiempos estimados.',
    tags: ['delivery', 'reparto', 'zona', 'envío', 'domicilio'],
    readTime: 4,
    content: `
# Configurar el delivery

## Activar delivery
1. Ve a **Ajustes → Delivery**
2. Activa el toggle **Delivery activado**

## Zona de reparto
Usa el mapa interactivo para definir tu zona:
1. Coloca el pin en tu restaurante
2. Ajusta el radio con el slider (en km)
3. Los clientes fuera del radio no verán la opción de delivery

## Precio de envío
Configura cuánto cobras por el envío.
Puedes poner 0 para envío gratuito.

## Pedido mínimo
Define el importe mínimo para aceptar pedidos a domicilio.

## Tiempo estimado
Configura el tiempo estimado de entrega que verán los clientes
al hacer el pedido.

## Solución de problemas
- **El cliente dice que no puede pedir**: verifica que su dirección
  está dentro del radio de reparto
- **No aparece la opción delivery**: confirma que está activado en Ajustes
    `
  },

  // POS
  {
    id: 'pos-001',
    category: 'pos',
    title: 'Cómo usar el TPV para ventas en mostrador',
    description: 'Guía completa del sistema de punto de venta para venta presencial.',
    tags: ['tpv', 'pos', 'caja', 'venta', 'mostrador'],
    readTime: 5,
    content: `
# Usando el TPV (Punto de Venta)

## Acceder al TPV
Haz clic en **Nueva venta** (botón verde flotante) o ve a **Caja**.

## Hacer una venta
1. Selecciona la categoría en el panel izquierdo
2. Haz clic en los productos para añadirlos al carrito
3. Si el producto tiene modificadores, se abrirá un modal
4. Ajusta cantidades en el carrito (derecha)
5. Selecciona el tipo: **Mostrador**, **Delivery** o **Mesa**
6. Elige el método de pago: **Efectivo**, **Tarjeta** o **Fiado**
7. Si es efectivo: introduce el dinero recibido para calcular el cambio
8. Haz clic en **Cobrar**

## Imprimir ticket
Activa **Auto-imprimir** en la barra inferior para imprimir
automáticamente al cobrar.
O usa el botón de impresora en cada venta.

## Atajos de teclado
- **Escape**: cerrar modales
- **Enter**: confirmar cobro

## Cerrar caja
Al final del día ve a **Pedidos TPV** y haz clic en **Cerrar caja**
para ver el resumen del día.
    `
  },

  // TABLES
  {
    id: 'tables-001',
    category: 'tables',
    title: 'Gestión de mesas y plano de sala',
    description: 'Crea mesas, diseña tu sala y gestiona pedidos desde mesa.',
    tags: ['mesas', 'sala', 'plano', 'qr mesa'],
    readTime: 5,
    content: `
# Gestión de mesas

## Crear mesas
1. Ve a **Mesas → Gestión de mesas** en el panel admin
2. Haz clic en **+ Nueva mesa**
3. Ponle nombre (Mesa 1, Terraza 2...), zona y capacidad

## Diseñar el plano de sala
1. Ve al TPV → **Plano de sala**
2. Haz clic en **Editar plano**
3. Arrastra las mesas para posicionarlas
4. Cambia forma: cuadrada, rectangular o redonda
5. Dibuja paredes con la herramienta **Paredes**
6. Guarda el plano

## QR por mesa
Cada mesa tiene su propio QR:
1. En el plano o lista de mesas, haz clic en el icono QR
2. Descarga el QR de esa mesa
3. El cliente lo escanea y hace el pedido directamente

## Abrir cuenta en una mesa
1. Ve al TPV → **Mesas** o **Plano de sala**
2. Haz clic en una mesa libre
3. Añade productos igual que en el TPV normal
4. Al terminar: haz clic en **Cobrar** y la mesa queda libre

## Unir mesas
En el editor del plano, selecciona una mesa → **Unir con otra mesa**.
    `
  },

  // PRINTING
  {
    id: 'print-001',
    category: 'printing',
    title: 'Cómo configurar la impresión de tickets',
    description: 'Configura tu impresora térmica para imprimir tickets automáticamente.',
    tags: ['impresora', 'tickets', 'térmica', 'impresión', 'imprimir'],
    readTime: 5,
    content: `
# Configurar impresión de tickets

## Modos de impresión

### Modo Navegador (básico)
- Funciona en cualquier dispositivo
- El ticket se abre en una ventana nueva y se imprime
- En Android: compatible con la app RawBT
- En iOS: usa AirPrint

### Modo App de escritorio (recomendado para TPV Windows)
- Impresión automática sin confirmación
- Requiere instalar la app de impresión en el PC
- Conecta directamente con impresoras USB/red

## Configurar modo navegador
1. Ve a **Ajustes → Impresión**
2. Selecciona **Navegador / Móvil**
3. Elige el ancho: 58mm o 80mm según tu impresora
4. Activa **Imprimir automáticamente** si quieres

## RawBT en Android
1. Instala RawBT desde Google Play
2. En Ajustes → Impresión activa **RawBT**
3. Conecta tu impresora Bluetooth en RawBT
4. Los tickets se enviarán directamente

## Solución de problemas
- **No imprime**: verifica que el navegador permite ventanas emergentes
- **Ticket cortado**: ajusta el ancho (58mm o 80mm)
- **Imprime doble**: desactiva auto-imprimir y usa el botón manual
    `
  },

  // MARKETING
  {
    id: 'marketing-001',
    category: 'marketing',
    title: 'Cómo crear y gestionar cupones de descuento',
    description: 'Crea códigos de descuento para atraer y fidelizar clientes.',
    tags: ['cupones', 'descuentos', 'promociones', 'marketing', 'cupón'],
    readTime: 3,
    content: `
# Cupones de descuento

## Crear un cupón
1. Ve a **Marketing → Cupones**
2. Haz clic en **+ Nuevo cupón**
3. Configura:
   - **Código**: lo que escribirá el cliente (ej: BIENVENIDA10)
   - **Tipo**: porcentaje (%) o importe fijo (€)
   - **Valor**: el descuento (ej: 10 para 10%)
   - **Pedido mínimo**: importe mínimo para usar el cupón
   - **Usos máximos**: límite de veces que se puede usar
   - **Fechas**: validez del cupón

## El cliente usa el cupón
En el checkout, el cliente introduce el código en el campo
"¿Tienes un código de descuento?" y el descuento se aplica automáticamente.

## Ver uso de cupones
En la lista de cupones verás cuántas veces se ha usado cada uno.

## Consejos
- Usa códigos memorables: VERANO20, CUMPLE15, PRIMERPEDIDO
- Los cupones de un solo uso son ideales para recuperar clientes
- Combina con WhatsApp para enviar el código a clientes habituales
    `
  },

  // SETTINGS
  {
    id: 'settings-001',
    category: 'settings',
    title: 'Por qué no recibo pedidos — solución completa',
    description: 'Lista de comprobación para resolver el problema más común.',
    tags: ['pedidos', 'problema', 'no llegan', 'solución', 'no recibo'],
    readTime: 3,
    content: `
# No me llegan pedidos — Lista de comprobación

Este es el problema más frecuente. Sigue estos pasos en orden:

## 1. ¿Está activo "Aceptar pedidos"?
Ve a **Ajustes** y verifica que el toggle **Aceptar pedidos** está en verde.

## 2. ¿Estás dentro de tu horario?
Ve a **Ajustes → Horarios** y comprueba que el día y hora actuales
están dentro del horario configurado.

## 3. ¿Tienes productos activos?
Ve a **Menú → Productos** y verifica que hay productos con el toggle
**Activo** en verde.

## 4. ¿Has compartido la URL correcta?
La URL de tu carta debe ser la de tu panel.
Prueba abrirla en modo incógnito para verla como un cliente.

## 5. ¿El pedido está en "Pendiente"?
A veces los pedidos llegan pero están en la pestaña **Pendiente**.
Revisa los filtros en la página de Pedidos.

## 6. ¿Funciona el sonido?
El navegador puede bloquear el sonido. Haz clic en cualquier lugar
de la página para activarlo.

## Sigue sin funcionar
Si has comprobado todo lo anterior y sigue sin funcionar,
abre un ticket de soporte con una captura de pantalla de tus ajustes.
    `
  }
];

export function searchArticles(query: string): HelpArticle[] {
  const q = query.toLowerCase();
  return HELP_ARTICLES.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.description.toLowerCase().includes(q) ||
    a.tags.some(t => t.includes(q)) ||
    a.content.toLowerCase().includes(q)
  ).slice(0, 3);
}
