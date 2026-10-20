import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getFAR, isResidencialInm } from '@/lib/calculos';
import { getTasaBCV } from '@/services/bcv';

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
    // Obtener tasa UCD (EUR oficial) usando el mismo servicio que el resto del sistema
    const bcvData = await getTasaBCV();
    if (!bcvData.success) throw new Error('Error obteniendo tasa EUR/BCV');
    const tcmmv: number = bcvData.tcmmv;

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

    // ── PASO 1: Obtener inmuebles facturables ──
    // Reglas:
    //  - Solo estado 'Activo' (Inactivo/Eliminado no generan deuda).
    //  - NUNCA contenedores "N/A": su tarifa es la suma de sus hijos (fuera de condominio)
    //    o de sus nietos (condominio → N/A → actividades). Facturarlos duplicaría el cobro.
    //  - NUNCA el código padre de un condominio (es_condominio): se cobra por el módulo de Condominios.
    // TODO(saneamiento): esta consulta devuelve máx. 1000 filas (límite de Supabase) y solo suma deuda_mmv,
    // no meses_deuda. Se rediseña junto con el libro de deuda mensual antes del próximo cierre.
    const { data: inmRaw, error: inmueblesError } = await supabase
      .from('inmuebles')
      .select('id, identidad, inmueble, mmv_mes, cant_inmuebles, deuda_mmv, meses_deuda, clasificacion, actividad_principal, estado, es_condominio')
      .gt('mmv_mes', 0)
      .eq('estado', 'Activo');
    if (inmueblesError) throw inmueblesError;
    const inmuebles: any[] = (inmRaw || []).filter((i: any) =>
      (i.actividad_principal || '').trim().toUpperCase() !== 'N/A' && i.es_condominio !== true);
    if (inmuebles.length === 0) {
      return NextResponse.json({ success: true, procesados: 0, omitidos: 0, message: 'No hay inmuebles activos' });
    }

    // ── PASO 2: Obtener TODAS las referencias existentes para este período ──
    // Incluye tanto formato nuevo (CM-I-) como viejo (CM-C-) para evitar duplicados
    const todasLasRefs = inmuebles
      .filter((inm: any) => inm.inmueble)
      .map((inm: any) => `CM-${inm.inmueble}-${periodoKey}`);

    // Buscar referencias que ya existen (formato CM-I-) — por lotes para no exceder el largo de URL
    const existentesNuevo: any[] = [];
    for (let k = 0; k < todasLasRefs.length; k += 300) {
      const { data: lote } = await supabase
        .from('facturas')
        .select('referencia, identidad')
        .in('referencia', todasLasRefs.slice(k, k + 300));
      existentesNuevo.push(...(lote || []));
    }

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
    const inmueblesAActualizar: { id: string; nuevaDeudaMmv: number; nuevoMesesDeuda: number }[] = [];

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

      // Fórmula oficial de la Ordenanza:
      //   Residencial: TR = F.O. × UCD × FAR  (donde FAR depende del tipo de vivienda)
      //   Comercial:   TC = F.O. × UCD × FAC  (FAC = 0.1280)
      // UCD = 57 * Euro BCV (tcmmv)
      const esResidencial = isResidencialInm(inm);
      const currentFAR = getFAR(inm.actividad_principal || '');
      const ucdMultiplicador = esResidencial ? (57 * currentFAR) : (57 * 0.128);

      const deudaAgregadaBs = parseFloat((cant * mmv * ucdMultiplicador * tcmmv).toFixed(2));
      const nuevaDeudaMmv   = (parseFloat(inm.deuda_mmv) || 0) + (cant * mmv * ucdMultiplicador);

      facturasNuevas.push({
        referencia:    refFactura,
        identidad:     inm.identidad,
        
        monto:         deudaAgregadaBs,
        estado:        'Pendiente',
        emision:       emisionDate,
        vencimiento:   vencimientoDate
      });

      // Agregar al Set para evitar duplicados dentro de la misma ejecución
      refsExistentes.add(refFactura);
      const nuevoMesesDeuda = (parseInt(String(inm.meses_deuda || 0)) || 0) + 1;
      inmueblesAActualizar.push({ id: inm.id, nuevaDeudaMmv, nuevoMesesDeuda });
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

    // ── PASO 5: Actualizar deuda_mmv y meses_deuda en paralelo (batch updates) ──
    await Promise.all(
      inmueblesAActualizar.map(({ id, nuevaDeudaMmv, nuevoMesesDeuda }) =>
        supabase.from('inmuebles').update({ deuda_mmv: nuevaDeudaMmv, meses_deuda: nuevoMesesDeuda }).eq('id', id)
      )
    );

    const montoTotal = facturasNuevas.reduce((s: number, f: any) => s + f.monto, 0);

    // Audit log en tabla auditoria (sistema unificado)
    try {
      await supabase.from('auditoria').insert({
        usuario:   'Sistema (Cron)',
        accion:    'Facturación Mensual Automática',
        categoria: 'FACTURACION',
        modulo:    '/api/cron/billing',
        detalles: {
          criticidad: 'MEDIA',
          _categoria: 'FACTURACION',
          _modulo: '/api/cron/billing',
          periodo: mesFacturado,
          procesados: facturasNuevas.length,
          omitidos,
          monto_total_bs: montoTotal,
          tasa_ucd: tcmmv,
          _hora: new Date().toLocaleTimeString('es-VE'),
          _fecha: new Date().toLocaleDateString('es-VE'),
          _ts: new Date().toISOString()
        }
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
      await supabase.from('auditoria').insert({
        usuario:   'Sistema (Cron)',
        accion:    'Error Facturacion Mensual',
        categoria: 'SISTEMA',
        modulo:    '/api/cron/billing',
        detalles: {
          _categoria: 'SISTEMA',
          error: error.message || 'Error desconocido',
        }
      });
    } catch(e) {}
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
