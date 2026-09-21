import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Service role key bypasses RLS — necesario para inserts server-side
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const testMode = searchParams.get('test') === 'true';
  const testSecret = searchParams.get('secret');
  const simDateStr = searchParams.get('simDate'); // ej: 2026-09-30

  // Auth: Bearer token O secret de prueba en query param
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'test-billing-2026';
  const isAuthorized = authHeader === `Bearer ${cronSecret}` || testSecret === cronSecret;

  if (!isAuthorized) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ── Verificar si hoy es el día correcto para recibir ──
  const hoy = simDateStr ? new Date(simDateStr + 'T12:00:00') : new Date();
  const lastDayOfMonth = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diaFacturacion = Math.min(30, lastDayOfMonth);

  if (!testMode && hoy.getDate() !== diaFacturacion) {
    return NextResponse.json({
      skipped: true,
      reason: `Hoy es día ${hoy.getDate()}, el día de emisión de recibos es el ${diaFacturacion}. No se procesó.`
    });
  }

  try {
    // Obtener tasa TCMMV (EUR oficial)
    const eurRes = await fetch('https://ve.dolarapi.com/v1/euros/oficial', { cache: 'no-store' });
    if (!eurRes.ok) throw new Error('Error obteniendo tasa EUR/BCV');
    const eurData = await eurRes.json();
    const tcmmv: number = eurData.promedio;

    // El cron corre el día 30 → genera recibos del MES SIGUIENTE
    const ahora = simDateStr ? new Date(simDateStr + 'T12:00:00') : new Date();
    const mesFacturacionDate = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
    const mesMM = String(mesFacturacionDate.getMonth() + 1).padStart(2, '0');
    const mesYYYY = String(mesFacturacionDate.getFullYear());
    const periodoKey = `${mesMM}-${mesYYYY}`; // ej: 10-2026
    const mesFacturado = mesFacturacionDate.toLocaleString('es-VE', { month: 'long', year: 'numeric' });
    const emisionDate = new Date(mesFacturacionDate.getFullYear(), mesFacturacionDate.getMonth(), 1).toISOString().split('T')[0];
    const vencimientoDate = new Date(mesFacturacionDate.getFullYear(), mesFacturacionDate.getMonth(), 30).toISOString().split('T')[0];
    const modoTexto = testMode ? ' [MODO PRUEBA]' : '';

    // ── PASO 1: Obtener todos los inmuebles activos de una sola vez ──
    const { data: inmuebles, error: inmueblesError } = await supabase
      .from('inmuebles')
      .select('id, identidad, contribuyente, cod_cont, inmueble, mmv_mes, cant_inmuebles, deuda_mmv')
      .gt('mmv_mes', 0);

    if (inmueblesError) throw inmueblesError;
    if (!inmuebles || inmuebles.length === 0) {
      return NextResponse.json({ success: true, procesados: 0, omitidos: 0, message: 'No hay inmuebles activos' });
    }

    // ── PASO 2: Obtener TODAS las referencias existentes para este período ──
    // Incluye tanto formato nuevo (CM-I-) como viejo (CM-C-) para evitar duplicados
    const todasLasRefs = inmuebles
      .filter((inm: any) => inm.inmueble)
      .map((inm: any) => `CM-${inm.inmueble}-${periodoKey}`);

    // Buscar referencias que ya existen (formato CM-I-)
    const { data: existentesNuevo } = await supabase
      .from('facturas')
      .select('referencia, identidad')
      .in('referencia', todasLasRefs);

    // Buscar referencias en formato viejo (CM-C-{cod_cont}) para el mismo período
    const { data: existentesViejo } = await supabase
      .from('facturas')
      .select('referencia, identidad')
      .like('referencia', `CM-C-%-${periodoKey}`)
      .not('estado', 'eq', 'Pagado');

    // Construir Set de identidades ya cubiertas por recibo vieja CM-C- (1 recibo por contribuyente)
    // Solo aplica si el contribuyente tiene UN SOLO inmueble activo
    const identidadesConFacturaVieja = new Set((existentesViejo || []).map((e: any) => e.identidad));

    // Contar inmuebles activos por identidad (para saber si es multi-local)
    const inmueblesXidentidad: Record<string, number> = {};
    inmuebles.forEach((inm: any) => {
      if (inm.inmueble && parseFloat(inm.mmv_mes) > 0) {
        inmueblesXidentidad[inm.identidad] = (inmueblesXidentidad[inm.identidad] || 0) + 1;
      }
    });

    const refsExistentes = new Set((existentesNuevo || []).map((e: any) => e.referencia));

    // ── PASO 3: Construir batch de recibos nuevas ──
    const facturasNuevas: any[] = [];
    const inmueblesAActualizar: { id: string; nuevaDeudaMmv: number }[] = [];

    for (const inm of inmuebles) {
      if (!inm.inmueble) continue;
      const cant = parseFloat(inm.cant_inmuebles) || 1;
      const mmv  = parseFloat(inm.mmv_mes) || 0;
      if (mmv <= 0) continue;

      const refFactura = `CM-${inm.inmueble}-${periodoKey}`;

      // Skip si ya existe en formato nuevo CM-I-
      if (refsExistentes.has(refFactura)) continue;

      // Skip si existe recibo vieja CM-C- Y el contribuyente tiene un solo inmueble
      // (la recibo vieja ya lo cubre todo)
      const esUnicoLocal = (inmueblesXidentidad[inm.identidad] || 0) === 1;
      if (esUnicoLocal && identidadesConFacturaVieja.has(inm.identidad)) continue;

      const deudaAgregadaBs = parseFloat((cant * mmv * tcmmv).toFixed(2));
      const nuevaDeudaMmv   = (parseFloat(inm.deuda_mmv) || 0) + (cant * mmv);

      facturasNuevas.push({
        referencia:    refFactura,
        identidad:     inm.identidad,
        contribuyente: inm.contribuyente,
        monto:         deudaAgregadaBs,
        estado:        'Pendiente',
        emision:       emisionDate,
        vencimiento:   vencimientoDate
      });

      // Agregar al Set para evitar duplicados dentro de la misma ejecución
      refsExistentes.add(refFactura);
      inmueblesAActualizar.push({ id: inm.id, nuevaDeudaMmv });
    }

    const omitidos = todasLasRefs.length - facturasNuevas.length;

    if (facturasNuevas.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Todas las recibos de ${mesFacturado} ya existían.${modoTexto}`,
        procesados: 0,
        omitidos,
        periodo: periodoKey,
        tasa_tcmmv: tcmmv,
        test_mode: testMode
      });
    }

    // ── PASO 4: UPSERT masivo — ignora duplicados automáticamente ──
    const { error: insertError } = await supabase
      .from('facturas')
      .upsert(facturasNuevas, { onConflict: 'referencia', ignoreDuplicates: true });

    if (insertError) throw insertError;

    // ── PASO 5: Actualizar deuda_mmv en paralelo (batch updates) ──
    await Promise.all(
      inmueblesAActualizar.map(({ id, nuevaDeudaMmv }) =>
        supabase.from('inmuebles').update({ deuda_mmv: nuevaDeudaMmv }).eq('id', id)
      )
    );

    const montoTotal = facturasNuevas.reduce((s: number, f: any) => s + f.monto, 0);

    // Audit log
    try {
      await supabase.from('audit_logs').insert({
        usuario:  'Sistema (Cron)',
        accion:   'FACTURACION_MENSUAL_AUTOMATICA',
        detalles: `Período: ${mesFacturado}${modoTexto}. Procesados: ${facturasNuevas.length}. Omitidos: ${omitidos}. Monto total: Bs ${montoTotal.toFixed(2)}. Tasa TCMMV: ${tcmmv}`
      });
    } catch(e) {}

    return NextResponse.json({
      success: true,
      message: `Emisión de recibos mensual completada — ${mesFacturado}${modoTexto}`,
      procesados: facturasNuevas.length,
      omitidos,
      montoTotal,
      periodo: periodoKey,
      tasa_tcmmv: tcmmv,
      test_mode: testMode,
      sim_date: simDateStr || null
    });

  } catch (error: any) {
    console.error('Error en Cron Billing:', error);
    try {
      await supabase.from('audit_logs').insert({
        usuario:  'Sistema (Cron)',
        accion:   'ERROR_FACTURACION_MENSUAL',
        detalles: error.message || 'Error desconocido'
      });
    } catch(e) {}
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
