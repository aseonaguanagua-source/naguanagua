import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getIdentidadVariants } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ error: 'Búsqueda muy corta' }, { status: 400 });
    }

    const variants = getIdentidadVariants(q);
    const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

    // 1. Buscar en inmuebles con todas las variantes
    let { data: inmsDB } = await supabaseAdmin
      .from('inmuebles')
      .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
      .or(orFilter);

    // 2. Buscar por código de inmueble si no se encontró
    if (!inmsDB || inmsDB.length === 0) {
      const { data: byInmCode } = await supabaseAdmin
        .from('inmuebles')
        .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
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
        const cVariants = getIdentidadVariants(officialId);
        const { data: inmsByContrib } = await supabaseAdmin
          .from('inmuebles')
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
          .or(cVariants.map(v => `identidad.eq.${v}`).join(','));
        if (inmsByContrib && inmsByContrib.length > 0) {
          inmsDB = inmsByContrib;
        }
      }
    }

    if (inmsDB && inmsDB.length > 0) {
      const activeInms = inmsDB.filter((i: any) => !i.condominio_padre_id && !i.es_condominio);
      if (activeInms.length === 0 && inmsDB.some((i: any) => i.condominio_padre_id || i.es_condominio)) {
        return NextResponse.json({ error: 'Sus propiedades pertenecen a Condominios. El cobro móvil solo está habilitado para inmuebles regulares.' }, { status: 400 });
      }
      inmsDB = activeInms;
    }

    if (!inmsDB || inmsDB.length === 0) {
      return NextResponse.json({ error: 'No encontrado. Verifique su Cédula o RIF.' }, { status: 404 });
    }

    const p = inmsDB[0];

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
      EsAgente: inmsDB.some((i: any) => i.agente_retencion)
    };

    const { data: recDB } = await supabaseAdmin.from('pagos_reportados')
      .select('*')
      .eq('identidad', p.identidad)
      .order('created_at', { ascending: false });

    const { data: facDB } = await supabaseAdmin.from('facturas')
      .select('*')
      .eq('identidad', p.identidad)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      foundUser,
      inmuebles: inmsDB,
      pagos: recDB || [],
      facturas: facDB || []
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
