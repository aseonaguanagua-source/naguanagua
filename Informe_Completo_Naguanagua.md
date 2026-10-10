# Informe General de Desarrollo: Proyecto Naguanagua

**Generado el:** 10/9/2026

Este documento detalla todas las actualizaciones, correcciones y nuevas funcionalidades implementadas desde el inicio del proyecto (Septiembre 2026).

## 📅 Fecha: 2026-10-09

- ✨ **Nueva Funcionalidad:** Fix caja UI y logic for receipts generation, billing calculation, and clean unified tariff display
- ✨ **Nueva Funcionalidad:** anular factura electronica
- ✨ **Nueva Funcionalidad:** extract numeros, virtual group n/a, hide zero deudas and inactive units
- 🐛 **Corrección:** make activities block selectable only as a whole
- 🐛 **Corrección:** revert N/A from condominios and render as groups in caja
- ✨ **Nueva Funcionalidad:** migrate condominios, excel export, fix locales
- 🐛 **Corrección:** Soporte para TARIFA_FIJA dinámica en base a MMV/UCD
- ✨ **Nueva Funcionalidad:** Implementar vinculación de actividades a padres N/A (padre_id) separados de condominios
- 🐛 **Corrección:** change retenciones bucket to documentos to fix public url error
- 🐛 **Corrección:** show Caja retentions in admin tab and resolve bucket error
- 🐛 **Corrección:** resolve IVA mismatch and Cuadre base extraction issues
- ✨ **Nueva Funcionalidad:** add bancoDestino selector for transfers
- 🐛 **Corrección:** set Transferencia to Por Verificar, and extract period for condo receipts
- 🐛 **Corrección:** send tasaOverride when registering payment to prevent mismatch with calculated debt
- 🐛 **Corrección:** remove faulty verify script that caused vercel build failure
- ✨ **Nueva Funcionalidad:** add developer mode toggle via logo double click
- 🐛 **Corrección:** agente de retencion reset bug and enable portal maintenance

## 📅 Fecha: 2026-10-08

- 🐛 **Corrección:** Sambil tipo and MIXTO condos, restore multa, fix IVA bug
- ✨ **Nueva Funcionalidad:** cambiar etiquetas de Tasa BCV a Tasa Euro
- 🐛 **Corrección:** cobrar unidades con tarifa_mmv aunque su actividad sea N/A
- 📌 Fix: clean inmuebles multa_bs when quitar multas is triggered
- 📌 Fix: cascade aseo_pendiente_desde to condominio_unidades
- 🐛 **Corrección:** hide condominios from contribuyentes and caja lists
- ✨ **Nueva Funcionalidad:** add desocupar and eliminar action buttons inline on unit rows
- ✨ **Nueva Funcionalidad:** add fecha input for abonos and pass it to payment processing
- 🐛 **Corrección:** fix local state update when toggling agente retencion
- ✨ **Nueva Funcionalidad:** add toggle for Agente de Retencion directly in Caja UI
- 🐛 **Corrección:** resolve typescript build error for mapLineas type
- ✨ **Nueva Funcionalidad:** add Agente de Retencion option for taxpayers
- 🐛 **Corrección:** remove duplicate mapLineas definition
- 🐛 **Corrección:** always show reference input, fix table rendering
- 📌 Fix: resolve JSX formatting and missing Pencil icon import breaking Vercel build
- 📌 Fix: Update bank accounts with correct numbers and identifiers for IAMEC
- ✨ **Nueva Funcionalidad:** re-enable portal but block condo users with Actualizando message
- 🐛 **Corrección:** explicit button for editing units in condominios page
- ✨ **Nueva Funcionalidad:** modulo de condominios soporta N/A con multiples actividades, correo, telefono y autocodigo

## 📅 Fecha: 2026-10-07

- 📌 Tu mensaje de actualización
- 📌 Update caja de condominios: add Tasa BCV widget and fix decimal parsing
- 📌 Fix: arreglar parseo de decimales y boton TODO en caja de condominios
- 📌 Fix: arreglar margen superior (overlap) del reporte PDF
- 📌 Fix: cargar multa_bs en resumenGeneral para igualar la deuda global
- 📌 Fix: agrupar NA en pdf, arreglar logos, agregar PDF multas y unidad individual, fix mes delete hijos
- 📌 Fix: Buscar agente_retencion en inmuebles en vez de contribuyentes
- 📌 Fix: Calcular retenciones de condominio usando el RIF del condominio en vez de sus unidades, excepto en modalidad INDIVIDUAL
- 📌 Feat: Multipago y comprobante obligatorio en Caja Condominios; filtrar unidades de condominios en caja normal
- 📌 Fix: Detect condominios correctly in Caja retention calculation
- 📌 Fix: Cascade condominio agente_retencion to inmuebles and correct retention calculation for condominios in Caja
- 📌 Make trash button in contribuyentes very visible
- 📌 Fix layout to show delete button inline
- 📌 Fix unit search missing numero in API
- 📌 Fix agente_retencion calculation override in servicio.ts
- 📌 Fix agente_retencion payload in EditorUnidad modal
- 📌 Allow assigning retention agents per unit in Contribuyentes module
- 📌 Fix data corruption in contribuyentes, implement agente_retencion functionality, fix PDF build errors, extract local numbers for condominio units
- 📌 Condominios: quitar todas las multas (unidad o condominio); Facturación electrónica: seleccionar todas / emitir seleccionadas
- 📌 Condominios: multa de unidad por meses (10% residencial / 12% comercial de la mensualidad)
- 📌 Caja de condominios: cobrar un solo local (o todos los del dueño); botón Cobrar por unidad en la ficha
- 📌 Condominios: buscar y editar unidades (actividad, clasificación, tarifa, meses, multas, torre), agregar unidades, opciones del condominio ampliadas

