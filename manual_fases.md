# Manual de Actualizaciones: Sistema Global Green Tucacas (Fases 1 a 4)

Este documento detalla todas las funcionalidades, ajustes y módulos que han sido implementados durante las 4 fases recientes de actualización. A continuación se explica cómo ubicar y utilizar cada nueva característica.

---

## 🚀 FASE 1: Integración de Variables y Tasa BCV

### 1. Tasa BCV Centralizada
**Ubicación:** Módulo **Administrativo** > Pestaña **Tasa BCV**.
**Cómo funciona:** 
- El sistema ahora consulta automáticamente la tasa del Banco Central de Venezuela.
- Todos los cálculos del sistema (Facturación, Caja, Perfil de Contribuyentes) utilizan ahora una única Tasa BCV centralizada de la base de datos, asegurando que no existan discrepancias.
- **Visualización:** En módulos como *Caja* y *Calculadora*, verás un recuadro verde en la parte superior derecha indicando la *"Tasa BCV Aplicada"* en tiempo real.

---

## 👥 FASE 2: Perfil del Contribuyente y Auditoría de Cambios

### 1. Notas Obligatorias en Cambios Sensibles
**Ubicación:** Módulo **Contribuyentes** > **Editar Contribuyente (Lápiz Azul)**.
**Cómo funciona:**
- Al intentar modificar campos críticos como la **Actividad Comercial**, **Tipo de Residencia** o la **Clasificación** de un contribuyente, el sistema exige de forma obligatoria que ingreses un motivo (Nota).
- Esto permite auditar por qué un contribuyente cambió de rubro y quién autorizó el cambio.

### 2. Gestión de Deuda en el Perfil
**Ubicación:** Módulo **Contribuyentes** > **Ver Detalles (Ojo Verde)**.
**Cómo funciona:**
- Se agregó el apartado **"Estado de Cuenta (Deuda Actual)"**, donde se muestran únicamente los recibos pendientes de pago.
- Se habilitó un botón (❌ rojo) al lado de cada deuda que permite **Eliminar** recibos pendientes erróneos directamente desde el perfil.

---

## 🏢 FASE 3: Condominios y Automatización de Solvencias

### 1. Estado Automático de Unidades
**Ubicación:** Módulo **Condominios COB** > **Administrar Unidades (Engranaje ⚙️)**.
**Cómo funciona:**
- El estatus de solvencia de los apartamentos/locales (Unidades) ahora está **enlazado automáticamente** al estado de cuenta del Condominio principal.
- Si el Condominio matriz *no tiene deudas* registradas en el sistema, todas sus unidades aparecerán automáticamente con etiqueta verde **"Solvente"**.
- Si el Condominio matriz *tiene deudas*, las unidades aparecerán como **"Con Deuda"** (rojo) y no se podrán emitir sus certificados de forma directa sin antes solventar la deuda o autorizarlas manualmente editando la unidad.

### 2. Emisión de Certificado de Solvencia (PDF)
**Ubicación:** Módulo **Condominios COB** > **Administrar Unidades** > **Botón Azul (Documento)**.
**Cómo funciona:**
- Cuando una unidad se encuentra "Solvente", se habilita un botón azul de emisión.
- Al presionarlo, el sistema genera automáticamente un **Certificado de Solvencia en formato PDF**.
- **El PDF incluye:** Logotipos oficiales, texto legal estándar de solvencia, datos de la unidad/propietario, y un **Código QR** validable de seguridad.

---

## 💰 FASE 4: Módulo de Caja, Notas de Crédito y Auditoría de Recibos

### 1. Control de Vueltos (Saldo a Favor) y Notas de Crédito
**Ubicación:** Módulo **Caja / Pagos**.
**Cómo funciona:**
- Al procesar un pago por *Transferencia*, si el monto transferido introducido es **mayor** al total de la deuda seleccionada, el sistema procesará el pago y calculará la diferencia.
- Esa diferencia se registra automáticamente como un **Saldo a Favor** (Nota de Crédito) para el contribuyente.
- **Pestaña Notas de Crédito:** En la parte superior de Caja, puedes alternar a la vista de "Notas de Crédito" para ver la lista de todos los saldos a favor generados, incluyendo fecha, referencia de origen y contribuyente. Además, puedes **Exportarlos a Excel**.

### 2. Anulación y Reverso de Recibos Procesados
**Ubicación:** Módulo **Contribuyentes** > **Ver Detalles (Ojo)** > Sección **Historial de Recibos Procesados**.
**Cómo funciona:**
- Debajo de la Deuda Actual, ahora existe un historial con todos los recibos pagados o verificados del usuario.
- Si un recibo fue procesado por error, puedes usar los botones **"Anular"** (Rojo) o **"Reversar"** (Naranja).
- Al hacer clic, se abrirá una ventana emergente que solicitará **obligatoriamente** redactar el motivo de la anulación para mantener la auditoría limpia. El recibo cambiará de estado y mantendrá la nota guardada.

### 3. Trazabilidad del Cajero Emisor
**Ubicación:** Módulo **Facturación / Estado de Cuenta** > **Imprimir Recibo**.
**Cómo funciona:**
- Al emitir el comprobante PDF de un recibo pagado, la sección inferior derecha (CAJERO) mostrará el nombre del trabajador que inició sesión.
- Si no hay un trabajador identificado en la sesión actual, el sistema colocará por defecto **"ADMINISTRADOR"**. Esto garantiza que cada PDF emitido esté firmado por un responsable, y ya no es editable manualmente, evitando manipulaciones.

---

*Documento generado automáticamente por el sistema de asistencia y control de versiones de Global Green.*
