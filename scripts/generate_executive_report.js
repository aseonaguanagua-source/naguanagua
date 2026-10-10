const fs = require('fs');

const md = `
<div style="text-align: center; font-family: sans-serif;">
  <h1>MUNICIPIO NAGUANAGUA</h1>
  <h2>SISTEMA INTEGRAL DE RECAUDACIÓN Y FACTURACIÓN</h2>
  <h3>INFORME EJECUTIVO DE DESARROLLO Y OPTIMIZACIÓN</h3>
  <br/>
  <p><strong>Fecha de Emisión:</strong> Octubre 2026</p>
  <p><strong>Estado:</strong> En Producción</p>
</div>

<br/>
<hr/>

## 1. RESUMEN EJECUTIVO
El presente informe detalla la evolución, corrección y modernización del **Sistema de Recaudación y Facturación del Municipio Naguanagua** desde el inicio de sus refactorizaciones profundas en Septiembre de 2026. Se ha llevado a cabo una reestructuración de la lógica de negocio, optimización de base de datos y mejoras críticas en la interfaz de usuario para garantizar la transparencia, exactitud y rapidez en la atención al contribuyente.

## 2. HITOS Y DESARROLLO POR MÓDULOS

### 2.1. Motor de Facturación y Caja (Punto de Cobro)
- **Cálculos Estrictos de Ordenanza:** Se alineó el motor de cálculo matemático (UCD, multas por mora, FAR) a las ordenanzas municipales vigentes, distinguiendo dinámicamente entre propiedades Residenciales y Comerciales.
- **Unificación de Deuda (Mismo Local):** Implementación de un algoritmo de similitud (Jaccard) y consolidación por \`numero_local\` para agrupar recibos de empresas con múltiples actividades comerciales, evitando la doble tributación de tasas de condominio.
- **Limpieza de Historial:** Corrección profunda en la lectura de recibos "N/A" y la eliminación de facturación duplicada o "recibos fantasma" generados erróneamente en el pasado.
- **Impuestos (IVA):** Integración estricta de cálculo del 16% del IVA **exclusivamente** para inmuebles comerciales, eximiendo legalmente a los residenciales.

### 2.2. Sistema de Agentes de Retención
- **Detección Automática:** El sistema ahora detecta automáticamente a los agentes de retención registrados en la base de datos (más de 460 entidades).
- **Cálculo de Retención Legal:** Implementación de división automatizada en facturación (25% a pagar por el contribuyente, 75% retenido por el agente).
- **Conciliación Administrativa:** Creación de un panel de conciliación y avisos dinámicos en los puntos de venta/kioscos informando al funcionario sobre la retención a procesar.

### 2.3. Facturación Electrónica e Integración TFHKA
- **Ajuste a Esquemas Estrictos:** Reestructuración de la carga útil (JSON payload) para cumplir estrictamente con los nuevos requerimientos y validaciones del API de The Factory HKA.
- **Notificaciones Automáticas:** Implementación de envío directo de la factura fiscal al correo del contribuyente, así como opciones de anulación fiscal controladas por roles (Administrador, Isamar, Raquel).
- **Tasa BCV Dinámica:** Unificación de todas las lecturas de tasas del Banco Central de Venezuela para que todos los recibos y facturas cuadren exactamente al centavo.

### 2.4. Plataforma de Autogestión y Kioscos (Cobro Móvil)
- **Rediseño para Velocidad:** Eliminación de cuellos de botella (App Context) y barreras de acceso (Login) para el módulo de Kiosco. Los contribuyentes ahora pueden revisar y pagar deudas en tiempo real sin esperas.
- **Desgloses Transparentes:** La plataforma pública ahora muestra fórmulas aplicadas y desgloses precisos del concepto de cobro, brindando confianza al contribuyente.

### 2.5. Seguridad, UI/UX y Rendimiento
- **Auditoría y Parches:** Resolución integral de 6 vulnerabilidades críticas y de alto nivel en el flujo de autenticación (Fases 1 a 6 de Seguridad).
- **Mejoras Visuales:** Rediseño del pie de página (IAMEC), inclusión de escudos y transparencias solicitadas, y refinamiento general de la interfaz gráfica del administrador.
- **Prevención de Errores de Base de Datos:** Backfill de más de 22,700 registros sin \`numero_local\` y reasignación de códigos "N/A" a sus padres para mantener la integridad de los datos estadísticos.

<br/>
<hr/>

<div style="text-align: center; font-size: 12px; color: gray;">
  <p>Fin del Informe. Documento generado automáticamente por el sistema de control de versiones del equipo de desarrollo.</p>
</div>
`;

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/Informe_Ejecutivo_Naguanagua.md', md);