## 📅 Fecha: 2026-10-06

- 📌 Conciliación: guardar el pago por el servidor (el navegador no tenía permiso y el estado no se guardaba; evitaba aprobar dos veces). Caja: recibo y datos de factura digital por el servidor. Separación de condominios: la Caja normal no cobra inmuebles del módulo cuando condominios_separados=true
- 📌 Condominios: cobro por actividad, caja con modo condominio/por contribuyente (factura al condominio o a cada dueño), pagos repartidos, multas manuales (SQL fase 3), filtro de condominios en Conciliación y Facturación, factura digital por renglones
- 📌 Condominios: Caja de Condominios (modo prueba con interruptor), cobro en servidor que baja deuda en módulo e inmuebles, deuda en vivo desde inmuebles, árbol torre→unidad en la ficha, búsqueda, menú
- 📌 condominios fase 2: Areka forzado, copias duplicadas de SIGYR se traen una sola vez
- 📌 condominios fase 2: SQL de jerarquía (torres/nietos) y script de migración desde SIGYR
- 📌 Merge branch 'main' into condominios
- 📌 Contribuyentes: pestaña Huérfanos (SIGYR) — asignar a condominio, registrar como contribuyente o descartar
- 📌 Reportes: corregir monto también en Reporte General de Ingresos; columna Estado en Débito
- 📌 Condominios: ficha (WIP)
- 📌 Merge main en condominios
- 📌 Factura: total editable con motivo (verificación con totales reales). Reportes: admin corrige monto mostrado en cuadre de caja
- 📌 Condominios fase 3 (WIP): servicio, API, lista; tarifa declaradas×tarifa; excluye Individual
- 📌 Merge main en condominios
- 📌 Facturación electrónica: eliminar pago y devolver la deuda (solo administrador, con motivo, vista previa y respaldo en auditoría)
- 📌 Condominios: simulación con comparación contra sistema anterior (pendiente decidir tarifa)
- 📌 Condominios: migración aplicada + desactivación copias HMR
- 📌 Condominios: SQL 1b (estado por unidad), períodos, script de migración con simulación
- 📌 Condominios F1: cuadre de céntimos en reparto por unidad
- 📌 Condominios F1: deuda por unidad, abonos, pago por unidad, multa por cédula del dueño
- 📌 Condominios F1: tablas (SQL aditivo) y motor único con pruebas
- 📌 Recibos por correo: PDF adjunto (cliente y archivo) y botón Ver PDF
- 📌 Caja: búsqueda por código no mezcla meses de otros inmuebles de la misma cédula
- 📌 Caja: al quedar sin deuda, concilia facturas viejas pendientes del RIF
- 📌 Ajuste de deuda: carga inmuebles desde BD (registros nuevos) y tarifa de ordenanza si mmv_mes=0
- 📌 Estado de cuenta: excluye inmuebles eliminados
- 📌 Solvencias: regla única (ignora inmuebles eliminados, solvencia por inmueble), Contribuyentes alineado con Caja
- 📌 Factura por correo: PDF oficial adjunto (TFHKA DescargaArchivo), sin enlace al visor web
- 📌 Portal Soy Contribuyente en mantenimiento (interruptor portalConfig)
- 📌 Caja: monto acordado 45.008,92 solo para URB007447 (hoy), pago completo que salda la deuda
- 📌 Correos: remitente facturacion@globalgreenrec.com (dominio verificado en Resend)
- 📌 Estados de cuenta: agentes de retención muestran IVA completo, IVA retenido (75%) y total a cancelar (Contribuyentes PDF y pantalla, portal PDF y pantalla, Conciliación)
- 📌 URGENTE: descarga secuencial por cursor (sin OFFSET), arranque escalonado, se detiene si la BD está ocupada
- 📌 URGENTE: aceptar caché de ambas versiones para evitar re-descargas masivas
- 📌 URGENTE: revertir versión de caché y quitar recarga automática (saturaba la BD)
- 📌 Contribuyentes: carga completa con reintentos, sin caché incompleta y refresco automático de la caché
- 📌 Flujo de retención IVA: factura retenida hasta aprobar el comprobante; datos por correo; carga en portal; revisión en Conciliación
- 📌 Caja: comprobante de retención opcional; cambio de cédula/RIF; recibos con períodos y multas pagadas
- 📌 Detalles del contribuyente: deuda con inmuebles frescos de la BD
- 📌 Caja: abono/pago múltiple descuenta sobre la deuda actual de la BD, usa el saldo previo y verifica el guardado
- 📌 Contribuyentes: nivel de actividad (Baja/Media/Alta) se carga desde la tarifa real y se guarda en la actividad
- 📌 Recibo de Caja: período cancelado (mes o desde-hasta) y mes por línea
- 📌 Auditoría: lectura vía servidor (la clave pública no podía leerla); censo y plan de acción también
- 📌 Facturación electrónica: descargar recibo de Caja (original guardado al cobrar o reconstruido)
- 📌 Caja guarda deuda previa en cada pago; ajuste de deuda acotado por cédula/inmueble con auditoría; SQL tabla documentos
- 📌 Facturación: multas comerciales se facturan (ítem exento), recibos solo residenciales; auditoría vía API con clave de servicio
- 📌 Montos unificados con Caja: tarifa guardada, tasa única, redondeo, exoneraciones, regla de condominios y retención 75% solo agentes
- 📌 Facturación electrónica: separar Facturas (comerciales) y Recibos por correo (residenciales y comerciales solo multa) por día, con vista previa y envío en lote revisado
- 📌 Contribuyentes: registro con varias actividades comerciales, edición segura (no reescribe tarifas de todos los inmuebles ni de RIF parecidos), identidad con prefijo y códigos URB correlativos
- 📌 Factura digital: fecha y hora de emisión en hora de Venezuela
- 📌 Factura digital: validación fiscal obligatoria antes de emitir (total = cobrado, IVA 16%, suma de ítems) y modo dryRun
- 📌 Factura digital: campos de plantilla TFHKA (CodigoContribuyente, LicenciaAE, Caja), formas de pago Forma|Banco|Referencia y cuadre del total con lo cobrado
- 📌 Factura digital: serie vacía, numeración correlativa y no marcar como emitida si TFHKA rechaza

