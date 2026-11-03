import { NextRequest, NextResponse } from 'next/server';
import { RUTAS_NAGUANAGUA } from '@/data/rutasNaguanagua';
import { CUENTAS_BANCARIAS_OFICIALES } from '@/lib/cuentasBancarias';

export const dynamic = 'force-dynamic';

function normalizar(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const fmtBs = (n: number) =>
  'Bs. ' +
  (Number(n) || 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface AccionSugerida {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
}

function buscarRutasPorTexto(textoDireccionOSector: string) {
  const q = normalizar(textoDireccionOSector);
  if (!q) return [];

  const stopWords = new Set([
    'calle', 'avenida', 'av', 'sector', 'urbanizacion', 'urb', 'conjunto', 'residencial',
    'res', 'casa', 'nro', 'numero', 'local', 'piso', 'edificio', 'edif', 'naguanagua',
    'carabobo', 'edo', 'estado', 'valencia', 'cerca', 'frente', 'final', 'vereda', 'manzana',
    'etapa', 'parcela', 'centro', 'comercial', 'cc', 'del', 'las', 'los', 'una', 'por',
    'para', 'con', 'que', 'dias', 'pasa', 'aseo', 'camion', 'ruta', 'horario', 'horarios',
    'recoleccion', 'basura', 'cuando', 'donde', 'mi', 'el', 'la', 'en', 'de', 'al', 'y', 'o'
  ]);

  const tokens = q
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t));

  const resultados: { ruta: any; score: number }[] = [];

  for (const r of RUTAS_NAGUANAGUA) {
    const secNorm = normalizar(`${r.nombre} ${r.sectores}`);
    let score = 0;

    for (const tok of tokens) {
      if (secNorm.includes(tok)) {
        score += tok.length >= 5 ? 3 : 1;
      }
    }

    if (score > 0) {
      resultados.push({ ruta: r, score });
    }
  }

  resultados.sort((a, b) => b.score - a.score);
  return resultados.slice(0, 4).map((x) => x.ruta);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mensajeUsuario = String(body.mensaje || '').trim();
    const ctx = body.contextoCuenta || {};

    const nombre = String(ctx.nombre || 'Contribuyente').trim();
    const doc = String(ctx.doc || '').trim();
    const categoria = String(ctx.categoria || 'RESIDENCIAL').toUpperCase();
    const direccion = String(ctx.direccion || '').trim();
    const tasaBcv = Number(ctx.tasaBcv) || 0;
    const deudaTotalBs = Number(ctx.deudaTotalBs) || 0;
    const totalBaseBs = Number(ctx.totalBaseBs) || 0;
    const totalMultaBs = Number(ctx.totalMultaBs) || 0;
    const totalIvaBs = Number(ctx.totalIvaBs) || 0;
    const totalRetencionBs = Number(ctx.totalRetencionBs) || 0;
    const saldoFavorBs = Number(ctx.saldoFavorBs) || 0;
    const recibosPendientesCount = Number(ctx.recibosPendientesCount) || 0;
    const esAgenteRetencion = Boolean(ctx.esAgenteRetencion);
    const inmuebles: any[] = Array.isArray(ctx.inmuebles) ? ctx.inmuebles : [];
    const pagosRecientes: any[] = Array.isArray(ctx.pagosRecientes) ? ctx.pagosRecientes : [];
    const pagosPorVerificar: any[] = Array.isArray(ctx.pagosPorVerificar) ? ctx.pagosPorVerificar : [];
    const notasCredito: any[] = Array.isArray(ctx.notasCredito) ? ctx.notasCredito : [];

    const q = normalizar(mensajeUsuario);
    const acciones: AccionSugerida[] = [];
    let accionEspecial: string | undefined = undefined;

    // 1. Detectar rutas asociadas a la consulta o a la dirección del contribuyente
    const rutasDeConsulta = buscarRutasPorTexto(mensajeUsuario);
    const rutasDeDireccion = buscarRutasPorTexto(direccion);
    const rutasSugeridas = rutasDeConsulta.length > 0 ? rutasDeConsulta : rutasDeDireccion;

    // 2. Clasificación inteligente de intención (NLU en Español para "Global")
    const pideDescargarEstadoCuenta =
      /(descargar|bajar|descarga|generar|obtener|enviar|dame|quiero).*(estado de cuenta|pdf|recibo de deuda|planilla de deuda)/.test(q) ||
      q === 'descargar estado de cuenta' ||
      q === 'estado de cuenta pdf';

    const pideOrientacion =
      /orienta|orientacion|como usar|como funciona|guia|paso a paso|tutorial|explicame|como reporto|como subo|montar comprobante|usar la camara|tomar foto|foto al comprobante|navegar|secciones del sistema|que puedo hacer en la app/.test(q);

    const pideMulta =
      /multa|mora|recargo|sancion|exonerad|penalidad|intereses/.test(q);

    const pideDeuda =
      /deuda|cuanto debo|debo|estado de cuenta|mensualidad|pendiente por pagar|monto a pagar|saldo pendiente|facturas pendientes|recibos pendientes|solvente|insolvente|al dia/.test(q);

    const pideFormasPago =
      /como pagar|donde pagar|formas de pago|metodo de pago|metodos de pago|cuenta bancaria|cuentas bancarias|bancamiga|banesco|transferencia|punto de venta|taquilla|efectivo|pago movil|datos bancarios|rif del instituto|rif iamec/.test(q);

    const pideRutas =
      /ruta|rutas|horario|horarios|camion|aseo|basura|recoleccion|que dia pasa|cuando pasa|compactador|sector|urbanizacion/.test(q);

    const pideInmuebles =
      /inmueble|inmuebles|locales|local|codigo|codigos|propiedad|propiedades|actividad economica|actividades|catastro|f\.o|factor/.test(q);

    const pideSaldoFavor =
      /saldo a favor|nota de credito|notas de credito|excedente|sobrante|credito a favor/.test(q);

    const pideHistorialOFactura =
      /historial|ultimos pagos|mis pagos|pagos realizados|factura fiscal|factura electronica|seniat|recibo de pago|comprobante|retencion/.test(q);

    const pideSolvenciaOServicios =
      /solvencia|certificado|tala|poda|arbol|visto bueno|inspeccion|servicio especial|servicios extraordinarios|escombros|denuncia|reclamo/.test(q);

    let respuesta = '';
    const netoAPagar = Math.max(0, deudaTotalBs - totalRetencionBs - saldoFavorBs);

    // ── INTENCIÓN 1: DESCARGAR ESTADO DE CUENTA EN PDF ──
    if (pideDescargarEstadoCuenta) {
      accionEspecial = 'DESCARGAR_ESTADO_CUENTA';
      respuesta =
        `¡Por supuesto, **${nombre}**! 📄✨\n\n` +
        `Soy **Global**, tu asistente inteligente. Ya mismo estoy generando y descargando tu **Estado de Cuenta Oficial en PDF** correspondiente a **${doc}** (${inmuebles.length} inmueble/s activo/s).\n\n` +
        `📊 **Resumen incluido en tu PDF:**\n` +
        `• **Servicio Base:** ${fmtBs(totalBaseBs)}\n` +
        `• **Multas / Mora:** ${fmtBs(totalMultaBs)}\n` +
        (totalIvaBs > 0.01 ? `• **IVA (16%):** ${fmtBs(totalIvaBs)}\n` : '') +
        (esAgenteRetencion && totalRetencionBs > 0.01
          ? `• **Retención 75% IVA:** -${fmtBs(totalRetencionBs)}\n`
          : '') +
        (saldoFavorBs > 0.01 ? `• **Saldo a Favor:** -${fmtBs(saldoFavorBs)}\n` : '') +
        `• **Total Neto a Pagar:** **${fmtBs(netoAPagar)}**\n\n` +
        `👇 Si la descarga no inició automáticamente en tu dispositivo, toca el botón **"📥 Descargar mi Estado de Cuenta (PDF)"** aquí abajo:`;

      acciones.push(
        { label: '📥 Descargar mi Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'primary' },
        { label: '📄 Abrir vista completa de Estado de Cuenta', href: '/portal/estado-cuenta', variant: 'secondary' },
        { label: '💳 Ir a Pagar', href: '/portal/pagos', variant: 'secondary' }
      );
    }
    // ── INTENCIÓN 2: ORIENTACIÓN PASO A PASO DEL SISTEMA Y USO DE CÁMARA ──
    else if (pideOrientacion) {
      respuesta =
        `¡Con mucho gusto te oriento, **${nombre}**! 🧭 Soy **Global**, tu asistente dentro de **Soy Contribuyente IAMEC**.\n\n` +
        `Aquí tienes la **Guía Paso a Paso** para usar todas las funciones de tu aplicación:\n\n` +
        `### 1️⃣ ¿Cómo reportar un pago y usar tu Cámara? 📸\n` +
        `1. Entra en el menú **Pagar**.\n` +
        `2. Selecciona los períodos o inmuebles que deseas cancelar (por defecto ya están marcados).\n` +
        `3. Elige el banco destino (**Banesco** o **Bancamiga**), escribe tu **referencia de 8 dígitos** y la fecha.\n` +
        `4. En **Comprobante de Transferencia** ahora tienes **dos opciones**:\n` +
        `   • 📂 **Subir Comprobante:** para elegir una imagen o PDF desde tu galería o archivos.\n` +
        `   • 📷 **Usar Cámara:** para tomarle una foto directa al capture o recibo bancario al instante.\n` +
        `5. Presiona **Reportar Pago** y ¡listo! Nuestro equipo conciliará tu pago y emitirá tu factura.\n\n` +
        `---\n` +
        `### 2️⃣ ¿Dónde descargo mi Estado de Cuenta, Recibos y Facturas SENIAT? 🧾\n` +
        `• **Desde este chat conmigo (Global):** solo toca **"📥 Descargar mi Estado de Cuenta (PDF)"** y te lo descargo al instante.\n` +
        `• **En Facturación:** descargas tus **Facturas Fiscales Digitales SENIAT** y tus **Recibos de Caja**.\n` +
        `• **En Retención (Agentes Especiales):** puedes subir o tomar foto a tu comprobante del **75% de IVA**.\n\n` +
        `---\n` +
        `### 3️⃣ Otros módulos útiles de tu menú lateral 📱\n` +
        `• **Mis Inmuebles:** consulta tus códigos catastrales, actividades económicas y tarifas en UCD/Bs.\n` +
        `• **Rutas y Horarios:** revisa qué días pasa el camión compactador por tu urbanización o comercio.\n` +
        `• **Historial Certificados / Tala y Poda / Reclamos:** solicita solvencias, permisos ambientales o reporta incidencias.`;

      acciones.push(
        { label: '💳 Ir a Pagar (Subir o Usar Cámara)', href: '/portal/pagos', variant: 'primary' },
        { label: '📥 Descargar mi Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'secondary' },
        { label: '🧾 Ver mis Facturas SENIAT', href: '/portal/facturacion', variant: 'secondary' }
      );
    }
    // ── INTENCIÓN 3: MULTAS ──
    else if (pideMulta && !pideFormasPago && !pideRutas) {
      const inmsConMulta = inmuebles.filter((i) => Number(i.multaBs) > 0.01);
      if (totalMultaBs <= 0.01 && inmsConMulta.length === 0) {
        respuesta =
          `¡Buenas noticias, **${nombre}**! 🎉\n\n` +
          `Soy **Global** y acabo de verificar tu cuenta (**${doc}**): actualmente **no presentas multas ni recargos por mora activos** (**Bs. 0,00**).\n\n` +
          (deudaTotalBs > 0.01
            ? `• Tu saldo pendiente corresponde únicamente al servicio de aseo urbano por **${fmtBs(netoAPagar)}**.\n• Recuerda cancelar dentro del mes en curso para mantener tu cuenta libre de recargos.`
            : `• Tu cuenta se encuentra **totalmente solvente y al día**.`);
      } else {
        const desgloseMultas = inmsConMulta
          .map(
            (i) =>
              `• **${i.codigo}** (${i.tipo}): Multa de **${fmtBs(i.multaBs)}** (${i.mesesDeuda || 0} mes(es) vencidos)`
          )
          .join('\n');

        respuesta =
          `Hola **${nombre}**, soy **Global**. Revisé el detalle de multas y recargos en tu cuenta:\n\n` +
          `⚠️ **Total en Multas / Mora:** **${fmtBs(totalMultaBs)}**\n\n` +
          (desgloseMultas ? `**Desglose por inmueble:**\n${desgloseMultas}\n\n` : '') +
          `📌 **¿Por qué se genera este cargo?**\n` +
          `De acuerdo con la ordenanza municipal vigente, los meses vencidos no cancelados oportunamente generan un recargo por mora o sanción administrativa.\n\n` +
          `💡 Puedes descargar tu Estado de Cuenta en PDF aquí mismo o ir a **Pagar** para regularizar tu cuenta.`;
      }
      acciones.push(
        { label: '📥 Descargar Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'primary' },
        { label: '💳 Ir a Pagar', href: '/portal/pagos', variant: 'secondary' }
      );
    }
    // ── INTENCIÓN 4: DEUDA / CUÁNTO DEBO ──
    else if (pideDeuda) {
      if (deudaTotalBs <= 0.01) {
        respuesta =
          `¡Felicitaciones, **${nombre}**! ✅\n\n` +
          `Soy **Global** y te confirmo que tu cuenta (**${doc}**) se encuentra **SOLVENTE (Al Día)**.\n\n` +
          `• **Deuda Total Pendiente:** **Bs. 0,00**\n` +
          `• **Multas Activas:** **Bs. 0,00**\n` +
          (saldoFavorBs > 0.01
            ? `• **Saldo a Favor Disponible:** **${fmtBs(saldoFavorBs)}**\n`
            : '') +
          (pagosPorVerificar.length > 0
            ? `\n⏳ Tienes **${pagosPorVerificar.length} pago(s) en proceso de verificación bancaria** por parte del equipo de conciliación.`
            : `\nPuedes descargar tu Estado de Cuenta en cero o tus certificados de solvencia cuando lo desees.`);
        acciones.push(
          { label: '📥 Descargar Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'primary' },
          { label: '🏅 Descargar Solvencia', href: '/portal/solvencia', variant: 'secondary' },
          { label: '🧾 Historial de Documentos', href: '/portal/documentos', variant: 'secondary' }
        );
      } else {
        const equivEur = tasaBcv > 0 ? (netoAPagar / tasaBcv).toFixed(2) : null;
        const detalleInms = inmuebles
          .map(
            (i) =>
              `• **${i.codigo}** — ${i.actividad || i.tipo}: **${i.mesesDeuda || 0} mes(es)** | Deuda: **${fmtBs(i.deudaBs || 0)}**${
                Number(i.multaBs) > 0.01 ? ` *(incluye multa de ${fmtBs(i.multaBs)})*` : ''
              }`
          )
          .join('\n');

        respuesta =
          `Hola **${nombre}** (**${doc}**), soy **Global**. Aquí tienes el estado actualizado de tu deuda al día de hoy:\n\n` +
          `📊 **Resumen Financiero de tu Cuenta:**\n` +
          `• **Servicio de Aseo Urbano (Base):** ${fmtBs(totalBaseBs)}\n` +
          (totalMultaBs > 0.01 ? `• **Multas / Mora:** ${fmtBs(totalMultaBs)}\n` : '') +
          (totalIvaBs > 0.01 ? `• **IVA (16%):** ${fmtBs(totalIvaBs)}\n` : '') +
          `• **Total Facturado (${recibosPendientesCount} período/s):** **${fmtBs(deudaTotalBs)}**\n` +
          (esAgenteRetencion && totalRetencionBs > 0.01
            ? `• **Retención IVA (75% Agente Retención):** -${fmtBs(totalRetencionBs)}\n`
            : '') +
          (saldoFavorBs > 0.01
            ? `• **Saldo a Favor Disponible:** -${fmtBs(saldoFavorBs)}\n`
            : '') +
          `• **MONTO NETO A PAGAR:** **${fmtBs(netoAPagar)}**${
            equivEur ? ` *(aprox. € ${equivEur} a tasa BCV Bs. ${tasaBcv.toFixed(2)})*` : ''
          }\n\n` +
          (detalleInms ? `🏠 **Desglose por Inmueble / Local:**\n${detalleInms}\n\n` : '') +
          (pagosPorVerificar.length > 0
            ? `⏳ *Nota: Tienes ${pagosPorVerificar.length} pago(s) reportado(s) en revisión bancaria.*`
            : `Puedes descargar tu Estado de Cuenta en PDF aquí abajo o reportar tu transferencia (subiendo archivo o usando tu cámara).`);

        acciones.push(
          { label: '📥 Descargar mi Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'primary' },
          { label: '💳 Pagar Ahora', href: '/portal/pagos', variant: 'secondary' },
          { label: '📄 Ver Estado de Cuenta', href: '/portal/estado-cuenta', variant: 'secondary' }
        );
      }
    }
    // ── INTENCIÓN 5: FORMAS DE PAGO Y CUENTAS BANCARIAS ──
    else if (pideFormasPago) {
      const cuentasTxt = CUENTAS_BANCARIAS_OFICIALES.map(
        (c) =>
          `🏦 **${c.banco.toUpperCase()}** (${c.tipoCuenta})\n` +
          `• **Número de Cuenta:** \`${c.numeroCuenta}\`\n` +
          `• **Titular:** ${c.titular}\n` +
          `• **RIF:** \`${c.rif}\``
      ).join('\n\n');

      respuesta =
        `¡Con gusto, **${nombre}**! Soy **Global** y te comparto las **Formas de Pago Oficiales del IAMEC**:\n\n` +
        `### 1️⃣ Transferencia Bancaria Online (Desde el Portal o App)\n` +
        `Realiza tu transferencia desde cualquier banco a nuestras cuentas recaudadoras oficiales y repórtala en la sección **Pagar** (puedes **subir el comprobante** o **usar tu cámara** para tomarle foto):\n\n` +
        `${cuentasTxt}\n\n` +
        `---\n` +
        `### 2️⃣ Puntos de Venta Presenciales (Débito / Crédito)\n` +
        `También puedes pagar directamente con tarjeta por Punto de Venta en nuestras taquillas:\n` +
        `• 📍 **C.C. Paseo La Granja:** Taquillas IAMEC (Horario de oficina).\n` +
        `• 📍 **C.C. Río Sil:** Taquilla de Recaudación IAMEC.\n` +
        `• 🚐 **Taquilla Móvil IAMEC:** Operativos itinerantes en comunidades y comercios.`;

      acciones.push(
        { label: '💳 Reportar Pago en Línea', href: '/portal/pagos', variant: 'primary' },
        { label: '📥 Descargar Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'secondary' }
      );
    }
    // ── INTENCIÓN 6: RUTAS Y HORARIOS DE RECOLECCIÓN ──
    else if (pideRutas) {
      if (rutasSugeridas.length > 0) {
        const listaRutas = rutasSugeridas
          .map(
            (r: any) =>
              `🚛 **${r.nombre}** — Frecuencia: **${r.frecuencia}**\n` +
              `• **Sectores que cubre:** ${r.sectores}\n` +
              `• **Unidad:** ${r.vehiculo || 'Compactador'}`
          )
          .join('\n\n');

        respuesta =
          `Hola **${nombre}**, soy **Global**. Según ${
            rutasDeConsulta.length > 0 ? 'el sector que consultaste' : `tu dirección registrada (*${direccion || 'Naguanagua'}*)`
          }, estas son las **Rutas y Horarios de Recolección de Aseo Urbano**:\n\n` +
          `${listaRutas}\n\n` +
          `💡 *Tip: También puedes escribirme el nombre de cualquier urbanización o sector (por ejemplo: "¿Cuándo pasa por La Granja?" o "Ruta de Mañongo") y te diré los días exactos.*`;
      } else {
        respuesta =
          `Hola **${nombre}**, soy **Global**. El IAMEC cuenta con **${RUTAS_NAGUANAGUA.length} rutas activas** de recolección diurna y nocturna en todo el Municipio Naguanagua.\n\n` +
          `• **Avenidas Principales y Comercios:** Recolección **Diaria** (Lunes a Sábado / Domingo).\n` +
          `• **Zonas Residenciales y Urbanizaciones:** Recolección interdiaria (**Lun-Mié-Vie** o **Mar-Jue-Sáb**).\n\n` +
          `📌 Dime el nombre de tu **urbanización, comunidad o sector** (ej. *Las Quintas, Mañongo, La Granja, El Rincón, Tarapio, Guayabal*) o abre el cronograma completo abajo:`;
      }
      acciones.push({
        label: '🚛 Ver Cronograma Completo de Rutas',
        href: '/portal/rutas',
        variant: 'primary',
      });
    }
    // ── INTENCIÓN 7: INMUEBLES Y CÓDIGOS ──
    else if (pideInmuebles) {
      if (inmuebles.length === 0) {
        respuesta =
          `Hola **${nombre}**, soy **Global**. Actualmente no visualizo inmuebles activos cargados bajo el documento **${doc}**. Puedes verificar tus datos en la sección **Mis Inmuebles**.`;
      } else {
        const detalle = inmuebles
          .map(
            (i, idx) =>
              `**${idx + 1}. Código Catastral/Inmueble: \`${i.codigo}\`**\n` +
              `• **Clasificación:** ${i.tipo} | **Actividad:** ${i.actividad || 'Residencial'}\n` +
              `• **Tarifa Mensual Base:** ${fmtBs(i.mensualidadBs || 0)} (${Number(i.mmvMes || 0).toFixed(2)} UCD)\n` +
              `• **Estado:** ${Number(i.mesesDeuda) > 0 ? `${i.mesesDeuda} mes(es) pendiente(s) (${fmtBs(i.deudaBs || 0)})` : '✅ Solvente (Al día)'}\n` +
              (i.direccion ? `• **Dirección:** ${i.direccion}` : '')
          )
          .join('\n\n');

        respuesta =
          `Hola **${nombre}**, soy **Global**. Tienes **${inmuebles.length} inmueble(s) / código(s)** activo(s) asociados a tu RIF/Cédula **${doc}** (${categoria}):\n\n` +
          `${detalle}`;
      }
      acciones.push(
        { label: '🏢 Ir a Mis Inmuebles', href: '/portal/inmuebles', variant: 'primary' },
        { label: '📥 Descargar Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'secondary' }
      );
    }
    // ── INTENCIÓN 8: SALDO A FAVOR / NOTAS DE CRÉDITO ──
    else if (pideSaldoFavor) {
      if (saldoFavorBs > 0.01 || notasCredito.length > 0) {
        respuesta =
          `Hola **${nombre}**, soy **Global**. Actualmente cuentas con un **Saldo a Favor / Nota de Crédito disponible de ${fmtBs(saldoFavorBs)}**.\n\n` +
          `✅ **¿Cómo se utiliza?**\n` +
          `Al momento de reportar tu próximo pago en el portal o pagar en taquilla, el sistema descuenta automáticamente tu saldo a favor del total a cancelar.`;
      } else {
        respuesta =
          `Hola **${nombre}**, soy **Global**. Revisé tu cuenta (**${doc}**) y actualmente tienes **Bs. 0,00** en Saldo a Favor o Notas de Crédito vigentes.`;
      }
      acciones.push(
        { label: '🧾 Ver Historial de Documentos', href: '/portal/documentos', variant: 'primary' },
        { label: '📥 Descargar Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'secondary' }
      );
    }
    // ── INTENCIÓN 9: HISTORIAL DE PAGOS / FACTURACIÓN / RETENCIONES ──
    else if (pideHistorialOFactura) {
      const ultimosTxt =
        pagosRecientes.length > 0
          ? pagosRecientes
              .slice(0, 5)
              .map(
                (p) =>
                  `• **Ref: ${p.referencia}** (${p.fecha}) — **${fmtBs(p.monto)}** | Estado: **${p.estado}**${
                    p.facturaFiscal ? ` | Factura SENIAT: \`${p.facturaFiscal}\`` : ''
                  }`
              )
              .join('\n')
          : '• No se encontraron pagos reportados recientemente.';

      respuesta =
        `Hola **${nombre}**, soy **Global**. Aquí tienes el resumen de tus **últimos pagos y facturación**:\n\n` +
        `${ultimosTxt}\n\n` +
        `📌 **Recuerda:**\n` +
        `• En **Facturación** puedes descargar tus facturas electrónicas fiscales emitidas ante el SENIAT y tus recibos de caja.\n` +
        (esAgenteRetencion
          ? `• Como **Agente de Retención Especial**, puedes cargar tu comprobante del 75% de IVA (subiendo archivo o usando la cámara) en la sección **Retención**.`
          : '');

      acciones.push(
        { label: '🧾 Ir a Facturación', href: '/portal/facturacion', variant: 'primary' },
        { label: '📂 Historial de Documentos', href: '/portal/documentos', variant: 'secondary' }
      );
      if (esAgenteRetencion) {
        acciones.push({ label: '📑 Cargar Retención IVA', href: '/portal/retenciones', variant: 'secondary' });
      }
    }
    // ── INTENCIÓN 10: SOLVENCIA / TALA Y PODA / VISTO BUENO / RECLAMOS ──
    else if (pideSolvenciaOServicios) {
      respuesta =
        `Hola **${nombre}**, soy **Global**. En tu portal tienes acceso directo a todos los **trámites y servicios ambientales del IAMEC**:\n\n` +
        `• 🏅 **Certificado de Solvencia:** ${
          deudaTotalBs <= 0.01
            ? 'Tu cuenta está **Solvente**, puedes descargarlo en **Historial Certificados**.'
            : `Debes cancelar primero el saldo pendiente de **${fmtBs(netoAPagar)}** para habilitar la descarga.`
        }\n` +
        `• 🌳 **Permiso de Tala y Poda:** Solicita inspección y permiso ambiental en **Permiso Tala/Poda**.\n` +
        `• 🛡️ **Visto Bueno e Inspección Ambiental:** Tramita tu certificado para comercios e industrias.\n` +
        `• 🚛 **Servicios Extraordinarios / Especiales:** Solicita recolección de desechos vegetales, escombros o eventos.\n` +
        `• 📢 **Denuncias y Reclamos:** Reporta incidencias de recolección en tu comunidad.`;

      acciones.push(
        { label: '🏅 Certificados y Solvencia', href: '/portal/solvencia', variant: 'primary' },
        { label: '🌳 Tala y Poda', href: '/portal/tala-y-poda', variant: 'secondary' },
        { label: '📢 Denuncias y Reclamos', href: '/portal/denuncias?seccion=reclamos', variant: 'secondary' }
      );
    }
    // ── SALUDO O CONSULTA GENERAL CON RESUMEN COMPLETO DE LA CUENTA ──
    else {
      const rutaPrincipal = rutasSugeridas[0];

      respuesta =
        `¡Hola, **${nombre}**! 👋 Soy **Global**, tu **Asistente Inteligente con IA del IAMEC**.\n\n` +
        `He consultado tu cuenta (**${doc}** · **${categoria}**) en tiempo real y aquí tienes tu resumen completo:\n\n` +
        `• 💰 **Estado de Deuda:** ${
          deudaTotalBs > 0.01
            ? `Tienes **${recibosPendientesCount} período(s) pendiente(s)** por un neto a pagar de **${fmtBs(netoAPagar)}**`
            : '✅ **¡Estás totalmente Solvente (Bs. 0,00)!**'
        }\n` +
        `• ⚠️ **Multas / Mora:** ${
          totalMultaBs > 0.01 ? `**${fmtBs(totalMultaBs)}**` : '**Bs. 0,00** (Sin multas)'
        }\n` +
        `• 🏢 **Inmuebles Registrados:** **${inmuebles.length}** (${
          inmuebles.map((i) => i.codigo).slice(0, 4).join(', ') || 'Ninguno'
        })\n` +
        (saldoFavorBs > 0.01 ? `• 🎁 **Saldo a Favor:** **${fmtBs(saldoFavorBs)}**\n` : '') +
        (rutaPrincipal
          ? `• 🚛 **Ruta de Aseo estimada para tu sector:** **${rutaPrincipal.nombre}** (${rutaPrincipal.frecuencia})\n`
          : '') +
        `\n¿En qué te puedo orientar hoy? Puedo:\n` +
        `1. **Descargar tu Estado de Cuenta en PDF** directamente desde aquí\n` +
        `2. **Mostrarte tu deuda detallada, multas e inmuebles**\n` +
        `3. **Explicarte cómo reportar tu pago (subiendo archivo o usando tu cámara)**\n` +
        `4. **Indicarte las cuentas bancarias, rutas de aseo, facturas SENIAT o solvencias**`;

      acciones.push(
        { label: '📥 Descargar mi Estado de Cuenta (PDF)', href: '#descargar-estado-cuenta', variant: 'primary' },
        { label: '💳 Ir a Pagar', href: '/portal/pagos', variant: 'secondary' },
        { label: '🚛 Rutas y Horarios', href: '/portal/rutas', variant: 'secondary' }
      );
    }

    return NextResponse.json({
      ok: true,
      asistente: 'Global',
      respuesta,
      acciones,
      accionEspecial,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error en /api/contribuyente/asistente:', error);
    return NextResponse.json(
      {
        ok: false,
        asistente: 'Global',
        respuesta:
          'Disculpa, soy Global. Ocurrió un inconveniente temporal al consultar los datos. Por favor intenta nuevamente.',
        acciones: [],
      },
      { status: 500 }
    );
  }
}
