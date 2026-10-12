// Descripción de cada opción del menú lateral.
// · `desc`: texto breve que aparece al dejar el cursor sobre la opción.
// · `proposito`, `funciones`, `recomendaciones`: contenido del Manual de Usuario (PDF descargable desde el menú).
export type ManualOpcion = { desc: string; proposito: string; funciones: string[]; recomendaciones?: string[] };

export const MANUAL_MENU: Record<string, ManualOpcion> = {
  // ───────────────────────────── ASEO URBANO ─────────────────────────────
  '/admin': {
    desc: 'Panel principal con los indicadores del día: recaudación, contribuyentes y alertas.',
    proposito: 'Es la pantalla de inicio del módulo de Aseo Urbano. Ofrece una visión general e inmediata del estado de la recaudación y de la operación diaria, para que el funcionario identifique de un vistazo lo que requiere atención.',
    funciones: [
      'Muestra los indicadores clave: monto recaudado, cantidad de pagos, contribuyentes registrados y deuda pendiente.',
      'Presenta accesos rápidos a las tareas más frecuentes (cobro, consulta de contribuyentes, reportes).',
      'Señala alertas operativas, como pagos por conciliar o solicitudes pendientes.',
    ],
    recomendaciones: ['Revise este panel al iniciar la jornada para priorizar las tareas pendientes.'],
  },
  '/admin/administrativo': {
    desc: 'Tablero gerencial exclusivo del Administrador: ingresos, metas y desempeño.',
    proposito: 'Brinda a la gerencia una visión consolidada y estratégica de los ingresos del instituto, con indicadores de gestión que permiten evaluar el cumplimiento de metas y la evolución de la recaudación.',
    funciones: [
      'Consolida los ingresos por período, por caja y por tipo de concepto.',
      'Compara la recaudación real contra la proyectada y la de períodos anteriores.',
      'Permite identificar tendencias y tomar decisiones de cobranza.',
    ],
    recomendaciones: ['Disponible solo para el perfil Administrador.', 'Úselo como insumo para los informes de gestión mensuales.'],
  },
  '/admin/tarifas': {
    desc: 'Consulta de las tarifas oficiales de la Ordenanza (F.O., UCD) y calculadora de montos.',
    proposito: 'Centraliza las tarifas establecidas en la Ordenanza Municipal vigente, de modo que todo cálculo de cobro se base en los valores oficiales (Factor de Ordenanza, Unidad de Cuenta Dinámica y tasa del Euro BCV).',
    funciones: [
      'Lista las actividades residenciales, comerciales e industriales con su Factor de Ordenanza (F.O.).',
      'Muestra las tarifas de Servicios Especiales, Extraordinarios, Inspecciones, Visto Bueno Ambiental y Permisos de Poda/Tala.',
      'Incluye una calculadora que convierte UCD a bolívares con la tasa vigente (UCD = tasa Euro BCV × 57).',
    ],
    recomendaciones: ['Ante cualquier duda sobre un monto, verifique aquí la tarifa oficial antes de cobrar.'],
  },
  '/admin/censo': {
    desc: 'Registro y actualización de datos de contribuyentes levantados en campo.',
    proposito: 'Permite incorporar y depurar la información de los contribuyentes obtenida mediante censos y levantamientos en campo, manteniendo actualizada la base de datos del instituto.',
    funciones: [
      'Registra nuevos inmuebles y contribuyentes detectados en campo.',
      'Actualiza datos de contacto, dirección, actividad y clasificación.',
      'Facilita la verificación de inmuebles no registrados o con datos incompletos.',
    ],
    recomendaciones: ['Verifique siempre la cédula o RIF antes de crear un registro nuevo para evitar duplicados.'],
  },
  '/admin/contribuyentes': {
    desc: 'Ficha completa de cada contribuyente: inmuebles, deuda, pagos y estado de cuenta.',
    proposito: 'Es el expediente central de cada contribuyente. Reúne en una sola ficha toda su información, sus inmuebles o actividades, su deuda detallada mes a mes y su historial de pagos.',
    funciones: [
      'Búsqueda por código de inmueble, cédula/RIF o nombre.',
      'Consulta y edición de datos del contribuyente y de sus inmuebles (actividad, tarifa, meses adeudados).',
      'Emisión del estado de cuenta oficial mes a mes, con columna UCD.',
      'Visualización del historial de pagos, exoneraciones y notas administrativas.',
    ],
    recomendaciones: ['Todo cambio de tarifa o de deuda queda registrado en Auditoría; documente el motivo en las notas.'],
  },
  '/admin/condominios': {
    desc: 'Gestión de condominios y centros comerciales: unidades, locales, tarifas y deuda.',
    proposito: 'Administra los condominios residenciales y comerciales con sus unidades (apartamentos, locales y actividades), aplicando la modalidad de cobro que corresponda: centralizada, individual, mixta o tarifa fija.',
    funciones: [
      'Ficha del condominio con todas sus unidades, propietarios, actividades y tarifas.',
      'Agrupación de actividades N/A: la tarifa de una N/A es la suma de sus actividades, sin doble cobro.',
      'Estado de cuenta del condominio en Excel (3 hojas) y versión UCD.',
      'Ajuste de meses pendientes, multas y exoneraciones por unidad o por condominio.',
    ],
    recomendaciones: ['Antes de modificar los meses de un condominio, verifique los pagos ya registrados de sus unidades.'],
  },
  '/admin/condominios/caja': {
    desc: 'Cobro de condominios: pago total, por unidad o abonos, con recibo.',
    proposito: 'Caja especializada para el cobro de condominios. Calcula automáticamente la deuda de cada unidad según la modalidad del condominio y registra el pago aplicándolo a los meses correspondientes.',
    funciones: [
      'Cobro del condominio completo o de unidades específicas.',
      'Cobro solo de multas, o de aseo con multas.',
      'Aplicación de retención de IVA (75 %) para agentes de retención.',
      'Emisión del recibo y actualización automática de los meses pagados.',
    ],
    recomendaciones: ['Confirme la modalidad del condominio antes de cobrar: determina quién paga el aseo y quién paga la multa.'],
  },
  '/admin/condominios-cob': {
    desc: 'Vista del cobro histórico de condominios (módulo anterior COB).',
    proposito: 'Conserva la consulta del esquema de cobro de condominios utilizado antes del módulo nuevo, como referencia y para conciliar información histórica.',
    funciones: [
      'Consulta de condominios y montos bajo el esquema anterior.',
      'Comparación con los datos del módulo nuevo de Condominios.',
    ],
    recomendaciones: ['Para cobros nuevos utilice siempre "Caja Condominios".'],
  },
  '/admin/pre-registros': {
    desc: 'Solicitudes de registro hechas por ciudadanos desde la web, para aprobar o rechazar.',
    proposito: 'Recibe y gestiona los pre-registros que los ciudadanos realizan desde el portal "Soy Contribuyente", para validarlos e incorporarlos formalmente a la base de datos.',
    funciones: [
      'Lista de solicitudes pendientes con los datos enviados por el ciudadano.',
      'Verificación contra registros existentes (cédula/RIF, código de inmueble).',
      'Aprobación, que crea o vincula el contribuyente, o rechazo con motivo.',
    ],
  },
  '/admin/jornadas': {
    desc: 'Planificación y seguimiento de jornadas de cobro y atención en campo.',
    proposito: 'Organiza las jornadas de campo del instituto (cobranza, censo, atención a comunidades), registrando su planificación, el personal asignado y los resultados obtenidos.',
    funciones: [
      'Programación de jornadas por sector, fecha y responsable.',
      'Registro de los resultados: contribuyentes atendidos, pagos y novedades.',
    ],
  },
  '/admin/ambiental': {
    desc: 'Trámite del Visto Bueno Ambiental y de la Variable Ambiental.',
    proposito: 'Gestiona las solicitudes de Visto Bueno Ambiental y de Variable Ambiental requeridas a los establecimientos, con su tarifa oficial en UCD.',
    funciones: [
      'Registro de la solicitud y de los datos del establecimiento.',
      'Cálculo de la tarifa oficial (15 UCD) y de la multa por impago cuando aplique.',
      'Seguimiento del estado del trámite hasta su emisión.',
    ],
  },
  '/admin/herramientas': {
    desc: 'Análisis de la cartera morosa: deuda por sector, actividad y antigüedad.',
    proposito: 'Proporciona herramientas analíticas sobre la deuda de los contribuyentes, para orientar las estrategias de cobranza hacia los segmentos de mayor impacto.',
    funciones: [
      'Distribución de la deuda por tipo de contribuyente, actividad y meses de atraso.',
      'Identificación de los principales deudores.',
      'Exportación de listados para gestión de cobro.',
    ],
  },
  '/admin/calculo': {
    desc: 'Proyección de ingresos según tarifas, tasa del Euro y contribuyentes activos.',
    proposito: 'Permite estimar los ingresos esperados del instituto a partir de las tarifas vigentes, la tasa del Euro BCV y la base de contribuyentes, como apoyo a la planificación financiera.',
    funciones: [
      'Cálculo del potencial de recaudación mensual.',
      'Escenarios de proyección con distintos niveles de cobranza y de tasa.',
    ],
  },
  '/admin/simulador': {
    desc: 'Simula la deuda de un contribuyente con distintos meses, tasa o descuentos.',
    proposito: 'Herramienta de simulación para calcular, sin afectar los datos reales, cuánto debería pagar un contribuyente bajo diferentes supuestos.',
    funciones: [
      'Simulación por cantidad de meses, actividad, tasa y multa.',
      'Desglose de base, IVA, multa y retención.',
      'Útil para responder consultas y preparar propuestas de convenio.',
    ],
    recomendaciones: ['Los resultados del simulador son referenciales; el cobro real se hace en Caja.'],
  },
  '/admin/caja': {
    desc: 'Caja principal: cobro a contribuyentes, emisión de recibos y cierre de caja.',
    proposito: 'Es el punto de cobro principal del instituto. Calcula la deuda oficial de cada contribuyente, registra el pago en sus distintas formas y emite el recibo correspondiente.',
    funciones: [
      'Búsqueda del contribuyente por código, cédula/RIF o nombre.',
      'Selección de los meses a pagar, con cálculo automático de base, IVA (16 %), multa por mora y retención del 75 % para agentes de retención.',
      'Registro de pagos en efectivo, punto de venta, transferencia y pago móvil.',
      'Emisión del recibo, reportes de caja (Total puntos de venta, Conciliación de transferencias) y cierre diario.',
    ],
    recomendaciones: ['Verifique la referencia bancaria antes de registrar transferencias.', 'Realice el cierre de caja al terminar cada jornada.'],
  },
  '/admin/caja/conciliacion': {
    desc: 'Verificación de transferencias y pagos reportados contra el banco.',
    proposito: 'Permite confirmar que los pagos por transferencia y los reportados por los contribuyentes efectivamente ingresaron a las cuentas del instituto, antes de darlos por válidos.',
    funciones: [
      'Lista de pagos pendientes de conciliar con su referencia, monto y fecha.',
      'Aprobación o rechazo de cada pago.',
      'Al aprobar, se aplican los meses pagados al contribuyente.',
    ],
    recomendaciones: ['No disponible para el personal de caja o taquilla, por control interno.'],
  },
  '/admin/facturacion-electronica': {
    desc: 'Emisión y control de facturas electrónicas de los cobros.',
    proposito: 'Gestiona la facturación electrónica de los cobros realizados, conforme a la normativa fiscal vigente.',
    funciones: [
      'Generación de facturas a partir de los pagos registrados.',
      'Consulta, reimpresión y control del correlativo de facturas.',
      'Soporte del Libro de Ventas.',
    ],
  },
  '/admin/estado-cuenta': {
    desc: 'Emisión de recibos y estados de cuenta oficiales para entregar al contribuyente.',
    proposito: 'Permite generar los documentos oficiales de cobro (recibos y estados de cuenta) para su entrega o envío al contribuyente.',
    funciones: [
      'Estado de cuenta individual mes a mes, con base, IVA, multa y UCD.',
      'Estados de cuenta de contribuyentes con varias actividades.',
      'Descarga en PDF para impresión o envío.',
    ],
  },
  '/admin/convenios-pago': {
    desc: 'Convenios de pago por cuotas para contribuyentes con deuda.',
    proposito: 'Formaliza acuerdos de pago fraccionado con contribuyentes que mantienen deuda, y controla el cumplimiento de cada cuota.',
    funciones: [
      'Creación del convenio con número de cuotas, montos y fechas.',
      'Seguimiento de cuotas pagadas y vencidas.',
      'Reporte de convenios.',
    ],
  },
  '/admin/certificados': {
    desc: 'Certificados de solvencia emitidos y su verificación.',
    proposito: 'Registra y permite consultar los certificados de solvencia emitidos a los contribuyentes que están al día con sus obligaciones.',
    funciones: [
      'Consulta de certificados por contribuyente, número o fecha.',
      'Verificación de la autenticidad de un certificado.',
      'Reimpresión de certificados emitidos.',
    ],
    recomendaciones: ['Solo se emite solvencia a contribuyentes sin deuda pendiente.'],
  },
  '/admin/historial-documentos': {
    desc: 'Historial de todos los documentos generados: recibos, estados de cuenta y certificados.',
    proposito: 'Mantiene la trazabilidad de los documentos emitidos por el sistema, indicando quién los generó, cuándo y para qué contribuyente.',
    funciones: [
      'Búsqueda de documentos por tipo, contribuyente, fecha o funcionario.',
      'Reimpresión de documentos anteriores.',
    ],
  },
  '/admin/buzon': {
    desc: 'Solicitudes y consultas enviadas por los contribuyentes para responder.',
    proposito: 'Centraliza las solicitudes que los contribuyentes envían a través del portal (actualizaciones de datos, reclamos y consultas) para su atención oportuna.',
    funciones: [
      'Bandeja de solicitudes con su estado: pendiente, en proceso o atendida.',
      'Respuesta y cierre de cada solicitud.',
    ],
  },
  '/admin/denuncias': {
    desc: 'Denuncias ciudadanas sobre aseo (basura, botaderos) y su seguimiento.',
    proposito: 'Recibe y da seguimiento a las denuncias de la comunidad relacionadas con el servicio de aseo urbano.',
    funciones: [
      'Registro de la denuncia con ubicación, descripción y evidencia.',
      'Asignación, seguimiento y cierre.',
    ],
  },
  '/admin/rutas': {
    desc: 'Rutas de los camiones recolectores y su planificación.',
    proposito: 'Organiza las rutas de recolección del servicio de aseo, para optimizar la cobertura y el uso de los vehículos.',
    funciones: ['Definición de rutas por sector y frecuencia.', 'Asignación de camiones y personal.'],
  },
  '/admin/servicios-especiales': {
    desc: 'Servicios Especiales, Extraordinarios, Inspecciones, Visto Bueno y Permisos de Tala/Poda.',
    proposito: 'Registra y cobra los servicios no recurrentes establecidos en la Ordenanza, calculando el monto con las tablas oficiales en UCD.',
    funciones: [
      'Servicio Especial: tabla por unidad (4 tipos) y nivel (Baja, Media o Alta) × número de viajes.',
      'Servicio Extraordinario: Volteo 1 o Volteo 2 × número de viajes × factor de llenado.',
      'Inspección: 0,1 UCD por m². Visto Bueno / Variable Ambiental: 15 UCD.',
      'Permisos de Poda y Tala, con sus multas según la cantidad de especies.',
      'Búsqueda del contribuyente por código de inmueble, nombre o RIF.',
    ],
  },
  '/admin/reportes': {
    desc: 'Reportes de recaudación, caja, libro de ventas y conciliaciones.',
    proposito: 'Genera los reportes oficiales de la gestión de recaudación para control interno, rendición de cuentas y obligaciones fiscales.',
    funciones: [
      'Libro de Ventas, monto recaudado en Euros y totales por punto de venta.',
      'Conciliación de transferencias y reportes por caja y por funcionario.',
      'Exportación en Excel y PDF.',
    ],
  },
  '/admin/reportes/multas': {
    desc: 'Meses de multa que debe cada usuario, separado en condominios y contribuyentes.',
    proposito: 'Muestra en detalle los meses que generan multa por mora a cada usuario, aplicando exactamente las mismas reglas de Caja, para gestión de cobro y auditoría.',
    funciones: [
      'Pestaña "Dentro de condominio": unidades con sus meses de multa, multas manuales y quién paga la multa.',
      'Pestaña "Contribuyentes": inmuebles individuales con sus meses de multa y la multa fija.',
      'Buscador y exportación a Excel.',
    ],
    recomendaciones: ['El último mes adeudado no genera multa, y los meses exonerados no se incluyen.'],
  },
  '/admin/correos': {
    desc: 'Envío de correos informativos y de cobranza a los contribuyentes.',
    proposito: 'Permite comunicar información relevante a los contribuyentes por correo electrónico: recordatorios de pago, avisos y notificaciones.',
    funciones: ['Redacción y envío de correos masivos o individuales.', 'Selección de destinatarios por segmento.'],
  },
  '/admin/trabajadores': {
    desc: 'Usuarios del sistema: crear funcionarios, asignar cajas, roles y permisos.',
    proposito: 'Administra las cuentas de los funcionarios que usan el sistema y define qué puede ver y hacer cada uno.',
    funciones: [
      'Alta, edición y desactivación de usuarios.',
      'Asignación de rol, letra de caja y permisos por módulo.',
    ],
    recomendaciones: ['Otorgue solo los permisos necesarios para cada función (principio de mínimo privilegio).'],
  },
  '/cobro-movil': {
    desc: 'Cobro en campo desde el teléfono o la tablet.',
    proposito: 'Versión móvil de la caja, pensada para el cobro en la calle durante las jornadas de campo.',
    funciones: ['Búsqueda del contribuyente y cálculo de su deuda.', 'Registro del pago y emisión del comprobante.'],
  },
  '/admin/plan-accion': {
    desc: 'Plan de acción del instituto: metas, actividades y avance.',
    proposito: 'Da seguimiento al plan de acción institucional, con sus metas, responsables y nivel de avance.',
    funciones: ['Registro de metas y actividades.', 'Control del avance y de los responsables.'],
  },
  '/admin/auditoria': {
    desc: 'Registro de todo lo que se hace en el sistema: quién, qué y cuándo.',
    proposito: 'Garantiza la transparencia y el control interno mediante el registro detallado de las operaciones realizadas por cada usuario.',
    funciones: [
      'Bitácora de cambios con el valor anterior y el nuevo.',
      'Filtros por usuario, módulo, fecha y nivel de criticidad.',
    ],
    recomendaciones: ['Revise periódicamente los cambios de criticidad alta (tarifas, deudas, anulaciones).'],
  },

  // ───────────────────────────── HACIENDA MUNICIPAL ─────────────────────────────
  '/admin/recaudacion': { desc: 'Panel general de Hacienda Municipal.', proposito: 'Visión consolidada de la recaudación de los tributos municipales.', funciones: ['Indicadores de recaudación por tributo.', 'Accesos a cada área de Hacienda.'] },
  '/admin/recaudacion/actividades-economicas': { desc: 'Impuesto sobre Actividades Económicas.', proposito: 'Gestión de contribuyentes y declaraciones del impuesto sobre actividades económicas.', funciones: ['Registro de licencias y declaraciones.', 'Liquidación y cobro.'] },
  '/admin/recaudacion/catastro': { desc: 'Catastro e Inmuebles Urbanos.', proposito: 'Gestión del registro catastral y del impuesto sobre inmuebles urbanos.', funciones: ['Fichas catastrales.', 'Liquidación del impuesto inmobiliario.'] },
  '/admin/recaudacion/vehiculos': { desc: 'Impuesto sobre Vehículos y patentes.', proposito: 'Registro de vehículos y cobro del impuesto correspondiente.', funciones: ['Registro de vehículos.', 'Emisión de solvencias.'] },
  '/admin/recaudacion/ordenamiento': { desc: 'Ordenamiento Territorial: permisos y conformidades.', proposito: 'Trámites de uso conforme, permisos de construcción y variables urbanas.', funciones: ['Registro de solicitudes.', 'Liquidación de tasas.'] },
  '/admin/recaudacion/vialidad': { desc: 'Vialidad y Tránsito.', proposito: 'Tasas y sanciones relacionadas con vialidad y tránsito.', funciones: ['Registro y cobro de tasas.'] },
  '/admin/recaudacion/terminal': { desc: 'Terminal de Pasajeros.', proposito: 'Control de las tasas de la terminal de pasajeros.', funciones: ['Registro de operadoras y tasas.'] },
  '/admin/recaudacion/servicios': { desc: 'Servicios Públicos municipales.', proposito: 'Tasas de los servicios públicos municipales.', funciones: ['Liquidación y cobro de tasas.'] },
  '/admin/recaudacion/ambiente': { desc: 'Tasas ambientales.', proposito: 'Gestión de tasas y permisos ambientales.', funciones: ['Registro y cobro.'] },
  '/admin/recaudacion/policia': { desc: 'Policía Municipal: multas y tasas.', proposito: 'Registro y cobro de multas y tasas de la Policía Municipal.', funciones: ['Registro de multas.', 'Cobro y seguimiento.'] },
  '/admin/recaudacion/convenios': { desc: 'Convenios y exoneraciones tributarias.', proposito: 'Gestión de convenios de pago y exoneraciones aprobadas.', funciones: ['Registro y control de convenios.', 'Registro de exoneraciones.'] },
  '/admin/recaudacion/fiscalizacion': { desc: 'Fiscalización y auditoría tributaria.', proposito: 'Planificación y registro de procesos de fiscalización.', funciones: ['Programación de fiscalizaciones.', 'Registro de actas y resultados.'] },
  '/admin/recaudacion/pagos': { desc: 'Pasarela de pagos de Hacienda.', proposito: 'Consulta y control de los pagos recibidos por los distintos medios.', funciones: ['Consulta de transacciones.', 'Conciliación.'] },

  // ───────────────────────────── ADMINISTRACIÓN INTERNA ─────────────────────────────
  '/admin/administracion': { desc: 'Panel de Administración Interna.', proposito: 'Visión general de la gestión administrativa interna del instituto.', funciones: ['Indicadores administrativos.', 'Accesos a cada área.'] },
  '/admin/administracion/presupuesto': { desc: 'Presupuesto público: formulación y ejecución.', proposito: 'Control de la formulación y ejecución presupuestaria.', funciones: ['Partidas, compromisos y causados.', 'Disponibilidad presupuestaria.'] },
  '/admin/administracion/finanzas': { desc: 'Finanzas, tesorería y pagos.', proposito: 'Gestión de la tesorería, las cuentas bancarias y los pagos a terceros.', funciones: ['Órdenes de pago.', 'Movimientos bancarios.'] },
  '/admin/administracion/rrhh': { desc: 'Recursos Humanos y nómina.', proposito: 'Gestión del personal y del cálculo de la nómina.', funciones: ['Expedientes del personal.', 'Cálculo de nómina.'] },
  '/admin/administracion/compras': { desc: 'Compras y servicios.', proposito: 'Gestión de requisiciones, cotizaciones y órdenes de compra.', funciones: ['Requisiciones.', 'Órdenes de compra y de servicio.'] },
  '/admin/administracion/contrataciones': { desc: 'Contrataciones públicas.', proposito: 'Control de los procesos de contratación conforme a la ley.', funciones: ['Expedientes de contratación.', 'Seguimiento de contratos.'] },
  '/admin/administracion/almacen': { desc: 'Almacén e inventario.', proposito: 'Control de entradas, salidas y existencias de materiales.', funciones: ['Movimientos de inventario.', 'Existencias y alertas de reposición.'] },
  '/admin/administracion/bienes': { desc: 'Bienes Nacionales (activos).', proposito: 'Registro y control de los bienes muebles del instituto.', funciones: ['Inventario de bienes.', 'Asignaciones y desincorporaciones.'] },
  '/admin/administracion/poa': { desc: 'Plan Operativo Anual (POA).', proposito: 'Formulación y seguimiento del Plan Operativo Anual.', funciones: ['Metas y proyectos.', 'Seguimiento de la ejecución.'] },
};

export const descMenu = (href: string) => MANUAL_MENU[href]?.desc || '';