## 📅 Fecha: 2026-10-05

- 🐛 **Corrección:** nada residencial sale en la factura (excluye recibos/historicos residenciales y prorratea porcion comercial en contribuyentes mixtos)
- ✨ **Nueva Funcionalidad:** copia de todas las facturas a facturacion.comercial@globalgreenca.com, comodin para contribuyentes sin correo, caja pide actualizar si tienen el institucional; factura digital solo para inmuebles comerciales
- 🐛 **Corrección:** usar tabla inmuebles para hijos (editar, exportar Excel, estado de cuenta global), consolidar multi-actividad en un estado de cuenta, limpiar nivel ALTA/MEDIA en estados de cuenta, quitar credenciales hardcodeadas TFHKA
- 🐛 **Corrección:** cancelar meses progresivamente en pago multiple y abonar saldo restante
- 🐛 **Corrección:** separar tarjetas de credito de transferencias en cortes y cuadres de caja
- ✨ **Nueva Funcionalidad:** tarjetas de credito y debito aprobadas inmediatamente y con efectividad al instante
- 🐛 **Corrección:** fijar tasa oficial congelada exacta y sincronizacion de centavos para cuadre perfecto
- ✨ **Nueva Funcionalidad:** selector visual interactivo de meses para asignacion de deuda sin errores
- 🐛 **Corrección:** alinear calculo acumulado de base y mora en caja con el Estado de Cuenta al centavo
- 🐛 **Corrección:** agregar barra de scroll y footer fijo en modal de confirmar pago con muchos recibos
- 🐛 **Corrección:** corregir descarga de reporte pdf de caja, cuadre y boton de reporte del dia
- 🐛 **Corrección:** congelar tasa BCV por jornada diaria en sistema_config para evitar cambio de montos en la tarde
- 🐛 **Corrección:** mostrar monto con IVA y desglose transparente para servicios especiales y tala/poda
- ✨ **Nueva Funcionalidad:** configurar credenciales oficiales de produccion de The Factory HKA (IAMEC Naguanagua)
- ✨ **Nueva Funcionalidad:** mostrar nota destacada con nombre y codigo del condominio padre en caja y contribuyentes
- 🐛 **Corrección:** eliminar deuda historica dinamica (dummy-hist) y multas sin error de uuid
- 🐛 **Corrección:** foreign key order al crear contribuyente y mostrar facturas generales y locales hijos en caja
- 🐛 **Corrección:** cargar servicios especiales en Caja via API y solvencia valida hasta el ultimo dia de mes
- ✨ **Nueva Funcionalidad:** estados de cuenta independientes por cada local en contribuyentes con selector individual y por local
- 🐛 **Corrección:** calculo automatico servicios especiales, resolucion error origen y persistencia actividad contribuyentes
- 🐛 **Corrección:** sincronizar exoneracion mensual de multas en estado de cuenta y caja
- ✨ **Nueva Funcionalidad:** add sandbox debt and discount simulation module for taxpayers (/admin/simulador)
- ✨ **Nueva Funcionalidad:** add TMD (MasterCard) and TVD (Visa) credit card payment methods
- 🐛 **Corrección:** restore flat 10%/12% monthly fine without cumulative elapsed-month compounding to match morning amount of Bs. 73.257,31
- ✨ **Nueva Funcionalidad:** enable individual payment of months and fines for URB014903, URB030783, URB029866, URB015503
- ✨ **Nueva Funcionalidad:** add direct reactivate buttons and status filter tabs for inactive users and workers
- 🐛 **Corrección:** do not show current month October as fine period, label historical fines accurately as prior overdue periods
- ✨ **Nueva Funcionalidad:** add month-by-month fine elimination modal with dzara password and required justification note
- 🐛 **Corrección:** eliminate triangular compounding in fines, respect exoneraciones, and strictly block solvencias with pending debt
- ✨ **Nueva Funcionalidad:** update official list of Venezuelan banks with codes and official legal names
- 🐛 **Corrección:** remove non-existent area column on update and sync notes to both inmuebles and contribuyentes
- 🐛 **Corrección:** bypass RLS via facturas API, fix J-507452557 debt & multi-activity, remove Alta/Media/Baja labels, rename mora to multa
- 🐛 **Corrección:** calculate cumulative monthly mora based on elapsed overdue months per Art 83
- 🐛 **Corrección:** add base64 Data URL fallback in /api/upload to prevent storage RLS errors
- 🐛 **Corrección:** add scroll containers and quick-select buttons for multiple receipts to prevent infinite vertical overflow
- 🐛 **Corrección:** ensure receipts always display post-payment in caja, deactivate inactive users from sigyr, and fix period end date to september
- 🐛 **Corrección:** add /api/upload endpoint with supabaseAdmin to fix bucket RLS errors on document/cedula upload
- 🐛 **Corrección:** generar facturación con calcularMensualidad y referencia oficial
- 🐛 **Corrección:** multas aplican hasta el mes de agosto, septiembre sin multa en octubre
- 🐛 **Corrección:** corregir seleccion de deuda en agrupaciones residenciales y desactivar inmueble duplicado
- 🐛 **Corrección:** tokenizar busqueda por nombre, habilitar cobro de recibos residenciales y vincular inmuebles de Mirna Olmos
- 🐛 **Corrección:** corregir corte en impresion de recibos largos, eliminar overflow:hidden, fijar titulo RECIBO DE COBRO en residencial y ajustar reportes
- 🐛 **Corrección:** endpoint seguro para almacenar correo y telefono, persistencia garantizada en inmuebles y contribuyentes, y boton de edicion en caja
- 🐛 **Corrección:** normalizar siempre el nombre de usuario a minusculas al guardar trabajadores
- 🐛 **Corrección:** flexibilizar login de trabajadores, insensibilidad a mayusculas/minusculas, busqueda por alias y cedula
- 🐛 **Corrección:** mover botones de copiado a Client Component para resolver error 500 en SSR de Vercel
- 🐛 **Corrección:** resolver bucle de cambio de tasa bcv y anadir desglose detallado de locales con iva y multa en condominios
- ✨ **Nueva Funcionalidad:** agregar cuenta bancaria oficial de Bancamiga en todo el sistema y auditoria de sincronizacion
- 🐛 **Corrección:** remover concepto de disposicion final segun ordenanza municipal
- ✨ **Nueva Funcionalidad:** agregar vista de demostracion de recibo residencial con impresion en media hoja
- 🐛 **Corrección:** eliminar barra azul titilante y remover conciliacion bancaria a usuarios de caja
- ✨ **Nueva Funcionalidad:** restringir conciliacion bancaria, habilitar reportes para cajero con bloqueo a su propio usuario

