import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * HUÉRFANOS: inmuebles que vienen de SIGYR y no existen en el sistema nuevo.
 * GET  ?q=&estado=Pendiente&tipo=hijos|sueltos     → listado
 * GET  ?condominios=texto                           → buscador de condominios (módulo)
 * GET  ?actividades=1                               → actividades con su tarifa vigente (moda del sistema)
 * POST { accion: 'asignar' | 'registrar' | 'descartar', id, usuario, ... }
 */

const r6 = (n: number) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const norm = (s: any) => String(s || '').toUpperCase().trim();

function pendienteDesde(n: number): string | null {
  n = Math.max(0, Math.floor(n || 0));
  if (!n) return null;
  const d = new Date(Date.now() - 4 * 3600 * 1000);
  const idx = d.getUTCFullYear() * 12 + d.getUTCMonth() - n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`;
}

async function esUsuarioValido(usuario: string) {
  const u = String(usuario || '').trim().toLowerCase();
  if (!u) return null;
  const { data } = await sb.from('trabajadores').select('usuario, nombre, rol').ilike('usuario', u).maybeSingle();
  if (data) return data;
  return u === 'dzara' ? { usuario: 'dzara', nombre: 'Administrador', rol: 'Administrador' } : null;
}

/** Tarifa vigente por actividad = la más usada en el sistema (no se inventan tarifas). */
async function tarifasPorActividad() {
  const cuenta = new Map<string, Map<string, number>>();
  const porMes = new Map<string, Map<string, number>>();
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('inmuebles').select('actividad_principal, tipo, mmv_mes, meses_deuda, deuda_mmv, cant_inmuebles').order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) {
      const act = norm(r.actividad_principal);
      if (!act || act === 'N/A') continue;
      const mmv = parseFloat(r.mmv_mes) || 0;
      if (mmv > 0) {
        const m = cuenta.get(act) || new Map(); m.set(String(mmv), (m.get(String(mmv)) || 0) + 1); cuenta.set(act, m);
      }
      const meses = parseInt(r.meses_deuda) || 0, d = parseFloat(r.deuda_mmv) || 0, cant = Math.max(1, parseInt(r.cant_inmuebles) || 1);
      if (meses > 0 && d > 0) {
        const k = String(r6(d / meses / cant));
        const m = porMes.get(act) || new Map(); m.set(k, (m.get(k) || 0) + 1); porMes.set(act, m);
      }
    }
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  const moda = (m?: Map<string, number>) => m ? parseFloat([...m.entries()].sort((a, b) => b[1] - a[1])[0][0]) : null;
  const out: Record<string, { mmv_mes: number | null; deuda_mes_mmv: number | null; usos: number }> = {};
  for (const act of new Set([...cuenta.keys(), ...porMes.keys()])) {
    out[act] = { mmv_mes: moda(cuenta.get(act)), deuda_mes_mmv: moda(porMes.get(act)), usos: [...(cuenta.get(act)?.values() || [])].reduce((s, v) => s + v, 0) };
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const qCondo = sp.get('condominios');
    if (qCondo !== null) {
      const t = qCondo.trim();
      let q = sb.from('condominios').select('id, codigo, nombre, identidad, modalidad, cobro_tarifa_por_unidad, cant_declarada, aseo_pendiente_desde').order('nombre').limit(30);
      if (t) q = q.or(`codigo.ilike.%${t}%,nombre.ilike.%${t}%,identidad.ilike.%${t}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return NextResponse.json({ condominios: data || [] });
    }
    if (sp.get('actividades')) {
      return NextResponse.json({ actividades: await tarifasPorActividad() });
    }
    const estado = sp.get('estado') || 'Pendiente';
    const tipo = sp.get('tipo') || '';
    const t = (sp.get('q') || '').trim();
    const rows: any[] = []; let from = 0;
    while (true) {
      let q = sb.from('huerfanos').select('*').order('meses_deuda', { ascending: false }).order('inmueble').range(from, from + 999);
      if (estado !== 'Todos') q = q.eq('estado', estado);
      if (tipo === 'hijos') q = q.not('padre_sugerido', 'is', null);
      if (tipo === 'sueltos') q = q.is('padre_sugerido', null);
      if (t) q = q.or(`inmueble.ilike.%${t}%,nombre.ilike.%${t}%,identidad.ilike.%${t}%,padre_sugerido.ilike.%${t}%,direccion.ilike.%${t}%`);
      const { data, error } = await q;
      if (error) {
        if (/relation .*huerfanos.* does not exist|Could not find the table/i.test(error.message)) {
          return NextResponse.json({ error: 'Falta crear la tabla "huerfanos" en Supabase (sql/2026-10-06_huerfanos.sql).', sinTabla: true }, { status: 409 });
        }
        throw new Error(error.message);
      }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    const { count: pendientes } = await sb.from('huerfanos').select('id', { count: 'exact', head: true }).eq('estado', 'Pendiente');
    return NextResponse.json({ huerfanos: rows, pendientes: pendientes || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { accion, id, usuario } = body;
    const trab = await esUsuarioValido(usuario);
    if (!trab) return NextResponse.json({ error: 'Usuario no autorizado.' }, { status: 403 });
    const quien = `${trab.nombre || trab.usuario} (${trab.usuario})`;

    const { data: h, error: eh } = await sb.from('huerfanos').select('*').eq('id', id).maybeSingle();
    if (eh) throw new Error(eh.message);
    if (!h) return NextResponse.json({ error: 'No existe el registro.' }, { status: 404 });
    if (h.estado !== 'Pendiente') return NextResponse.json({ error: `Este inmueble ya fue resuelto (${h.estado}).` }, { status: 409 });

    const cerrar = async (estado: string, resolucion: any) => {
      const { error } = await sb.from('huerfanos').update({ estado, resuelto_por: quien, resuelto_en: new Date().toISOString(), resolucion }).eq('id', h.id).eq('estado', 'Pendiente');
      if (error) throw new Error(error.message);
    };

    // ── Agregar como unidad de un condominio ──
    if (accion === 'asignar') {
      const { data: c } = await sb.from('condominios').select('id, codigo, nombre, modalidad, cobro_tarifa_por_unidad, aseo_pendiente_desde').eq('codigo', body.condominio).maybeSingle();
      if (!c) return NextResponse.json({ error: 'Seleccione un condominio válido.' }, { status: 400 });
      const { data: ya } = await sb.from('condominio_unidades').select('id').eq('inmueble', h.inmueble).maybeSingle();
      if (ya) return NextResponse.json({ error: 'Ese código ya está registrado como unidad.' }, { status: 409 });
      const propia = c.modalidad === 'INDIVIDUAL' || c.cobro_tarifa_por_unidad;
      let tarifa: number | null = null;
      if (propia && h.actividad) {
        const { data: misma } = await sb.from('condominio_unidades').select('tarifa_mmv').ilike('actividad', h.actividad).not('tarifa_mmv', 'is', null).limit(50);
        const cnt = new Map<number, number>(); (misma || []).forEach((m: any) => cnt.set(m.tarifa_mmv, (cnt.get(m.tarifa_mmv) || 0) + 1));
        tarifa = cnt.size ? [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
      }
      const fila = {
        condominio_id: c.id, inmueble: h.inmueble, numero: body.numero || h.numero || null,
        identidad: body.identidad || h.identidad || null, propietario: body.nombre || h.nombre || null,
        actividad: h.actividad || null, tarifa_mmv: tarifa,
        estado: /DESOCUPAD/i.test(h.actividad || '') ? 'Desocupada' : 'Activa',
        // Deuda propia (pago individual / tarifa por local): la de SIGYR. Si no, la unidad sigue al condominio.
        aseo_pendiente_desde: propia ? pendienteDesde(h.meses_deuda) : c.aseo_pendiente_desde,
      };
      const { data: ins, error } = await sb.from('condominio_unidades').insert(fila).select('id').single();
      if (error) throw new Error(error.message);
      await cerrar('Asignado a condominio', { condominio: c.codigo, nombre: c.nombre, unidad_id: ins.id, deuda_propia: propia });
      await sb.from('auditoria').insert({ accion: 'Huérfano agregado a condominio', usuario: quien, detalles: { _categoria: 'CONDOMINIOS', inmueble: h.inmueble, condominio: c.codigo, deuda_propia: propia, meses_sigyr: h.meses_deuda } });
      return NextResponse.json({ ok: true });
    }

    // ── Registrar como contribuyente normal ──
    if (accion === 'registrar') {
      const d = body.datos || {};
      const identidad = norm(d.identidad).replace(/\s/g, '');
      if (!/^[VEJGP]-\d{5,10}$/.test(identidad)) return NextResponse.json({ error: 'Cédula/RIF inválida. Formato: V-12345678 o J-123456789.' }, { status: 400 });
      const nombre = String(d.nombre || '').trim();
      if (nombre.length < 3) return NextResponse.json({ error: 'Escriba el nombre o razón social.' }, { status: 400 });
      const actividad = String(d.actividad || '').trim();
      if (!actividad) return NextResponse.json({ error: 'Seleccione la actividad.' }, { status: 400 });
      const tipo = /RESID/i.test(d.tipo || '') ? 'RESIDENCIAL' : 'COMERCIAL';
      const meses = Math.max(0, parseInt(d.meses_deuda ?? h.meses_deuda) || 0);

      const { data: existeInm } = await sb.from('inmuebles').select('id').eq('inmueble', h.inmueble).maybeSingle();
      if (existeInm) return NextResponse.json({ error: `El código ${h.inmueble} ya existe en inmuebles.` }, { status: 409 });

      const tarifas = await tarifasPorActividad();
      const t = tarifas[norm(actividad)];
      if (!t || !t.mmv_mes) return NextResponse.json({ error: `La actividad "${actividad}" no tiene tarifa en el sistema. Seleccione una de la lista.` }, { status: 400 });
      const deudaMes = t.deuda_mes_mmv ?? (h.meses_deuda > 0 ? r6(Number(h.deuda_mmv) / h.meses_deuda) : 0);

      const { data: contribPrev } = await sb.from('contribuyentes').select('identidad').eq('identidad', identidad).maybeSingle();
      if (!contribPrev) {
        const { error: ec } = await sb.from('contribuyentes').insert({
          identidad, nombre, telefono: d.telefono || h.telefono || null, email: d.correo || h.correo || null,
          direccion: d.direccion || h.direccion || null, observaciones: `Registrado desde Huérfanos (SIGYR ${h.inmueble})`,
        });
        if (ec) throw new Error('No se pudo registrar el contribuyente: ' + ec.message);
      }
      const { error: ei } = await sb.from('inmuebles').insert({
        inmueble: h.inmueble, identidad, contribuyente: nombre, tipo, clasificacion: 'Individual',
        actividad_principal: actividad, direccion: d.direccion || h.direccion || '', mmv_mes: t.mmv_mes, cant_inmuebles: 1,
        meses_deuda: meses, deuda_mmv: r6(deudaMes * meses), deuda_congelada_bs: 0, multa_bs: 0, saldo_favor_bs: 0,
        correo_electronico: d.correo || h.correo || '', telefono: d.telefono || h.telefono || '', estado: 'Activo',
        notas: `[ORIGEN: SIGYR huérfano ${new Date().toLocaleDateString('es-VE')}]`,
      });
      if (ei) throw new Error('No se pudo registrar el inmueble: ' + ei.message);
      await cerrar('Registrado como contribuyente', { identidad, nombre, actividad, mmv_mes: t.mmv_mes, meses_deuda: meses, contribuyente_existia: !!contribPrev });
      await sb.from('auditoria').insert({ accion: 'NUEVO_CONTRIBUYENTE', usuario: quien, detalles: { _categoria: 'CONTRIBUYENTES', origen: 'Huérfanos SIGYR', inmueble: h.inmueble, identidad, nombre, actividad, mmv_mes: t.mmv_mes, meses_deuda: meses } });
      return NextResponse.json({ ok: true });
    }

    if (accion === 'descartar') {
      const motivo = String(body.motivo || '').trim();
      if (motivo.length < 5) return NextResponse.json({ error: 'Escriba el motivo.' }, { status: 400 });
      await cerrar('Descartado', { motivo });
      await sb.from('auditoria').insert({ accion: 'Huérfano descartado', usuario: quien, detalles: { _categoria: 'CONTRIBUYENTES', inmueble: h.inmueble, motivo, meses_sigyr: h.meses_deuda } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
