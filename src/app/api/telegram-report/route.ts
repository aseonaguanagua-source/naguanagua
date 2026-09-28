// ============================================================
// API Route: /api/telegram-report
// Reportes automaticos a las 12:00 y 18:00 hora Venezuela
// Variables requeridas en Vercel:
//   TELEGRAM_BOT_TOKEN  — token del bot de Telegram
//   TELEGRAM_CHAT_ID    — ID del grupo/canal destino
//   SUPABASE_SERVICE_ROLE_KEY — para leer sin RLS
// ============================================================
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMonto = (v: any) => parseFloat(String(v || 0).replace(/[^\d.]/g, '')) || 0;

async function enviarTelegram(msg: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] Token o Chat ID no configurados.');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML' }),
    });
    const d = await res.json();
    return d.ok === true;
  } catch (e) { console.error('[Telegram] Error:', e); return false; }
}

export async function GET(request: Request) { return generarReporte(request); }
export async function POST(request: Request) { return generarReporte(request); }

async function generarReporte(request?: Request) {
  try {
    // Fecha/hora Venezuela (UTC-4)
    const now   = new Date();
    const vzNow = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const pad   = (n: number) => String(n).padStart(2, '0');
    const hoy   = `${vzNow.getUTCFullYear()}-${pad(vzNow.getUTCMonth()+1)}-${pad(vzNow.getUTCDate())}`;
    const hora  = vzNow.getUTCHours();
    const turno = hora < 15 ? 'MEDIODÍA' : 'TARDE';
    const horaStr = `${pad(hora)}:${pad(vzNow.getUTCMinutes())}`;

    const diaInicio = hoy + 'T04:00:00.000Z'; // 00:00 VE = 04:00 UTC
    const diaFin    = hoy + 'T27:59:59.999Z'; // 23:59 VE = 03:59 UTC next day (safe upper bound)
    const manana    = new Date(vzNow.getTime() + 24*60*60*1000);
    const finDia    = `${manana.getUTCFullYear()}-${pad(manana.getUTCMonth()+1)}-${pad(manana.getUTCDate())}T04:00:00.000Z`;

    // ── 1. Pagos aprobados del día ──────────────────────────────
    const { data: pagosHoy } = await supabase
      .from('pagos_reportados')
      .select('monto, tipo, identidad')
      .eq('estado', 'Aprobado')
      .gte('created_at', diaInicio)
      .lt('created_at', finDia);

    const pagos = pagosHoy || [];
    const totalDia          = pagos.reduce((a, p) => a + parseMonto(p.monto), 0);
    const totalDebito       = pagos.filter(p => p.tipo === 'Debito').reduce((a, p) => a + parseMonto(p.monto), 0);
    const totalTransfer     = pagos.filter(p => p.tipo === 'Transferencia').reduce((a, p) => a + parseMonto(p.monto), 0);
    const totalSaldoFavor   = pagos.filter(p => p.tipo === 'Saldo a Favor').reduce((a, p) => a + parseMonto(p.monto), 0);
    const cantDebito        = pagos.filter(p => p.tipo === 'Debito').length;
    const cantTransfer      = pagos.filter(p => p.tipo === 'Transferencia').length;
    const usuariosPagaron   = new Set(pagos.map(p => p.identidad)).size;

    // ── 2. Conciliaciones pendientes (Por Verificar) ────────────
    const { count: porVerificar } = await supabase
      .from('pagos_reportados')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'Por Verificar');

    // ── 3. Total usuarios (contribuyentes) ──────────────────────
    const { count: totalUsuarios } = await supabase
      .from('contribuyentes')
      .select('*', { count: 'exact', head: true });

    // ── 4. Deuda total del sistema (recibos Pendiente) ─────────
    const { data: facturasPend } = await supabase
      .from('facturas')
      .select('monto')
      .eq('estado', 'Pendiente');

    const deudaTotal = (facturasPend || []).reduce((a, f) => a + parseMonto(f.monto), 0);
    const totalFactPend = (facturasPend || []).length;

    // ── 5. Tasa BCV actual ──────────────────────────────────────
    let tasaBcv = 0;
    try {
      const r = await fetch('https://ve.dolarapi.com/v1/euros/oficial', { cache: 'no-store' });
      const d = await r.json();
      tasaBcv = d.promedio || 0;
    } catch(e) {}

    const fechaFmt = new Date(hoy + 'T12:00:00').toLocaleDateString('es-VE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    const ICON = turno === 'MEDIODÍA' ? '🌤️' : '🌆';

    const mensaje = [
      `🏛️ <b>IAMEC Naguanagua — Aseo Urbano Naguanagua</b>`,
      `${ICON} <b>Reporte ${turno} | ${horaStr} VE</b>`,
      `📅 ${fechaFmt}`,
      ``,
      `━━━━━━ 💰 RECAUDACIÓN DEL DÍA ━━━━━━`,
      `<b>Total Cobrado: Bs. ${fmt(totalDia)}</b>`,
      `👥 Contribuyentes que pagaron: ${usuariosPagaron}`,
      ``,
      `💳 <b>Débito / Punto de Venta</b>`,
      `   Bs. ${fmt(totalDebito)} · ${cantDebito} operaciones`,
      ``,
      `🏦 <b>Transferencias Bancarias</b>`,
      `   Bs. ${fmt(totalTransfer)} · ${cantTransfer} operaciones`,
      ...(totalSaldoFavor > 0 ? [
        ``,
        `✳️ <b>Saldo a Favor aplicado</b>`,
        `   Bs. ${fmt(totalSaldoFavor)}`
      ] : []),
      ``,
      `━━━━━ ⏳ PENDIENTES DEL SISTEMA ━━━━━`,
      `🔍 Conciliaciones por verificar: <b>${porVerificar || 0}</b>`,
      `📋 Recibos pendientes de cobro: <b>${totalFactPend}</b>`,
      ``,
      `━━━━━━ 📊 ESTADO GENERAL ━━━━━━━━━`,
      `👤 Total contribuyentes: <b>${totalUsuarios || 0}</b>`,
      `💸 Deuda total sistema: <b>Bs. ${fmt(deudaTotal)}</b>`,
      ...(tasaBcv > 0 ? [`📈 Tasa EUR/BCV: <b>${fmt(tasaBcv)} Bs</b>`] : []),
      ``,
      `⏰ Generado automáticamente — ${horaStr} VE`,
    ].join('\n');

    const enviado = await enviarTelegram(mensaje);

    return NextResponse.json({
      success: true,
      turno,
      fecha: hoy,
      totalDia,
      totalDebito,
      totalTransfer,
      usuariosPagaron,
      porVerificar,
      totalUsuarios,
      deudaTotal,
      tasaBcv,
      telegramEnviado: enviado,
      mensaje: enviado
        ? `Reporte ${turno} enviado a Telegram`
        : 'Telegram no configurado — agregar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Vercel',
    });

  } catch (e: any) {
    console.error('[telegram-report]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