## 📅 Fecha: 2026-10-04

- ✨ **Nueva Funcionalidad:** restringir modulo administrativo exclusivamente al administrador
- 🐛 **Corrección:** corregir orden de hooks de React y desacoplar mapa de permisos
- 📌 Corregir carga de permisos de trabajadores en login y navegacion fluida para usuarios de caja
- 📌 Incluir Instituto de Ecosocialismo en el footer para completar los 4 logos institucionales
- 📌 Agregar columnas cedula, correo, permisos a tabla trabajadores y resiliencia al guardar
- 📌 Ajustar header sin espacio en blanco y colocar Naguanagua Te Quiero junto a Global Rec en el footer
- 📌 Unificar estilo visual oscuro de pantalla de login para todos los trabajadores y modulos
- 🐛 **Corrección:** remover screenshot de cabecera y organizar logos (Elizabeth arriba izquierda, Lacava arriba derecha, Naguanagua Te Quiero abajo)
- 🐛 **Corrección:** remover logo basura cero y requerir usuario y contrasena limpios en roles de operador y funcionario
- ✨ **Nueva Funcionalidad:** complete The Factory HKA integration with pre-emission audit, batch emit, internal backup copy and fallback email management
- ✨ **Nueva Funcionalidad:** align landing page funcionario card with requested design, dedicated login routing and clean logos
- 🐛 **Corrección:** palabra Administrador en selector, cierre de sesion definitivo con performLogout y distribucion de logos sin repeticion
- ✨ **Nueva Funcionalidad:** arquitectura multi-operador en tiempo real y tarjeta modulo operador con selector de puestos de trabajo
- 🐛 **Corrección:** agrupar filiales en condominio padre, aseo por condominio y multas por oficina
- 🐛 **Corrección:** resolver visibilidad de contribuyentes multi-inmueble (urb004206), busqueda BD y restaurar tarjeta con logo Global Green
- ✨ **Nueva Funcionalidad:** bloqueo obligatorio de acceso a funcionarios con credenciales maestras dzara/dzara y control granular de rutas
- ✨ **Nueva Funcionalidad:** matriz de permisos granulares adaptada a naguanagua y correccion de mapas y ubicaciones municipales
- ✨ **Nueva Funcionalidad:** modulo de trazabilidad forense integral, kpis, filtros avanzados y criticidad
- 🐛 **Corrección:** conectar checkboxes de cluster de condominios con selectedHijos
- ✨ **Nueva Funcionalidad:** separar y aislar completamente las búsquedas por código de inmueble
- 🐛 **Corrección:** aislar busqueda por codigo catastral y admitir deuda cero en hijos de condominio
- 🐛 **Corrección:** resolver FO comercial desde ordenanza oficial y mostrar total con IVA
- 🐛 **Corrección:** asegurar que getHijoDebt y totalDeudaCondominio usen calculo residencial exento alineado a 62k
- 🐛 **Corrección:** busqueda exacta por codigo de inmueble, calculo FO residencial y deteccion de condominios
- 🐛 **Corrección:** unificar y aplicar FAR oficial exacto en la tabla de tarifas y todos los modulos
- 📌 audit: unificar y verificar el 100% de formulas comerciales e industriales segun Ordenanza Municipal Art. 61 y 83
- 🐛 **Corrección:** actualizar FAR por tipo de inmueble segun Tabla A de la Ordenanza (Apartamento Zona A = Quinta Zona A = 1.198,43 Bs)
- 🐛 **Corrección:** corregir estado de cuenta pdf, calculo de condominios residenciales vs locales comerciales y filtro de inmuebles de contribuyentes
- 🐛 **Corrección:** paginacion por inmueble en pdf, hoja compartida para local multiactividad y tabla compacta sin listas largas
- 🐛 **Corrección:** alinear modal detalles contribuyente con ordenanza, exonerar ultimo mes de multa y restringir impresion fisica a residencial
- 🐛 **Corrección:** incorporar Casa Zona A/B y unificar FAR zonal para diferenciar montos por tipo de vivienda
- 🐛 **Corrección:** clasificar correctamente inmuebles residenciales vs comerciales con isResidencialInm y agregar conteo en pestanas
- 🐛 **Corrección:** remover logo y marca Global Rec de todos los documentos, certificados y recibos oficiales
- 🐛 **Corrección:** plantilla oficial de solvencia alcaldia naguanagua y validacion estricta de deuda en tiempo real
- ✨ **Nueva Funcionalidad:** centralizar cliente Resend con fallback seguro para Vercel
- 📌 chore(email): restaurar correo de prueba por defecto a aseonaguanagua@globalgreenca.com
- ✨ **Nueva Funcionalidad:** soporte sandbox y fallback automatico al correo de la cuenta de Resend
- 🐛 **Corrección:** validar api key de resend y usar remitente onboarding para pruebas
- 🐛 **Corrección:** reportar estado real de envio de correo y fallback onboarding
- 🐛 **Corrección:** resolver items dinamicos y contingencia de rango demo en TFHKA
- 📌 chore(scripts): agregar utilidades de auditoria, creacion de usuario de pruebas y generacion de manuales
- ✨ **Nueva Funcionalidad:** modulo de facturacion electronica controlada, busqueda, reenvio a correo de prueba y correccion de carga masiva de contribuyentes

