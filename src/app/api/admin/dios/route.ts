// MODO DIOS — edición total de la base de datos desde la interfaz.
// Seguridad: sesión de administrador (cookie httpOnly) + clave de desarrollador. Todo cambio queda en auditoría
// con el valor ANTES y DESPUÉS, y puede deshacerse.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { SESSION_COOKIE, verifySession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';
const DEV_PASS = '1756762';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = sb; // tablas dinámicas: sin tipos generados

type Col = { name: string; type: string; format: string; pk: boolean; required: boolean; description?: string; enum?: string[] };
let schemaCache: { at: number; tables: Record<string, Col[]> } | null = null;

async function getSchema() {
  if (schemaCache && Date.now() - schemaCache.at < 5 * 60_000) return schemaCache.tables;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!; const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' }, cache: 'no-store' });
  const j = await r.json();
  const tables: Record<string, Col[]> = {};
  for (const [t, def] of Object.entries<any>(j.definitions || {})) {
    const req = new Set<string>(def.required || []);
    tables[t] = Object.entries<any>(def.properties || {}).map(([name, p]) => ({
      name, type: p.type || 'string', format: p.format || '', pk: /<pk\/>/.test(p.description || ''), required: req.has(name),
      description: String(p.description || '').replace(/Note:[\s\S]*$/, '').trim() || undefined, enum: p.enum,
    }));
  }
  schemaCache = { at: Date.now(), tables };
  return tables;
}
const pkOf = (cols: Col[]) => cols.find(c => c.pk)?.name || (cols.some(c => c.name === 'id') ? 'id' : cols[0]?.name);

// Columnas que guardan un CÓDIGO de inmueble / condominio, o una CÉDULA/RIF
const COLS_CODIGO = ['inmueble', 'padre_id', 'condominio_padre_id', 'inmueble_codigo', 'codigo_inmueble'];
const COLS_IDENT = ['identidad', 'rif', 'cedula', 'cedula_rif', 'identidad_contribuyente'];

async function auth() {
  const tok = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = tok ? verifySession(tok) : null;
  if (!s) return null;
  if (s.rol !== 'Administrador' && String(s.usuario).toLowerCase() !== 'dzara') return null;
  return s;
}
async function audit(usuario: string, accion: string, detalles: any) {
  const { data, error } = await sb.from('auditoria').insert({ accion: `MODO DIOS: ${accion}`, usuario, detalles: { ...detalles, _categoria: 'MODO_DIOS', criticidad: 'ALTA' } }).select('id').maybeSingle();
  if (error) throw new Error(`No se pudo registrar en auditoría (${error.message}). No se guardó nada.`);
  return data?.id;
}

