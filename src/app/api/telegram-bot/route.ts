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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PORTAL_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://aseonaguanagua.globalrecca.com');

const fmtBs = (n: number) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs.';
const fmtNum = (n: number) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    servicio: 'Bot de Consulta de Estado de Cuenta — Alcaldía de Naguanagua',
    tokenConfigurado: Boolean(TELEGRAM_BOT_TOKEN),
    webhookEsperado: webhookUrl,
    instruccionesParaActivar: TELEGRAM_BOT_TOKEN
      ? `Para activar el webhook, abre en tu navegador: ${setWebhookTelegram}`
      : 'Configura la variable TELEGRAM_BOT_TOKEN en las variables de entorno de Vercel.',
    setWebhookUrl: setWebhookTelegram
  });
}

/**
 * POST: Webhook que recibe los mensajes de Telegram
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
    if (rawText.startsWith('/start') || rawText.startsWith('/help') || rawText.toLowerCase() === 'hola' || rawText.toLowerCase() === 'ayuda') {
      const bienvenida =
        `🏛️ <b>ALCALDÍA BOLIVARIANA DE NAGUANAGUA</b>\n` +
        `<b>Dirección de Hacienda / Servicio de Aseo Urbano</b>\n\n` +
        `👋 ¡Hola! Bienvenido al asistente virtual de consulta de contribuyentes.\n\n` +
        `🔍 <b>¿Cómo consultar tu estado de cuenta?</b>\n` +
        `Envía tu número de <b>Cédula o RIF</b> por este chat (ejemplos):\n` +
        `• <code>V-12345678</code>\n` +
        `• <code>J-302327172</code>\n` +
        `• <code>302327172</code>\n\n` +
        `El sistema te mostrará tu desglose detallado <b>agrupado por local</b> y el enlace directo para pagar en línea.`;

      await enviarTelegram(chatId, bienvenida, {
        inline_keyboard: [
          [{ text: '🌐 Ingresar al Portal Web', url: `${PORTAL_BASE_URL}/portal` }]
        ]
      });
      return NextResponse.json({ ok: true });
    }

    // 2. Procesar documento (Cédula o RIF)
    const variantes = getIdentidadVariants(rawText);
    const orFilter = variantes.map(v => `identidad.eq.${v}`).join(',');

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
          `🏛️ <b>ALCALDÍA DE NAGUANAGUA</b>\n\n` +
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
        `🔍 No encontramos registros activos asociados a: <code>${rawText}</code>\n\n` +
        `Por favor verifique que la Cédula o RIF esté escrito correctamente.\n` +
        `Si aún no se ha registrado, puede hacerlo a través de nuestro portal web:`;

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

    // 3. Agrupar por Local Físico usando la lógica de Caja
    const clusters = groupInmueblesByLocal(inmsDB as InmuebleBasic[]);

    let granTotalBs = 0;
    let tieneDeudaGlobal = false;
    const localesTextParts: string[] = [];

    clusters.forEach((cluster, idx) => {
      const isRes = cluster.tipo === 'RESIDENCIAL';
      const esExon = cluster.inms.some(i => isExoneradoTotalMultas(i));
      const esCondo = cluster.esCondominio || cluster.inms.some((i: any) => i.condominio_padre_id);

      // Calcular base mensual del local (suma de actividades)
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

      // Cálculo canónico
      let totalLocalBs = 0;
      let detalleCobro = '';

      if (esCondo && !cluster.inms.some(i => (i.actividad_principal || '').toUpperCase() === 'N/A')) {
        // En condominios comerciales comunes solo pagan multas/congelada individual
        totalLocalBs = totalMultasBs + totalCongeladaBs - totalSaldoFavorBs;
        detalleCobro = `• <b>Régimen:</b> Condominio (Aseo centralizado en administración)\n• <b>Multas individuales:</b> ${fmtBs(totalMultasBs + totalCongeladaBs)}`;
      } else {
        const mesesConMora = esExon ? 0 : Math.max(0, maxMeses - 1);
        const tasaMora = isRes ? 0.10 : 0.12;
        const baseDeuda = baseMensualBs * maxMeses;
        const ivaDeuda = isRes ? 0 : baseDeuda * 0.16;
        const moraDeuda = baseMensualBs * tasaMora * mesesConMora;

        totalLocalBs = Math.max(
          0,
          baseDeuda + ivaDeuda + moraDeuda + totalMultasBs + totalCongeladaBs - totalSaldoFavorBs
        );

        detalleCobro =
          `• <b>Tipo:</b> ${isRes ? '🏡 Residencial' : '🏢 Comercial'}\n` +
          `• <b>Meses pendientes:</b> ${maxMeses} ${maxMeses === 1 ? 'mes' : 'meses'}\n` +
          `• <b>Tarifa mensual:</b> ${fmtBs(baseMensualBs + (isRes ? 0 : baseMensualBs * 0.16))}\n` +
          (moraDeuda > 0 ? `• <b>Recargo por mora:</b> ${fmtBs(moraDeuda)}\n` : '') +
          (totalMultasBs > 0 ? `• <b>Multas:</b> ${fmtBs(totalMultasBs)}\n` : '') +
          (totalSaldoFavorBs > 0 ? `• <b>Saldo a favor:</b> -${fmtBs(totalSaldoFavorBs)}\n` : '');
      }

      totalLocalBs = Math.round(totalLocalBs * 100) / 100;
      granTotalBs += totalLocalBs;
      if (totalLocalBs > 0 || maxMeses > 0) tieneDeudaGlobal = true;

      // Actividades listadas
      const acts = cluster.inms
        .map(i => cleanClasificacionActividad(i.actividad_principal))
        .filter(Boolean)
        .slice(0, 3);
      const actStr = acts.length > 0 ? acts.join(', ') : (cluster.label || 'Inmueble');

      const localCard =
        `📍 <b>LOCAL ${idx + 1}: ${cluster.label || cluster.localId}</b>\n` +
        `• <b>Código:</b> <code>${cluster.localId}</code>\n` +
        `• <b>Actividad / Uso:</b> ${actStr}\n` +
        `${detalleCobro}` +
        `👉 <b>Total Local ${idx + 1}: ${fmtBs(totalLocalBs)}</b>`;

      localesTextParts.push(localCard);
    });

    // 4. Armar el mensaje final
    const header =
      `🏛️ <b>ALCALDÍA BOLIVARIANA DE NAGUANAGUA</b>\n` +
      `<b>Estado de Cuenta — Aseo Urbano</b>\n\n` +
      `👤 <b>Contribuyente:</b> ${nombreContrib}\n` +
      `📄 <b>RIF/Cédula:</b> <code>${identidadFmt}</code>\n` +
      `💵 <b>Tasa Oficial BCV:</b> ${fmtNum(tasaBcv)} Bs./TCMMV\n` +
      `🏢 <b>Locales / Inmuebles activos:</b> ${clusters.length}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    const bodyMsg = localesTextParts.join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const footer =
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (tieneDeudaGlobal
        ? `💳 <b>TOTAL GENERAL A PAGAR:</b> <b>${fmtBs(granTotalBs)}</b>\n\n` +
          `<i>Para cancelar en línea de forma segura con Pago Móvil o Transferencia, ingresa al portal con el botón a continuación:</i>`
        : `✅ <b>ESTADO:</b> <b>SOLVENTE</b>\n<i>No posee deudas pendientes a la fecha.</i>`);

    const portalLink = `${PORTAL_BASE_URL}/portal`;

    await enviarTelegram(chatId, `${header}${bodyMsg}${footer}`, {
      inline_keyboard: [
        [
          {
            text: '💳 Pagar en Línea (Soy Contribuyente)',
            url: portalLink
          }
        ],
        [
          {
            text: '🌐 Abrir Portal Web de Pagos',
            url: portalLink
          }
        ]
      ]
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram Bot] Error en webhook:', err);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