## 📅 Fecha: 2026-10-03

- ✨ **Nueva Funcionalidad:** unificar calculos, agrupacion y recibos entre Admin Caja, Cobro Movil y Portal Contribuyente
- ✨ **Nueva Funcionalidad:** unificar actividades economicas del mismo local fisico en una sola tarjeta consolidada
- ✨ **Nueva Funcionalidad:** agrupar recibos por inmueble con acordeon desplegable y selector de todo el inmueble
- ✨ **Nueva Funcionalidad:** unificar actividades economicas de un mismo local al seleccionar y agrupar en formula y recibos
- ✨ **Nueva Funcionalidad:** auditar, corregir y armonizar prefijos V a J masivamente en inmuebles y contribuyentes
- 🐛 **Corrección:** corregir prefijos RIF/cedula, notificacion obligatoria de contacto en caja, primer ingreso en portal y reglas de condominio en solvencia/pagos
- ✨ **Nueva Funcionalidad:** agrupar actividades extras por local físico requiriendo misma cédula/RIF y misma dirección
- 🐛 **Corrección:** consolidar actividades de nietos por mes con desglose, factura digital unica a condominio padre y limpieza de telefonos y correos
- ✨ **Nueva Funcionalidad:** support multi-month debt selection and dynamic month payment per local/apartment
- ✨ **Nueva Funcionalidad:** fix child units detection (281 Sambil stores), add Centro de Cobranza de Condominio with 3 modes (Total, Local, Abono) in Caja
- 🐛 **Corrección:** alinear tarifa mensual de caja con tarifas/ordenanza y fijar multa al 10% residencial
- 🐛 **Corrección:** exonerar estrictamente iva 0% en residencial, corregir calculo mensual y sincronizacion en caja
- 🐛 **Corrección:** eliminar redirección de middleware que atrapaba al usuario en inicio (/admin)
- ✨ **Nueva Funcionalidad:** aceleración instantánea con caché persistente en navegador (IndexedDB) y carga paralela
- ✨ **Nueva Funcionalidad:** armonización de tarifas mensuales, multas reglamentarias, iva comercial y normalización de cédulas/RIF