export async function POST(req: Request) {
  try {
    const s = await auth();
    if (!s) return NextResponse.json({ error: 'Solo un administrador con sesión activa puede usar el Modo Dios.' }, { status: 401 });
    const body = await req.json();
    if (body.pass !== DEV_PASS) return NextResponse.json({ error: 'Clave de desarrollador inválida' }, { status: 401 });
    const usuario = `${s.nombre || s.usuario} (${s.usuario})`;
    const schema = await getSchema();
    const { action } = body;

    if (action === 'schema') return NextResponse.json({ tables: schema });

    const table = String(body.table || '');
    if (action !== 'cascada' && action !== 'deshacer' && action !== 'historial' && action !== 'buscarGlobal' && !schema[table]) return NextResponse.json({ error: `Tabla desconocida: ${table}` }, { status: 400 });
    const cols = schema[table] || [];
    const pk = pkOf(cols);

    if (action === 'listar') {
      // filtro de texto libre sobre columnas de texto + paginación
      const page = Math.max(0, Number(body.page) || 0), size = Math.min(200, Number(body.size) || 50);
      let q: any = sb.from(table).select('*', { count: 'exact' });
      const txt = String(body.q || '').trim().replace(/[,()]/g, ' ');
      if (txt) {
        const tc = cols.filter(c => c.type === 'string' && ['text', 'character varying', 'character'].includes(c.format)).map(c => `${c.name}.ilike.*${txt}*`);
        const uc = cols.filter(c => c.format === 'uuid' && /^[0-9a-f-]{36}$/i.test(txt)).map(c => `${c.name}.eq.${txt}`);
        const nc = /^-?\d+(\.\d+)?$/.test(txt) ? cols.filter(c => c.type === 'integer' || c.type === 'number').map(c => `${c.name}.eq.${txt}`) : [];
        const all = [...tc, ...uc, ...nc]; if (all.length) q = q.or(all.join(','));
      }
      if (body.match && typeof body.match === 'object') q = q.match(body.match);
      const ord = cols.find(c => c.name === body.orden) ? body.orden : (cols.some(c => c.name === 'created_at') ? 'created_at' : pk);
      const { data, error, count } = await q.order(ord, { ascending: !!body.asc }).range(page * size, page * size + size - 1);
      if (error) throw error;
      return NextResponse.json({ rows: data, count, pk, cols });
    }

    if (action === 'buscarGlobal') {
      // búsqueda rápida: contribuyentes (inmuebles), condominios, unidades, contribuyentes
      const t = String(body.q || '').trim().replace(/[,()]/g, ' '); if (t.length < 2) return NextResponse.json({ results: [] });
      const like = `*${t}*`;
      const [a, b, c, d] = await Promise.all([
        sb.from('inmuebles').select('id, inmueble, identidad, contribuyente, actividad_principal, estado').or(`inmueble.ilike.${like},identidad.ilike.${like},contribuyente.ilike.${like}`).limit(25),
        sb.from('condominios').select('id, codigo, identidad, nombre, estado').or(`codigo.ilike.${like},identidad.ilike.${like},nombre.ilike.${like}`).limit(10),
        sb.from('condominio_unidades').select('id, inmueble, identidad, propietario, numero, estado').or(`inmueble.ilike.${like},identidad.ilike.${like},propietario.ilike.${like}`).limit(15),
        schema.contribuyentes ? sb.from('contribuyentes').select('*').or(schema.contribuyentes.filter(x => ['identidad', 'nombre', 'razon_social', 'rif', 'cedula'].includes(x.name)).map(x => `${x.name}.ilike.${like}`).join(',') || `id.eq.0`).limit(10) : Promise.resolve({ data: [] as any[] }),
      ]);
      const results = [
        ...(a.data || []).map((r: any) => ({ table: 'inmuebles', id: r.id, titulo: `${r.inmueble} · ${r.contribuyente || ''}`, sub: `${r.identidad || ''} · ${r.actividad_principal || ''} · ${r.estado || ''}` })),
        ...(b.data || []).map((r: any) => ({ table: 'condominios', id: r.id, titulo: `${r.codigo} · ${r.nombre || ''}`, sub: `Condominio · ${r.identidad || ''} · ${r.estado || ''}` })),
        ...(c.data || []).map((r: any) => ({ table: 'condominio_unidades', id: r.id, titulo: `${r.inmueble} · ${r.propietario || ''}`, sub: `Local de condominio ${r.numero ? '#' + r.numero : ''} · ${r.estado || ''}` })),
        ...((d as any).data || []).map((r: any) => ({ table: 'contribuyentes', id: r.id, titulo: `${r.identidad || r.rif || ''} · ${r.nombre || r.razon_social || ''}`, sub: 'Ficha de contribuyente' })),
      ];
      return NextResponse.json({ results });
    }

    if (action === 'leer') {
      const { data, error } = await sb.from(table).select('*').eq(pk, body.id).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ row: data, pk, cols });
    }

    if (action === 'guardar') {
      const id = body.id; const cambios = body.cambios || {};
      const validos = Object.fromEntries(Object.entries(cambios).filter(([k]) => cols.some(c => c.name === k) && k !== pk));
      if (!Object.keys(validos).length) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });
      const { data: antes, error: e1 } = await sb.from(table).select('*').eq(pk, id).maybeSingle();
      if (e1 || !antes) throw e1 || new Error('Registro no encontrado');
      const antesSolo = Object.fromEntries(Object.keys(validos).map(k => [k, (antes as any)[k]]));
      const audId = await audit(usuario, `editar ${table}`, { tabla: table, pk, id, antes: antesSolo, despues: validos });
      const { data, error } = await sb.from(table).update(validos).eq(pk, id).select('*').maybeSingle();
      if (error) throw error;
      return NextResponse.json({ row: data, auditoria: audId });
    }

    if (action === 'crear') {
      const fila = Object.fromEntries(Object.entries(body.fila || {}).filter(([k, v]) => cols.some(c => c.name === k) && v !== '' && v !== undefined));
      const { data, error } = await sb.from(table).insert(fila).select('*').maybeSingle();
      if (error) throw error;
      await audit(usuario, `crear ${table}`, { tabla: table, pk, id: (data as any)?.[pk], antes: null, despues: data });
      return NextResponse.json({ row: data });
    }

    if (action === 'eliminar') {
      const { data: antes } = await sb.from(table).select('*').eq(pk, body.id).maybeSingle();
      if (!antes) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 });
      await audit(usuario, `eliminar ${table}`, { tabla: table, pk, id: body.id, antes, despues: null });
      const { error } = await sb.from(table).delete().eq(pk, body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'cascada') {
      // Cambia un código de inmueble/condominio o una cédula/RIF en TODAS las tablas donde aparezca.
      const tipo = body.tipo === 'identidad' ? 'identidad' : 'codigo';
      const viejo = String(body.viejo || '').trim(), nuevo = String(body.nuevo || '').trim().toUpperCase();
      if (!viejo || !nuevo || viejo === nuevo) return NextResponse.json({ error: 'Indique el valor actual y el nuevo' }, { status: 400 });
      const nombres = tipo === 'codigo' ? COLS_CODIGO : COLS_IDENT;
      const objetivos: { table: string; col: string; n: number }[] = [];
      for (const [t, cs] of Object.entries(schema)) {
        for (const c of cs) {
          if (!(nombres.includes(c.name) || (tipo === 'codigo' && t === 'condominios' && c.name === 'codigo'))) continue;
          if (c.type !== 'string' || c.format === 'uuid') continue;
          const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq(c.name, viejo);
          if (count) objetivos.push({ table: t, col: c.name, n: count });
        }
      }
      if (tipo === 'codigo') {
        const { count } = await sb.from('inmuebles').select('*', { count: 'exact', head: true }).eq('inmueble', nuevo);
        if (count) return NextResponse.json({ error: `El código ${nuevo} ya existe. No se puede repetir.`, objetivos }, { status: 409 });
      }
      if (!body.confirmar) return NextResponse.json({ preview: true, objetivos });
      const audId = await audit(usuario, `cambiar ${tipo} ${viejo} → ${nuevo}`, { cascada: true, tipo, viejo, nuevo, objetivos });
      const hechos: any[] = [];
      for (const o of objetivos) {
        const { data, error } = await db.from(o.table).update({ [o.col]: nuevo }).eq(o.col, viejo).select(pkOf(schema[o.table]));
        hechos.push({ ...o, actualizados: data?.length || 0, error: error?.message });
      }
      return NextResponse.json({ ok: true, hechos, auditoria: audId });
    }

    if (action === 'historial') {
      const { data, error } = await sb.from('auditoria').select('*').like('accion', 'MODO DIOS:%').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return NextResponse.json({ rows: data });
    }

    if (action === 'deshacer') {
      const { data: a } = await sb.from('auditoria').select('*').eq('id', body.auditoriaId).maybeSingle();
      const d: any = a?.detalles; if (!d) return NextResponse.json({ error: 'Registro de auditoría no encontrado' }, { status: 404 });
      if (d.cascada) {
        for (const o of d.objetivos || []) await db.from(o.table).update({ [o.col]: d.viejo }).eq(o.col, d.nuevo);
      } else if (d.antes && d.despues) {
        await db.from(d.tabla).update(d.antes).eq(d.pk, d.id);
      } else if (d.antes && !d.despues) {
        await db.from(d.tabla).insert(d.antes);
      } else if (!d.antes && d.despues) {
        await db.from(d.tabla).delete().eq(d.pk, d.id);
      }
      await audit(usuario, `deshacer #${body.auditoriaId}`, { deshace: body.auditoriaId });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
