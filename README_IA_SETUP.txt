========================================================================
GUÍA DE CONFIGURACIÓN Y DESPLIEGUE - SISTEMA DE RECAUDACIÓN (PLANTILLA)
========================================================================

Este documento está diseñado para ser entregado a un asistente de IA 
(Claude, ChatGPT, Gemini, etc.) o a un desarrollador, con el objetivo de 
levantar una nueva instancia de este sistema para un nuevo municipio.

El código fuente en esta carpeta no contiene archivos de base de datos ni
claves secretas (.env). Todo debe ser configurado desde cero.

========================================================================
1. CREACIÓN DE LA BASE DE DATOS (SUPABASE)
========================================================================
El proyecto utiliza Supabase (PostgreSQL). Debes crear un nuevo proyecto en Supabase 
y ejecutar las siguientes sentencias SQL para crear las tablas necesarias:

A. TABLA: contribuyentes
------------------------
Campos:
- id (uuid, PK, default gen_random_uuid())
- identidad (text, unique) -> Ej: J-123456789
- nombre (text)
- email (text, optional)
- telefono (text, optional)
- direccion (text, optional)
- created_at (timestamp)

B. TABLA: inmuebles
-------------------
Campos:
- id (uuid, PK)
- inmueble (text, unique) -> Número de catastro o código (Ej: S-0001)
- identidad (text, FK a contribuyentes.identidad)
- tipo (text) -> Ej: "Comercial", "Residencial"
- actividad_principal (text, optional)
- direccion (text)
- estado (text) -> 'Activo', 'Inactivo'
- cant_inmuebles (numeric, default 1)
- mmv_mes (numeric) -> Factor de cobro en moneda de mayor valor (Ej: 10 para 10 Euros/mes)
- saldo_favor_bs (numeric, default 0)
- created_at (timestamp)

C. TABLA: facturas
------------------
Campos:
- id (uuid, PK)
- referencia (text, unique) -> Ej: CM-I-0001-09-2026
- identidad (text)
- contribuyente (text)
- emision (date) -> Ej: 2026-09-01
- vencimiento (date)
- monto (numeric) -> Monto al momento de emitirse (puede ser calculado dinámicamente)
- estado (text) -> 'Pendiente', 'Pagado', 'Abonado', 'En Revisión'
- fecha_pago (date, optional)
- metodo_pago (text, optional)
- referencia_pago (text, optional)
- created_at (timestamp)

D. TABLA: convenios_pago
------------------------
(Usada si aplican convenios de deuda)
- id, numero (text, unique), identidad, monto_total, inicial, cuotas, estado...

E. TABLA: convenios_cuotas
--------------------------
- id, convenio_id (FK), fecha, monto, estado ('Pendiente', 'Pagado', 'Por Verificar')

F. TABLA: pagos_reportados
--------------------------
Campos:
- id (uuid, PK)
- identidad (text)
- monto (numeric)
- banco (text)
- referencia (text, unique)
- tipo (text) -> 'Transferencia', 'Punto de Venta'
- estado (text) -> 'Por Verificar', 'Aprobado', 'Rechazado', 'Con Diferencia'
- detalles (jsonb) -> Para guardar metadatos (recibos pagados, origen, cajero, etc.)
- created_at (timestamp, default now())

G. TABLA: servicios_especiales
------------------------------
Campos:
- id (uuid, PK)
- tipo (text) -> 'visto_bueno', 'inspeccion', 'tala_poda'
- identidad (text)
- contribuyente (text)
- descripcion (text)
- monto (numeric)
- fecha (date)
- estado (text) -> 'Pendiente', 'Pagado', 'En Revisión'
- referencia (text, unique)
- notas (text)
- created_at (timestamp)

========================================================================
2. CONFIGURACIÓN DE VARIABLES DE ENTORNO (.env.local)
========================================================================
Crea un archivo .env.local en la raíz del proyecto con lo siguiente:

NEXT_PUBLIC_SUPABASE_URL=https://[TU-PROYECTO].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb... [Clave pública anon]
SUPABASE_SERVICE_ROLE_KEY=eyJhb... [Clave secreta - solo para API routes]

# Autenticación del Administrador (Caja/Dashboard)
ADMIN_PASS=123456

# Credenciales de Telegram (Para los reportes diarios automáticos)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=-100123456789

========================================================================
3. ADAPTACIÓN DE MARCA Y LOGOTIPOS (BRANDING)
========================================================================
Busca en el código (usando el buscador de VSCode/Cursor) las palabras:
- "Global Green" o "ISMA"
- "Tucacas" o "Municipio Silva"
- "J-29786006-1" (RIF actual)

Reemplázalas por el nombre de la nueva empresa, municipio y RIF.

Imágenes a reemplazar en la carpeta /public:
- logo.png
- logo_header.png
- logo-gobierno.png (Si aplica)
- Backgrounds de inicio de sesión (g-login.jpg, etc.)

========================================================================
4. INSTALACIÓN Y DESPLIEGUE
========================================================================
Local:
1. 
pm install
2. 
pm run dev

Producción (Vercel):
1. Sube el repositorio a GitHub.
2. Crea un proyecto nuevo en Vercel apuntando al repo.
3. Agrega TODAS las variables de entorno detalladas en el paso 2.
4. (Opcional) Configura el Vercel Cron (ercel.json) para que haga ping a 
   /api/telegram-report a las 12:00 PM y 6:00 PM.

========================================================================
5. CONSIDERACIONES DEL SISTEMA
========================================================================
- El cálculo del aseo mensual (CM-) se hace dinámicamente multiplicando 
  la cantidad de inmuebles (cant_inmuebles) por el factor en euros (mmv_mes) 
  y la tasa de cambio BCV oficial, que se consulta automáticamente al API 
  público de dolarapi.com.
- El usuario "Contribuyente" entra con su Cédula/RIF.
- El "Administrador" entra en la ruta /admin con la clave ADMIN_PASS.