## 📅 Fecha: 2026-10-01

- 🐛 **Corrección:** presidencia sin redirect a login, boton salir -> /
- 📌 ci: forzar redeploy con AdminAuthWrapper corregido
- 🐛 **Corrección:** AdminAuthWrapper simplificado sin setters TS (acceso directo)
- ✨ **Nueva Funcionalidad:** acceso directo sin login en Admin, Presidencia y Operador de Censo
- 🐛 **Corrección:** agregar refreshData al destructure de useAppContext en contribuyentes y convenios-pago
- 🐛 **Corrección:** corregir doble llave en caja/page.tsx que rompía el build
- 🐛 **Corrección:** auditoria unificada, login dual bcrypt/plaintext, bugs Math.random, reload -> refreshData

## 📅 Fecha: 2026-09-30

- ✨ **Nueva Funcionalidad:** sistema 100% funcional — Fase 1+2+3+4
- 🐛 **Corrección:** quitar Sucursal de factura TFHKA (no aplica)
- 🐛 **Corrección:** 4 problemas críticos en facturación TFHKA
- 🐛 **Corrección:** deuda no se elimina + FormasPago monto mismatch TFHKA
- ✨ **Nueva Funcionalidad:** agregar Depósito Bancario como forma de pago
- 🐛 **Corrección:** 4 problemas en factura TFHKA + datos de prueba eliminados
- 🐛 **Corrección:** condición de carrera - TFHKA emitir ANTES de limpiar deuda_mmv
- 🐛 **Corrección:** 2 errores críticos que impedían emisión de facturas TFHKA
- 🐛 **Corrección:** EMAIL_TEST_MODE cubre TODOS los correos del sistema
- 🐛 **Corrección:** detección inteligente de TipoIdentificacion (V/J/E) para TFHKA
- 🐛 **Corrección:** RECIB-HIST no borraba deuda_mmv + identidad sin prefijo fallaba en TFHKA
- 🐛 **Corrección:** trigger TFHKA completo al aprobar transferencia en conciliación
- ✨ **Nueva Funcionalidad:** modo prueba EMAIL_TEST_MODE - redirige correos de recibos a aseonaguanagua@globalgreenca.com
- ✨ **Nueva Funcionalidad:** facturación electrónica TFHKA - formulario configurable con IVA y multa exenta
- 🐛 **Corrección:** remove stale hardcoded URL - show generate button when no invoice URL exists yet
- 🐛 **Corrección:** rebuild both routes from official JSON examples - Moneda BSD in IdentificacionDocumento, Notificar null, TasaIVA without decimals
- 🐛 **Corrección:** move Moneda inside IdentificacionDocumento per official API docs
- 🐛 **Corrección:** move Moneda to root body level - not inside documentoElectronico
- 🐛 **Corrección:** multa is exempt from IVA - fix totals and impuestos subtotal
- 🐛 **Corrección:** use hardcoded realistic commercial contributor - no DB dependency for TFHKA validation
- 🐛 **Corrección:** progressively relax contributor query - use any payment if no commercial found
- ✨ **Nueva Funcionalidad:** use real commercial contributor with fine for TFHKA test invoice
- 📌 chore: remove temporary test scripts breaking the build
- 🐛 **Corrección:** resolve strict JSON schema errors with Notificar format and missing Moneda field
- 🐛 **Corrección:** revert Notificar back to string SI
- 🐛 **Corrección:** use boolean true for Notificar field to pass strict JSON validation
- ✨ **Nueva Funcionalidad:** configure master email for invoice delivery and re-enable Notificar
- 🐛 **Corrección:** set Notificar to NO when email is empty to pass validation
- 🐛 **Corrección:** update json schema for recent api changes
- ✨ **Nueva Funcionalidad:** add test invoice generator and unify BCV rates
- 🐛 **Corrección:** resolve syntax error and implement monthly consolidation for N/A users correctly
- ⚡ **Rendimiento:** fix navigation loading screen and Edge runtime middleware
- 🔒 **Seguridad:** Phase 6 - complete auth overhaul (C-2, A-3, M-1)
- 🔒 **Seguridad:** Phase 5 - fix 6 critical/high vulnerabilities
- ⚡ **Rendimiento:** Phase 4 - performance audit fixes across 7 bottlenecks
- ♻️ **Refactorización:** Phase 3 - fix I-6 saldo bug, selective refresh, saldoFavor module
- ♻️ **Refactorización:** Phase 2 - extract useCajaCalculations and useCajaSelection hooks
- ♻️ **Refactorización:** Phase 1 - extract helpers, fix getFAR bug, add useMemo

