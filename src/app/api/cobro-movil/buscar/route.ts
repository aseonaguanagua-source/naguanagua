import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getIdentidadVariants, getIdentidadVariantsExact } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ error: 'Búsqueda muy corta' }, { status: 400 });
    }

    const variants = /^[VEJPG][-\s]?\d+$/i.test(q) ? getIdentidadVariantsExact(q) : getIdentidadVariants(q);
    const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

    // 1. Buscar en inmuebles con todas las variantes
    let { data: inmsDB } = await supabaseAdmin
      .from('inmuebles')
      .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas,estado,padre_id,saldo_favor_bs')
      .or(orFilter);

    // 2. Buscar por código de inmueble si no se encontró
    if (!inmsDB || inmsDB.length === 0) {
      const { data: byInmCode } = await supabaseAdmin
        .from('inmuebles')
        .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas,estado,padre_id,saldo_favor_bs')
        .ilike('inmueble', `%${q}%`)
        .limit(10);
      if (byInmCode && byInmCode.length > 0) inmsDB = byInmCode;
    }

    // 3. Resolver identidad oficial en contribuyentes
    if (!inmsDB || inmsDB.length === 0) {
      const { data: cMatches } = await supabaseAdmin
        .from('contribuyentes')
        .select('*')
        .or(orFilter)
        .limit(1);

      if (cMatches && cMatches.length > 0) {
        const officialId = cMatches[0].identidad;
        const cVariants = getIdentidadVariantsExact(officialId);
        const { data: inmsByContrib } = await supabaseAdmin
          .from('inmuebles')
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas,estado,padre_id,saldo_favor_bs')
          .or(cVariants.map(v => `identidad.eq.${v}`).join(','));
        if (inmsByContrib && inmsByContrib.length > 0) {
          inmsDB = inmsByContrib;
        }
      }
    }

    if (inmsDB && inmsDB.length > 0) {
      const isActivo = (i: any) => {
        const est = (i.estado || 'Activo').trim().toLowerCase();
        return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
      };
      inmsDB = inmsDB.filter(isActivo);
    }

    if (!inmsDB || inmsDB.length === 0) {
      // Fallback: Buscar en servicios_especiales (usuarios no registrados o trámites directos)
      const isSrv = /^SRV-/i.test(q) || q.toUpperCase().includes('SRV-');
      let qSrv = supabaseAdmin.from('servicios_especiales').select('*').eq('estado', 'Pendiente');
      if (isSrv) {
        qSrv = qSrv.ilike('referencia', `%${q.trim()}%`);
      } else {
        qSrv = qSrv.or(['referencia.ilike.%' + q.trim() + '%', ...variants.map(v => 'identidad.eq.' + v)].join(','));
      }
      const { data: srvData } = await qSrv.order('created_at', { ascending: false });

      if (srvData && srvData.length > 0) {
        const srv = srvData[0];
        const srvFacturas = srvData.map((s: any) => ({
          id: s.id,
          referencia: s.referencia,
          monto: parseFloat(s.monto || '0'),
          descripcion: s.descripcion || 'Servicio Especial',
          emision: s.fecha || new Date().toISOString().split('T')[0],
          estado: 'Pendiente'
        }));
        return NextResponse.json({
          foundUser: {
            Contribuyente: srv.contribuyente || 'Contribuyente',
            Identidad: srv.identidad || q,
            Direccion: srv.direccion_evento || 'Municipio Naguanagua',
            Clasificacion: 'Servicio Especial',
            Actividad: srv.descripcion || 'Servicio Especial',
            EsAgente: false
          },
          inmuebles: [{
            id: srv.referencia,
            identidad: srv.identidad || q,
            inmueble: srv.referencia,
            contribuyente: srv.contribuyente || 'Contribuyente',
            clasificacion: 'Servicio Especial',
            tipo: 'SERVICIO',
            direccion: srv.direccion_evento || 'Municipio Naguanagua',
            meses_deuda: 0,
            saldo_favor_bs: 0
          }],
          pagos: [],
          facturas: srvFacturas
        });
      }

      return NextResponse.json({ error: 'No encontrado. Verifique su Cédula, RIF o Código de Servicio.' }, { status: 404 });
    }

    const p = inmsDB.find((i: any) => !i.condominio_padre_id && !i.es_condominio) || inmsDB[0];

    let nombreCont = p.contribuyente;
    
    if (!nombreCont) {
      const { data: fNombre } = await supabaseAdmin.from('facturas')
        .select('contribuyente').eq('identidad', p.identidad)
        .not('contribuyente', 'is', null).limit(1);
      if (fNombre && fNombre.length > 0 && fNombre[0].contribuyente) {
        nombreCont = fNombre[0].contribuyente;
      }
    }

    if (!nombreCont) {
      const { data: cNombre } = await supabaseAdmin.from('contribuyentes')
        .select('nombre')
        .eq('identidad', p.identidad)
        .limit(1);
      if (cNombre && cNombre.length > 0) nombreCont = cNombre[0].nombre;
    }

    const foundUser = {
      Contribuyente: nombreCont || 'Sin Nombre Registrado',
      Identidad: p.identidad,
      Direccion: p.direccion,
      Clasificacion: p.clasificacion,
      Actividad: p.actividad_principal,
      EsAgente: inmsDB.some((i: any) => i.agente_retencion && !i.condominio_padre_id && !i.es_condominio)
    };

    const { data: recDB } = await supabaseAdmin.from('pagos_reportados')
      .select('*')
      .eq('identidad', p.identidad)
      .order('created_at', { ascending: false });

    const { data: facDB } = await supabaseAdmin.from('facturas')
      .select('*')
      .or(getIdentidadVariantsExact(p.identidad).map(v => `identidad.eq.${v}`).join(','))
      .order('created_at', { ascending: false });

    // También cargar servicios especiales pendientes del usuario registrado
    const { data: srvPending } = await supabaseAdmin
      .from('servicios_especiales')
      .select('*')
      .eq('estado', 'Pendiente')
      .or(getIdentidadVariantsExact(p.identidad).map(v => `identidad.eq.${v}`).join(','));

    const srvFacturas = (srvPending || []).map((s: any) => ({
      id: s.id,
      referencia: s.referencia,
      monto: parseFloat(s.monto || '0'),
      descripcion: s.descripcion || 'Servicio Especial',
      emision: s.fecha || new Date().toISOString().split('T')[0],
      estado: 'Pendiente'
    }));

    return NextResponse.json({
      foundUser,
      inmuebles: inmsDB,
      pagos: recDB || [],
      facturas: [...(facDB || []), ...srvFacturas]
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
