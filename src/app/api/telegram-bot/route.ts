import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getIdentidadVariants } from '@/lib/formatters';
import { getTasaBCV } from '@/services/bcv';
import { groupInmueblesByLocal, InmuebleBasic } from '@/lib/cajaHelpers';
import {
  calcularMensualidad,
  isResidencialInm,
  isTerrenoInm,
  isExoneradoTotalMultas,
  cleanClasificacionActividad
} from '@/lib/calculos';

export const dynamic = 'force-dynamic';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PORTAL_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://naguanagua.globalgreenrec.com');

const fmtBs = (n: number) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs.';
const fmtNum = (n: number) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function fmtPeriodoLabel(key: string): string {
  if (!key || !key.includes('-')) return key;
  const [y, m] = key.split('-');
  const idx = parseInt(m, 10) - 1;
  return idx >= 0 && idx < 12 ? `${MESES_NOMBRES[idx]} ${y}` : key;
}

/**
 * Calcula de qué mes a qué mes corresponde la multa de un inmueble
 */
function calcularRangoMulta(inm: any, multasManuales: any[] = []): string {
  // 1. Si tiene multas registradas en condominio_multas con periodo
  const perManuales = multasManuales
    .filter(m => m.periodo)
    .map(m => fmtPeriodoLabel(m.periodo));
  if (perManuales.length > 0) {
    const unicos = [...new Set(perManuales)];
    if (unicos.length === 1) return unicos[0];
    return `${unicos[0]} a ${unicos[unicos.length - 1]}`;
  }

  // 2. Si tiene nota con asignación explícita de multa
  const nota = String(inm?.notas || '');
  const matchAsig = nota.match(/ASIGNACIÓN DE MULTA: Período ([^()]+)/i);
  if (matchAsig && matchAsig[1]) {
    return matchAsig[1].trim();
  }
  const matchDirecto = nota.match(/\[MULTA:(\d{4}-\d{2})/i);
  if (matchDirecto && matchDirecto[1]) {
    return fmtPeriodoLabel(matchDirecto[1]);
  }

  // 3. Basado en meses de deuda (la multa va desde el mes más antiguo hasta el penúltimo mes)
  const meses = parseInt(String(inm?.meses_deuda || 0), 10) || 0;
  if (meses > 1) {
    const now = new Date();
    // Mes más antiguo con mora
    const fInicio = new Date(now.getFullYear(), now.getMonth() - meses, 1);
    // Penúltimo mes (último mes con mora)
    const fFin = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const mInicio = `${MESES_NOMBRES[fInicio.getMonth()]} ${fInicio.getFullYear()}`;
    const mFin = `${MESES_NOMBRES[fFin.getMonth()]} ${fFin.getFullYear()}`;

    if (mInicio === mFin) {
      return `${mInicio} (1 mes de multa)`;
    }
    return `${mInicio} a ${mFin} (${meses - 1} meses de multa)`;
  }

  if (parseFloat(String(inm?.multa_bs || 0)) > 0) {
    return 'Multa administrativa registrada';
  }

  return 'Sin multas';
}

async function enviarTelegram(chatId: number | string, text: string, replyMarkup?: any) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[Telegram Bot] TELEGRAM_BOT_TOKEN no configurado.');
    return false;
  }
  try {
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    return d.ok === true;
  } catch (e) {
    console.error('[Telegram Bot] Error enviando mensaje:', e);
    return false;
  }
}