## 📅 Fecha: 2026-09-29

- 📌 Auto-select receipts of same local/month
- 📌 Implement Jaccard similarity grouping for same local logic
- 📌 Revert grouping logic and fix badge text
- 📌 Group receipts of the same local into a single box with individual descriptions
- 📌 Add master checkbox for Mismo Local
- 📌 Filter out eliminated properties from frontend state
- 📌 Fix syntax error in page.tsx
- 📌 Add Mismo Local badge for properties with same identity
- 📌 Fix formula display to show fallback FO
- 📌 Fix search for condominios to display all children
- ✨ **Nueva Funcionalidad:** add checkbox for agente de retencion en contribuyentes
- 📌 Fix Resumen de Pago double counting condominio debts
- 📌 Fix caja UI: non-stretching formula box, search bar, compact recibos
- 📌 Move checkboxes to formula block
- 📌 Fix UI grouping and multas in caja, update por-facturar refs
- 📌 Fix IVA calculation on generic bills and show detailed formula per property in Caja
- 📌 Fix nietos rule: Add secondary economic activities (nietos) into the calculated mmv_mes for proper billing aggregation
- 📌 Fix missing import in por-facturar causing build failure
- 📌 Update residential classification in ordenanza.ts and fix bad math from previous edit
- 📌 Fix referential FAR value in UI causing confusion with 16% IVA
- 📌 Update tarifas page to explicitly mention IVA exemption for residential

## 📅 Fecha: 2026-09-28

- 📌 Fix tls reject on bcv api
- 📌 Fix tarifas residencial zonas y bug de iva en caja admin
- 🐛 **Corrección:** insert actual base64 data for transparent instituto logo
- 🎨 **Diseño/Estilo:** make instituto logo transparent and fix CSS classes
- 🎨 **Diseño/Estilo:** fix footer logos and background per user request
- 🎨 **Diseño/Estilo:** revert footer to white background and increase logo size
- 🎨 **Diseño/Estilo:** fix global_rec visibility and spacing in footer
- 🎨 **Diseño/Estilo:** unify footer background and fix logo blend modes
- ✨ **Nueva Funcionalidad:** replace ISMA with IAMEC and update all requested logos
- 🐛 **Corrección:** correct commercial invoice calculation in all portals, caja, and cobro-movil
- ⚡ **Rendimiento:** prevent AppContext from fetching all data on portal pages
- 🐛 **Corrección:** increase center z-index to avoid footer overlap
- ✨ **Nueva Funcionalidad:** redesign homepage with contribuyente/funcionario toggle and roles dropdown
- 🐛 **Corrección:** resolve TS2339 by adding actividad_principal to Supabase select in billing cron
- 🐛 **Corrección:** unify FO of desocupados to 1.98
- 🐛 **Corrección:** use dynamic getFAR for residential properties in billing cron
- 🐛 **Corrección:** update calculation formulas on tarifas page to match ordenanza UCD logic
- 🐛 **Corrección:** apply *57 multiplier to commercial billing cron and regenerate CSV
- 📌 Revert "fix: remove errant * 57 multiplier from commercial base calculation"
- 🐛 **Corrección:** remove errant * 57 multiplier from commercial base calculation
- ✨ **Nueva Funcionalidad:** export commercial tariffs to CSV
- 🐛 **Corrección:** apply commercial IVA and multa to condominio mode calculations
- ✨ **Nueva Funcionalidad:** add global loading screen overlay during initial data sync
- 🐛 **Corrección:** robust getFO matching and fallback to prevent 0 amount En Verificacion errors

