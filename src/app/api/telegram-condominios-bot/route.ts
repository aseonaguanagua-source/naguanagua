import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getIdentidadVariants } from '@/lib/formatters';
import { getTasaBCV } from '@/services/bcv';
import { cargarCondominio, calcularEstado, tasaVigente } from '@/lib/condominios/servicio';
import { mesesPendientes, periodosPendientes } from '@/lib/condominios/motor';

export const dynamic = 'force-dynamic';

const TELEGRAM_CONDOMINIOS_BOT_TOKEN =
  process.env.TELEGRAM_CONDOMINIOS_BOT_TOKEN || '8931636041:AAFy-jMe3V7rGxj4z5TmMADJjVVCDrw1DRo';

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
 * Genera el enlace directo a Telegram para cancelar el condominio.
 * Admite: URL completa (https://t.me/...), usuario (@usuario) o número telefónico (+58...).
 */
function getTelegramContactUrl(contact?: string): string {
  const fallback = 'https://t.me/AseoUrbanoCondominios';
  if (!contact) return fallback;
  const trimmed = contact.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`;
  const clean = trimmed.replace(/[^\d+]/g, '');
  if (!clean) return fallback;
  return `https://t.me/${clean.startsWith('+') ? clean : `+${clean}`}`;
}

async function enviarTelegram(chatId: number | string, text: string, replyMarkup?: any) {
  if (!TELEGRAM_CONDOMINIOS_BOT_TOKEN) {
    console.warn('[Telegram Condo Bot] TELEGRAM_CONDOMINIOS_BOT_TOKEN no configurado.');
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
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_CONDOMINIOS_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    return d.ok === true;
  } catch (e) {
    console.error('[Telegram Condo Bot] Error enviando mensaje:', e);
    return false;
  }
}

/**
 * GET: Información de estado del bot y configuración de webhook
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const webhookUrl = `${url.origin}/api/telegram-condominios-bot`;
  const setWebhookTelegram = `https://api.telegram.org/bot${TELEGRAM_CONDOMINIOS_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

  return NextResponse.json({
    status: 'online',
    servicio: 'Bot de Gestión de Condominios y Centros Comerciales — IAMEC Naguanagua',
    username: '@Aseonaguanaguac2bot',
    tokenConfigurado: Boolean(TELEGRAM_CONDOMINIOS_BOT_TOKEN),
    webhookEsperado: webhookUrl,
    setWebhookUrl: setWebhookTelegram
  });
}

/**
 * POST: Webhook que recibe los mensajes de Telegram para Condominios
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
        `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n` +
        `🏢 <b>Asistente Virtual de Condominios y Centros Comerciales</b>\n\n` +
        `👋 ¡Hola! Te damos la bienvenida al asistente virtual exclusivo para <b>Condominios y Centros Comerciales</b> de IAMEC.\n\n` +
        `🔍 <b>¿Cómo consultar el estado de cuenta de tu Condominio?</b>\n` +
        `Envía el número de <b>RIF del Condominio</b> o su código asignado (ejemplos):\n` +
        `• <code>J-123456789</code>\n` +
        `• <code>J-302327172</code>\n` +
        `• <code>CONDO-URB014903</code>\n\n` +
        `El sistema te mostrará el estado de cuenta consolidado, número de unidades, meses pendientes, desglose y enlace para pagar en línea.\n\n` +
        `👤 <b>¿Eres un Contribuyente Individual o Comercio fuera de condominio?</b>\n` +
        `Las cuentas de locales y viviendas individuales se consultan en nuestro Asistente de Contribuyentes:\n` +
        `👉 <b>@Aseonaguanaguabot</b>\n\n` +
        `Naguanagua Te Quiero 💙🧡\n` +
        `Elizabeth Niño Alcaldesa\n` +
        `Rafael Lacava Gobernador\n\n` +
        `¡Construyendo un Municipio más limpio, eficiente y sustentable!`;

      await enviarTelegram(chatId, bienvenida, {
        inline_keyboard: [
          [{ text: '🏢 Portal de Condominios', url: `${PORTAL_BASE_URL}/admin/condominios/caja` }],
          [{ text: '👤 Ir a Bot Contribuyentes (@Aseonaguanaguabot)', url: 'https://t.me/Aseonaguanaguabot' }]
        ]
      });
      return NextResponse.json({ ok: true });
    }

    // 2. Procesar búsqueda de Condominio (por RIF o Código)
    const variantes = getIdentidadVariants(rawText);
    const textUpper = rawText.toUpperCase();

    // Buscar en condominios por identidad o código
    let condoMatch: any = null;

    const { data: byIdent } = await supabase
      .from('condominios')
      .select('*')
      .or(variantes.map(v => `identidad.eq.${v}`).join(','))
      .limit(1);

    if (byIdent && byIdent.length > 0) {
      condoMatch = byIdent[0];
    }

    if (!condoMatch) {
      const { data: byCodigo } = await supabase
        .from('condominios')
        .select('*')
        .ilike('codigo', textUpper)
        .limit(1);
      if (byCodigo && byCodigo.length > 0) {
        condoMatch = byCodigo[0];
      }
    }

    if (!condoMatch) {
      // Intentar buscar por unidad de condominio
      const { data: byUnidad } = await supabase
        .from('condominio_unidades')
        .select('condominio_id')
        .ilike('inmueble', textUpper)
        .limit(1)
        .maybeSingle();

      if (byUnidad?.condominio_id) {
        const { data: cData } = await supabase
          .from('condominios')
          .select('*')
          .eq('id', byUnidad.condominio_id)
          .maybeSingle();
        if (cData) condoMatch = cData;
      }
    }

    // SI NO SE ENCONTRÓ EN CONDOMINIOS
    if (!condoMatch) {
      // Verificar si es un contribuyente individual registrado en el sistema
      const { data: contribCheck } = await supabase
        .from('contribuyentes')
        .select('nombre, identidad')
        .or(variantes.map(v => `identidad.eq.${v}`).join(','))
        .limit(1);

      const { data: inmCheck } = await supabase
        .from('inmuebles')
        .select('inmueble, identidad, contribuyente')
        .or(variantes.map(v => `identidad.eq.${v}`).join(','))
        .not('estado', 'ilike', 'eliminado%')
        .limit(1);

      if ((contribCheck && contribCheck.length > 0) || (inmCheck && inmCheck.length > 0)) {
        // Es un contribuyente individual
        const msgRedir =
          `🏛️ <b>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) ♻️</b>\n` +
          `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n\n` +
          `👤 <b>ATENCIÓN: CONTRIBUYENTE INDIVIDUAL</b>\n\n` +
          `El documento <code>${rawText}</code> corresponde a un <b>Contribuyente Individual</b> y no a una administración de Condominio.\n\n` +
          `Para consultar tu estado de cuenta individual, residencial o comercial (fuera de condominio), por favor dirígete a nuestro Asistente de Contribuyentes:\n\n` +
          `👉 <b>@Aseonaguanaguabot</b>\n\n` +
          `Naguanagua Te Quiero 💙🧡\n` +
          `Elizabeth Niño Alcaldesa\n` +
          `Rafael Lacava Gobernador\n\n` +
          `¡Construyendo un Municipio más limpio, eficiente y sustentable!`;

        await enviarTelegram(chatId, msgRedir, {
          inline_keyboard: [
            [{ text: '👤 Ir al Bot de Contribuyentes (@Aseonaguanaguabot)', url: 'https://t.me/Aseonaguanaguabot' }],
            [{ text: '🌐 Abrir Portal Web', url: `${PORTAL_BASE_URL}/portal` }]
          ]
        });
        return NextResponse.json({ ok: true });
      }

      // No encontrado
      const msgNoEncontrado =
        `🏛️ <b>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) ♻️</b>\n` +
        `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n\n` +
        `🔍 No encontramos ningún Condominio o Centro Comercial registrado con el RIF o código: <code>${rawText}</code>\n\n` +
        `Por favor verifica que el RIF del Condominio esté escrito correctamente (ejemplo: <code>J-123456789</code>).\n\n` +
        `Si tu condominio aún no está registrado, comunícate con IAMEC o ingresa a nuestro portal:\n\n` +
        `Naguanagua Te Quiero 💙🧡\n` +
        `Elizabeth Niño Alcaldesa\n` +
        `Rafael Lacava Gobernador\n\n` +
        `¡Construyendo un Municipio más limpio, eficiente y sustentable!`;

      await enviarTelegram(chatId, msgNoEncontrado, {
        inline_keyboard: [
          [{ text: '🏢 Ir a Condominios en Línea', url: `${PORTAL_BASE_URL}/admin/condominios/caja` }]
        ]
      });
      return NextResponse.json({ ok: true });
    }

    // 3. Condominio encontrado: Cargar datos completos y calcular estado
    const cData = await cargarCondominio(condoMatch.codigo);
    if (!cData) {
      throw new Error('No se pudieron cargar los datos del condominio.');
    }

    let tasaBcv = 1;
    try {
      tasaBcv = (await tasaVigente()) || (await getTasaBCV())?.euro || 1;
    } catch (_) {}

    const estadoCalc = calcularEstado(cData.condo, cData.unidades, tasaBcv, new Date(), cData.multas);
    const { totales, porActividad } = estadoCalc;

    // Determinar rango de meses pendientes
    const mesesMax = totales.mesesMax;
    let periodoTexto = 'Solvente / Al día';
    if (mesesMax > 0 && cData.condo.aseo_pendiente_desde) {
      try {
        const pers = periodosPendientes(cData.condo.aseo_pendiente_desde, new Date());
        if (pers.length > 0) {
          const primero = fmtPeriodoLabel(pers[0]);
          const ultimo = fmtPeriodoLabel(pers[pers.length - 1]);
          periodoTexto = pers.length === 1 ? primero : `${primero} a ${ultimo}`;
        }
      } catch (_) {
        periodoTexto = `${mesesMax} mes(es)`;
      }
    }

    const modalidadTexto = porActividad
      ? 'Mixto / Comercial (Locales con actividad propia)'
      : cData.condo.tipo === 'RESIDENCIAL'
      ? 'Residencial (Cuota fija por apartamento)'
      : 'Centralizado por Condominio';

    const header =
      `🏛️ <b>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) ♻️</b>\n` +
      `<b>Servicio de Atención Ciudadana de Aseo Urbano</b>\n` +
      `🏢 <b>Estado de Cuenta de Condominio</b>\n\n` +
      `🏢 <b>Condominio:</b> ${cData.condo.nombre}\n` +
      `📄 <b>RIF:</b> <code>${cData.condo.identidad}</code>\n` +
      `🏷️ <b>Código:</b> <code>${cData.condo.codigo}</code>\n` +
      `💵 <b>Tasa Oficial BCV:</b> ${fmtNum(tasaBcv)} Bs./TCMMV\n` +
      `🚪 <b>Unidades asociadas:</b> ${cData.unidades.length} unidades (${cData.condo.tipo})\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    const bodyMsg =
      `• <b>Modalidad:</b> ${modalidadTexto}\n` +
      `• <b>Meses pendientes:</b> ${mesesMax > 0 ? `${mesesMax} mes(es) (${periodoTexto})` : '0 meses (Solvente)'}\n` +
      `• <b>Subtotal Base Aseo:</b> ${fmtBs(totales.baseBs)}\n` +
      (totales.ivaBs > 0 ? `• <b>IVA 16%:</b> ${fmtBs(totales.ivaBs)}\n` : '') +
      (totales.multaBs > 0 ? `• <b>Multas acumuladas:</b> ${fmtBs(totales.multaBs)}\n` : '') +
      (totales.retencionBs > 0 ? `• <b>Retención 75% aplicada:</b> -${fmtBs(totales.retencionBs)}\n` : '');

    const footer =
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (totales.totalBs > 0
        ? `💳 <b>TOTAL GENERAL A PAGAR:</b> <b>${fmtBs(totales.totalBs)}</b>\n\n` +
          `📲 <i>Para cancelar y reportar el pago de este condominio, comunícate directamente con atención por Telegram en el siguiente enlace:</i>`
        : `✅ <b>ESTADO:</b> <b>SOLVENTE</b>\n<i>El condominio no posee deudas pendientes a la fecha.</i>`) +
      `\n\nNaguanagua Te Quiero 💙🧡\n` +
      `Elizabeth Niño Alcaldesa\n` +
      `Rafael Lacava Gobernador\n\n` +
      `¡Construyendo un Municipio más limpio, eficiente y sustentable!`;

    const telegramPagoUrl = getTelegramContactUrl(
      process.env.TELEGRAM_CONDOMINIOS_PAGO_CONTACT_URL ||
      process.env.TELEGRAM_CONDOMINIOS_PAGO_URL ||
      process.env.TELEGRAM_CONDOMINIOS_NUMERO
    );
    const fichaLink = `${PORTAL_BASE_URL}/admin/condominios/ficha?c=${cData.condo.codigo}`;

    const inlineKeyboard: any[][] = [];
    if (totales.totalBs > 0) {
      inlineKeyboard.push([
        { text: '💬 Contactar por Telegram para Cancelar', url: telegramPagoUrl }
      ]);
    }
    inlineKeyboard.push([
      { text: '📋 Ver Ficha y Unidades en Portal', url: fichaLink }
    ]);

    await enviarTelegram(chatId, `${header}${bodyMsg}${footer}`, {
      inline_keyboard: inlineKeyboard
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram Condo Bot] Error en webhook:', err);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