/**
 * GET: Información de estado del bot y ayuda para configurar el Webhook en Telegram
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const webhookUrl = `${url.origin}/api/telegram-bot`;
  const setWebhookTelegram = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN || '<TU_TOKEN>'}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

  return NextResponse.json({
    status: 'online',
    servicio: 'Bot de Consulta de Estado de Cuenta — IAMEC Naguanagua',
    tokenConfigurado: Boolean(TELEGRAM_BOT_TOKEN),
    webhookEsperado: webhookUrl,
    instruccionesParaActivar: TELEGRAM_BOT_TOKEN
      ? `Para activar el webhook, abre en tu navegador: ${setWebhookTelegram}`
      : 'Configura la variable TELEGRAM_BOT_TOKEN en las variables de entorno de Vercel.',
    setWebhookUrl: setWebhookTelegram
  });
}

/**
 * POST: Webhook que recibe los mensajes de Telegram para Contribuyentes
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = body.message || body.edited_message;
    if (!message || !message.chat || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const rawText = String(message.text || '').trim();

    // 1. Mensaje de bienvenida / ayuda
    if (
      rawText.startsWith('/start') ||
      rawText.startsWith('/help') ||
      rawText.toLowerCase() === 'hola' ||
      rawText.toLowerCase() === 'ayuda'
    ) {
      const bienvenida =
        `🏛️ <b>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) ♻️</b>\n` +
        `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n\n` +
        `👋 ¡Hola! Te damos la bienvenida al asistente virtual de consulta y pago de IAMEC.\n\n` +
        `🔍 <b>¿Cómo consultar tu estado de cuenta?</b>\n` +
        `Envía tu número de Cédula o RIF por este chat (ejemplos):\n` +
        `• <code>V-12345678</code>\n` +
        `• <code>J-302327172</code>\n` +
        `• <code>302327172</code>\n\n` +
        `El sistema te mostrará tu desglose detallado agrupado por local y el enlace directo para pagar en línea.\n\n` +
        `🏢 <b>¿Eres un Condominio o Centro Comercial?</b>\n` +
        `Las cuentas de Condominios se gestionan exclusivamente en nuestro bot especializado:\n` +
        `👉 <b>@Aseonaguanaguac2bot</b>\n\n` +
        `Naguanagua Te Quiero 💙🧡\n` +
        `Elizabeth Niño Alcaldesa\n` +
        `Rafael Lacava Gobernador\n\n` +
        `¡Construyendo un Municipio más limpio, eficiente y sustentable!`;

      await enviarTelegram(chatId, bienvenida, {
        inline_keyboard: [
          [{ text: '🌐 Ingresar al Portal Web', url: `${PORTAL_BASE_URL}/portal` }],
          [{ text: '🏢 Ir al Bot de Condominios (@Aseonaguanaguac2bot)', url: 'https://t.me/Aseonaguanaguac2bot' }]
        ]
      });
      return NextResponse.json({ ok: true });
    }

    // 2. Procesar documento (Cédula o RIF)
    const variantes = getIdentidadVariants(rawText);
    const orFilter = variantes.map(v => `identidad.eq.${v}`).join(',');

    // ── VERIFICAR SI ESTE RIF PERTENECE A UN CONDOMINIO ──
    const { data: condoMatches } = await supabase
      .from('condominios')
      .select('id, codigo, nombre, identidad')
      .or(variantes.map(v => `identidad.eq.${v}`).join(','))
      .limit(1);

    if (condoMatches && condoMatches.length > 0) {
      const condo = condoMatches[0];
      const msgCondoRedir =
        `🏛️ <b>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) ♻️</b>\n` +
        `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n\n` +
        `🏢 <b>ATENCIÓN: CUENTA DE CONDOMINIO O CENTRO COMERCIAL</b>\n\n` +
        `El RIF <code>${rawText}</code> corresponde al Condominio:\n` +
        `<b>${condo.nombre}</b> (${condo.codigo})\n\n` +
        `Las cuentas, facturación consolidada y aseo de condominios se consultan exclusivamente a través de nuestro <b>Bot Especializado de Condominios</b>:\n\n` +
        `👉 <b>@Aseonaguanaguac2bot</b>\n\n` +
        `Por favor ingresa al bot de condominios para consultar tu estado de cuenta y registrar pagos.\n\n` +
        `Naguanagua Te Quiero 💙🧡\n` +
        `Elizabeth Niño Alcaldesa\n` +
        `Rafael Lacava Gobernador\n\n` +
        `¡Construyendo un Municipio más limpio, eficiente y sustentable!`;

      await enviarTelegram(chatId, msgCondoRedir, {
        inline_keyboard: [
          [{ text: '🏢 Ir al Bot de Condominios (@Aseonaguanaguac2bot)', url: 'https://t.me/Aseonaguanaguac2bot' }],
          [{ text: '🌐 Abrir Portal Web', url: `${PORTAL_BASE_URL}/portal` }]
        ]
      });
      return NextResponse.json({ ok: true });
    }

    // Obtener tasa BCV / TCMMV vigente
    let tasaBcv = 1;
    try {
      const bcvRes = await getTasaBCV();
      tasaBcv = bcvRes?.euro || bcvRes?.tcmmv || bcvRes?.usd || 1;
    } catch (_) {}

    // Consultar inmuebles activos
    const { data: inmsDB, error: errInm } = await supabase
      .from('inmuebles')
      .select('*')
      .or(orFilter)
      .not('estado', 'ilike', 'eliminado%')
      .not('estado', 'ilike', 'inactivo%')
      .not('estado', 'ilike', 'desactivado%')
      .order('inmueble', { ascending: true });

    // Consultar contribuyente
    const { data: contsDB } = await supabase
      .from('contribuyentes')
      .select('nombre, identidad, email, telefono')
      .or(orFilter)
      .limit(1);

    const contribRec = contsDB && contsDB.length > 0 ? contsDB[0] : null;

    if (errInm || (!inmsDB || inmsDB.length === 0)) {
      if (contribRec) {
        // Registrado pero sin inmuebles con deuda
        const msgSinDeuda =
          `🏛️ <b>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) ♻️</b>\n` +
          `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n\n` +
          `👤 <b>Contribuyente:</b> ${contribRec.nombre}\n` +
          `📄 <b>Identidad:</b> ${contribRec.identidad}\n\n` +
          `✅ <b>Estado:</b> Solvente o sin inmuebles activos registrados.\n\n` +
          `Para registrar inmuebles o consultar pagos históricos, ingresa en el portal:`;

        await enviarTelegram(chatId, msgSinDeuda, {
          inline_keyboard: [
            [{ text: '💳 Ir a Soy Contribuyente', url: `${PORTAL_BASE_URL}/portal` }]
          ]
        });
        return NextResponse.json({ ok: true });
      }

      // No encontrado
      const msgNoEncontrado =
        `🏛️ <b>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) ♻️</b>\n` +
        `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n\n` +
        `🔍 No encontramos registros activos asociados a: <code>${rawText}</code>\n\n` +
        `Por favor verifique que la Cédula o RIF esté escrito correctamente.\n` +
        `Si aún no se ha registrado, puede hacerlo a través de nuestro portal web:\n\n` +
        `Naguanagua Te Quiero 💙🧡\n` +
        `Elizabeth Niño Alcaldesa\n` +
        `Rafael Lacava Gobernador\n\n` +
        `¡Construyendo un Municipio más limpio, eficiente y sustentable!`;

      await enviarTelegram(chatId, msgNoEncontrado, {
        inline_keyboard: [
          [{ text: '📝 Registrarme en el Portal', url: `${PORTAL_BASE_URL}/portal` }]
        ]
      });
      return NextResponse.json({ ok: true });
    }

    const nombreContrib =
      contribRec?.nombre ||
      inmsDB.find(i => i.contribuyente)?.contribuyente ||
      'Contribuyente';
    const identidadFmt =
      contribRec?.identidad ||
      inmsDB[0]?.identidad ||
      rawText.toUpperCase();

    // ── CONSULTAR SI TIENE UNIDADES REGISTRADAS EN CONDOMINIOS ──
    const codigosInm = inmsDB.map(i => i.inmueble);
    const { data: condoUnidadesDB } = await supabase
      .from('condominio_unidades')
      .select('id, inmueble, condominio_id, aseo_pendiente_desde, multa_meses, condominios(id, codigo, nombre)')
      .in('inmueble', codigosInm)
      .neq('estado', 'Eliminada');

    const condoUnidadesMap = new Map<string, any>();
    (condoUnidadesDB || []).forEach((u: any) => {
      condoUnidadesMap.set(u.inmueble, u);
    });

    // Consultar multas manuales de condominio pendientes para este contribuyente
    const { data: multasManualesDB } = await supabase
      .from('condominio_multas')
      .select('id, unidad_id, concepto, monto_bs, periodo, estado, identidad')
      .in('identidad', variantes)
      .eq('estado', 'Pendiente');

    // 3. Agrupar por Local Físico
    const clusters = groupInmueblesByLocal(inmsDB as InmuebleBasic[]);

    let granTotalBs = 0;
    let tieneDeudaGlobal = false;
    let cantLocalesCondominioSolventes = 0;
    let hayLocalesCondominio = false;
    const localesTextParts: string[] = [];

    let localIndex = 1;

    clusters.forEach((cluster) => {
      const isRes = cluster.tipo === 'RESIDENCIAL';
      const esExon = cluster.inms.some(i => isExoneradoTotalMultas(i));

      // Determinar si este cluster pertenece a un condominio
      const perteneceACondo =
        cluster.esCondominio ||
        cluster.inms.some((i: any) =>
          Boolean(i.condominio_padre_id || condoUnidadesMap.has(i.inmueble) || (i.padre_id && i.padre_id.startsWith('CONDO-')))
        );

      if (perteneceACondo) {
        hayLocalesCondominio = true;

        // ── LOCAL DENTRO DE CONDOMINIO: SOLO SE MUESTRAN SUS MULTAS ──
        let totalMultasCondoLocal = 0;
        const lineasMultas: string[] = [];

        cluster.inms.forEach(inm => {
          const mInm = parseFloat(String(inm.multa_bs || '0')) || 0;
          const uInfo = inm.inmueble ? condoUnidadesMap.get(inm.inmueble) : null;
          const multasDeEstaUnidad = (multasManualesDB || []).filter(
            m => (uInfo && m.unidad_id === uInfo.id) || m.identidad === inm.identidad
          );
          const multasManBs = multasDeEstaUnidad.reduce((acc, m) => acc + (parseFloat(m.monto_bs) || 0), 0);

          const totalM = Math.round((mInm + multasManBs) * 100) / 100;
          if (totalM > 0) {
            totalMultasCondoLocal += totalM;
            const rangoMulta = calcularRangoMulta(inm, multasDeEstaUnidad);
            lineasMultas.push(`• <b>Multa por mora:</b> ${fmtBs(totalM)}`);
            lineasMultas.push(`• <b>Período con multa:</b> ${rangoMulta}`);
          }
        });

        // Nombre del condominio si está disponible
        const primerInm = cluster.inms[0];
        const uInfo = primerInm?.inmueble ? condoUnidadesMap.get(primerInm.inmueble) : null;
        const nombreCondo = uInfo?.condominios?.nombre || primerInm?.condominio_padre_id || 'Condominio';

        if (totalMultasCondoLocal > 0) {
          // TIENE MULTAS: Mostrar local con solo sus multas y el rango de mes
          granTotalBs += totalMultasCondoLocal;
          tieneDeudaGlobal = true;

          const localCard =
            `📍 <b>LOCAL ${localIndex}: ${cluster.label || cluster.localId}</b> (En Condominio)\n` +
            `• <b>Condominio:</b> ${nombreCondo}\n` +
            lineasMultas.join('\n') + '\n' +
            `• <i>Aseo ordinario: Gestionado por la administración del condominio</i>\n` +
            `👉 <b>Multa a pagar Local ${localIndex}: ${fmtBs(totalMultasCondoLocal)}</b>`;

          localesTextParts.push(localCard);
          localIndex++;
        } else {
          // NO TIENE MULTAS: Se cuenta como solvente en condominio
          cantLocalesCondominioSolventes++;
        }

        return; // Fin del tratamiento para locales dentro de condominio
      }

      // ── LOCAL FUERA DE CONDOMINIO: DESGLOSE NORMAL COMPLETO ──
      let baseMensualBs = 0;
      let totalMultasBs = 0;
      let totalCongeladaBs = 0;
      let totalSaldoFavorBs = 0;
      let maxMeses = 0;

      cluster.inms.forEach(inm => {
        if (isTerrenoInm(inm)) return;
        const b = calcularMensualidad(inm, tasaBcv);
        baseMensualBs += b;
        totalMultasBs += parseFloat(String(inm.multa_bs || '0')) || 0;
        totalCongeladaBs += parseFloat(String(inm.deuda_congelada_bs || '0')) || 0;
        totalSaldoFavorBs += parseFloat(String(inm.saldo_favor_bs || '0')) || 0;
        const m = parseInt(String(inm.meses_deuda || 0), 10) || 0;
        if (m > maxMeses) maxMeses = m;
      });

      const mesesConMora = esExon ? 0 : Math.max(0, maxMeses - 1);
      const tasaMora = isRes ? 0.10 : 0.12;
      const baseDeuda = baseMensualBs * maxMeses;
      const ivaDeuda = isRes ? 0 : baseDeuda * 0.16;
      const moraDeuda = baseMensualBs * tasaMora * mesesConMora;

      let totalLocalBs = Math.max(
        0,
        baseDeuda + ivaDeuda + moraDeuda + totalMultasBs + totalCongeladaBs - totalSaldoFavorBs
      );
      totalLocalBs = Math.round(totalLocalBs * 100) / 100;

      granTotalBs += totalLocalBs;
      if (totalLocalBs > 0 || maxMeses > 0) tieneDeudaGlobal = true;

      const detalleCobro =
        `• <b>Tipo:</b> ${isRes ? '🏡 Residencial' : '🏢 Comercial'}\n` +
        `• <b>Meses pendientes:</b> ${maxMeses} ${maxMeses === 1 ? 'mes' : 'meses'}\n` +
        `• <b>Tarifa mensual:</b> ${fmtBs(baseMensualBs + (isRes ? 0 : baseMensualBs * 0.16))}\n` +
        (moraDeuda > 0 ? `• <b>Recargo por mora:</b> ${fmtBs(moraDeuda)}\n` : '') +
        (totalMultasBs > 0 ? `• <b>Multas:</b> ${fmtBs(totalMultasBs)}\n` : '') +
        (totalSaldoFavorBs > 0 ? `• <b>Saldo a favor:</b> -${fmtBs(totalSaldoFavorBs)}\n` : '');

      const acts = cluster.inms
        .map(i => cleanClasificacionActividad(i.actividad_principal))
        .filter(Boolean)
        .slice(0, 3);
      const actStr = acts.length > 0 ? acts.join(', ') : (cluster.label || 'Inmueble');

      const localCard =
        `📍 <b>LOCAL ${localIndex}: ${cluster.label || cluster.localId}</b>\n` +
        `• <b>Código:</b> <code>${cluster.localId}</code>\n` +
        `• <b>Actividad / Uso:</b> ${actStr}\n` +
        `${detalleCobro}` +
        `👉 <b>Total Local ${localIndex}: ${fmtBs(totalLocalBs)}</b>`;

      localesTextParts.push(localCard);
      localIndex++;
    });

    // 4. Armar el mensaje final
    const header =
      `🏛️ <b>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) ♻️</b>\n` +
      `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n\n` +
      `👤 <b>Contribuyente:</b> ${nombreContrib}\n` +
      `📄 <b>RIF/Cédula:</b> <code>${identidadFmt}</code>\n` +
      `💵 <b>Tasa Oficial BCV:</b> ${fmtNum(tasaBcv)} Bs./TCMMV\n` +
      `🏢 <b>Locales con cuenta:</b> ${localesTextParts.length}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    let bodyMsg = localesTextParts.join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (localesTextParts.length === 0 && cantLocalesCondominioSolventes > 0) {
      bodyMsg =
        `🏢 <b>LOCALES EN CONDOMINIO</b>\n` +
        `Usted posee ${cantLocalesCondominioSolventes} local(es) ubicados dentro de Condominio.\n` +
        `✅ <b>Estado:</b> Solvente / Sin multas individuales pendientes.\n` +
        `El servicio de aseo ordinario es gestionado y cancelado a través de la administración del condominio en <b>@Aseonaguanaguac2bot</b>.`;
    } else if (cantLocalesCondominioSolventes > 0) {
      bodyMsg +=
        `\n\nℹ️ <i>Nota adicional: Posee ${cantLocalesCondominioSolventes} local(es) en condominio solventes sin multas individuales (su aseo es administrado en @Aseonaguanaguac2bot).</i>`;
    }

    const footer =
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (tieneDeudaGlobal
        ? `💳 <b>TOTAL GENERAL A PAGAR:</b> <b>${fmtBs(granTotalBs)}</b>\n\n` +
          `<i>Para cancelar en línea de forma segura mediante Transferencia Bancaria, ingresa al portal con el botón a continuación:</i>`
        : `✅ <b>ESTADO:</b> <b>SOLVENTE</b>\n<i>No posee deudas pendientes a la fecha.</i>`) +
      `\n\nNaguanagua Te Quiero 💙🧡\n` +
      `Elizabeth Niño Alcaldesa\n` +
      `Rafael Lacava Gobernador\n\n` +
      `¡Construyendo un Municipio más limpio, eficiente y sustentable!`;

    const portalLink = `${PORTAL_BASE_URL}/portal`;

    const inlineButtons: any[][] = [
      [{ text: '💳 Pagar en Línea (Soy Contribuyente)', url: portalLink }]
    ];

    if (hayLocalesCondominio) {
      inlineButtons.push([
        { text: '🏢 Ir al Bot de Condominios (@Aseonaguanaguac2bot)', url: 'https://t.me/Aseonaguanaguac2bot' }
      ]);
    }

    inlineButtons.push([
      { text: '🌐 Abrir Portal Web de Pagos', url: portalLink }
    ]);

    await enviarTelegram(chatId, `${header}${bodyMsg}${footer}`, {
      inline_keyboard: inlineButtons
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram Bot] Error en webhook:', err);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