## 📅 Fecha: 2026-09-27

- 🐛 **Corrección:** update sumBase from selectedHijos in caja
- 🐛 **Corrección:** make getFO activity matching more forgiving to avoid 0 amount receipts
- 🐛 **Corrección:** fetch meses_deuda in cobro movil to calculate dummy receipts
- 🐛 **Corrección:** include condominioHijos in sourceInms so they don't appear as En Verificacion in Caja
- 🐛 **Corrección:** identity matching in caja for missing document prefixes
- 🐛 **Corrección:** dummy receipt generation in cobro movil for zero mmv debt
- 🐛 **Corrección:** retrieve children properties so receipts calculate values correctly
- ✨ **Nueva Funcionalidad:** show property breakdown in cobro movil
- ✨ **Nueva Funcionalidad:** group caja receipts by property
- 🐛 **Corrección:** ignore multa for grace period of recent month
- 🐛 **Corrección:** contribuyentes modal actually synced this time
- 🐛 **Corrección:** date generation off-by-one and contribuyentes modal dummy sync
- 🐛 **Corrección:** generate dummy bills for users missing mmv but having meses_deuda
- 🐛 **Corrección:** sync invoice generation in contribuyentes with caja
- 🐛 **Corrección:** remove equivalente por mes from caja UI
- 📌 trigger: force vercel rebuild
- 🐛 **Corrección:** remove double IVA rendering in caja and zero out multa for current month
- 🐛 **Corrección:** restore 57 multiplier to commercial formula and differentiate multa (10% res, 12% com) with explicit breakdowns
- 🐛 **Corrección:** remove erroneous 57 multiplier from commercial math and restrict IVA exclusively to commercial properties
- ✨ **Nueva Funcionalidad:** recalculate historical debt dynamically ignoring DB garbage and add IVA and Multas to receipts

## 📅 Fecha: 2026-09-26

- ✨ **Nueva Funcionalidad:** desglose mensual de la deuda historica
- 🐛 **Corrección:** correct confusing Formula Aplicada text in caja
- 🐛 **Corrección:** resolve typescript build errors by making getFAR available in contribuyentes and estado-cuenta components
- 🐛 **Corrección:** estandarizar calculo de deudas historicas incluyendo multas y FAR de manera uniforme en caja, portal y contribuyentes
- ✨ **Nueva Funcionalidad:** agregar aviso a agentes de retencion justo antes de cancelar
- 🐛 **Corrección:** incluir multas en el cobro de deuda historica
- ✨ **Nueva Funcionalidad:** mostrar desglose de retenciones en conciliación
- 🐛 **Corrección:** remove redundant 57 multiplier from deuda_mmv since it already includes it in DB
- 🐛 **Corrección:** corregir fórmula de cálculo de tarifas y aplicación de FAR/UCD
- 🐛 **Corrección:** corregir calculo IVA para agentes de retencion - cobran 25% IVA, retienen 75%
- ✨ **Nueva Funcionalidad:** agente retencion - aviso en kiosco, deteccion automatica, 468 agentes en BD
- ✨ **Nueva Funcionalidad:** sistema completo de retenciones IVA - portal agente, admin conciliacion, sidebar condicional
- 🐛 **Corrección:** recuperar nombre desde tabla contribuyentes si falta en inmuebles y facturas
- ✨ **Nueva Funcionalidad:** calcular y agregar 16% de IVA a inmuebles comerciales en cobro-movil
- ✨ **Nueva Funcionalidad:** simplificar vista cobro-movil mostrando solo deuda, iva y pago total sin formulas
- ✨ **Nueva Funcionalidad:** cobro-movil recupera nombre de facturas si falta en inmueble y añade desglose detallado con porcentajes
- ✨ **Nueva Funcionalidad:** cobro-movil muestra nombre, detalles, direccion y conecta deuda_mmv con formula oficial
- 🐛 **Corrección:** corregir formulas de calculo de tarifas segun ordenanza oficial (residencial y comercial)

## 📅 Fecha: 2026-09-25

- 🐛 **Corrección:** cargar inmuebles directo en cliente para evitar Vercel timeout 504
- ✨ **Nueva Funcionalidad:** eliminar login de cobro-movil para autogestion publica
- ⚡ **Rendimiento:** quitar AppContext de cobro-movil para acelerar carga al instante
- ✨ **Nueva Funcionalidad:** rediseño modulo cobro movil para kiosco
- 📌 Initial commit for naguanagua

## 📅 Fecha: 2026-09-21

- 📌 Initial commit for Naguanagua setup

