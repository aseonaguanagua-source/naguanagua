/**
 * CONDOMINIOS — FASE 2: traslado completo con la jerarquía de SIGYR (condominio → torre → unidad).
 *
 *   Simulación:  npx tsx --tsconfig tsconfig.json scripts/condominios/migrar_fase2.ts
 *   Aplicar:     npx tsx --tsconfig tsconfig.json scripts/condominios/migrar_fase2.ts --aplicar
 *
 * Decisiones aprobadas (06/10/2026):
 *  1. Condominios cuyo registro padre está ELIMINADO en el sistema nuevo: se REARMAN en el módulo con sus
 *     unidades ACTIVAS (no se reactiva el inmueble eliminado). Como hoy cada unidad paga por su cuenta,
 *     se crean en modalidad INDIVIDUAL (cada unidad conserva su propia deuda).
 *  2. Grupos activos fuera del módulo: solo los que tienen DUEÑOS DISTINTOS (condominio real).
 *     Los de un mismo dueño se quedan en Contribuyentes. Se respeta "Individual" del sistema anterior.
 *  3. Torres / sub-grupos: un hijo de SIGYR que a su vez tiene hijos se marca es_grupo y sus nietos
 *     cuelgan de él (padre_unidad_id).
 *  Nunca se traen inmuebles Eliminados/Inactivos ni dueños dados de baja en SIGYR.
 *  NO modifica la tabla `inmuebles`.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
Object.assign(process.env, env);
const APLICAR = process.argv.includes('--aplicar');
const RESP = path.resolve('..', 'respaldos');
const JERARQUIA = path.join(RESP, 'sigyr_jerarquia_2026-10-06.json');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const HMR = new Set(['URB009841', 'URB009575', 'URB009651', 'URB009803', 'URB009613', 'URB009727', 'URB009689', 'URB009423', 'URB009461', 'URB009499', 'URB009765', 'URB009537', 'URB018655']);
const up = (s: any) => String(s || '').toUpperCase().trim();

(async () => {
  const { supabaseAdmin: sb } = await import('@/lib/supabaseAdmin');
  const calc = await import('@/lib/calculos');
  const M = await import('@/lib/condominios/motor');
  const ExcelJS = createRequire(path.join(process.cwd(), 'package.json'))('exceljs');
  const XLSX = createRequire(path.join(process.cwd(), 'package.json'))('xlsx');

  async function todo(tabla: string, cols = '*') {
    const out: any[] = []; let last: string | null = null;
    for (;;) {
      let q = sb.from(tabla).select(cols).order('id').limit(1000);
      if (last) q = q.gt('id', last);
      const { data, error } = await q;
      if (error) { console.warn('reintento', tabla, error.message); await sleep(2000); continue; }
      if (!data?.length) break;
      out.push(...data); last = (data[data.length - 1] as any).id; await sleep(80);
    }
    return out;
  }

  // ── Datos ──
  const jer: { codigo: string; padre: string | null; raiz: string; nivel: number; doc: string; dueno_baja: boolean }[] = JSON.parse(fs.readFileSync(JERARQUIA, 'utf8'));
  const jerBy = new Map(jer.map(j => [up(j.codigo), j]));
  const inms = await todo('inmuebles', 'id,inmueble,identidad,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,meses_deuda,multa_bs,estado,agente_retencion,correo_electronico,telefono');
  const inmBy = new Map(inms.map(i => [up(i.inmueble), i]));
  const condos = await todo('condominios', 'id,codigo,modalidad,cobro_tarifa_por_unidad,aseo_pendiente_desde');
  const condoBy = new Map(condos.map(c => [up(c.codigo), c]));
  const unidades = await todo('condominio_unidades', 'id,condominio_id,inmueble,padre_unidad_id,es_grupo');
  const uniBy = new Map(unidades.filter(u => u.inmueble).map(u => [up(u.inmueble), u]));
  const huer = await todo('huerfanos', 'id,inmueble,identidad,nombre,actividad,numero,meses_deuda,padre_sugerido,estado');
  const huerBy = new Map(huer.filter(h => h.estado === 'Pendiente').map(h => [up(h.inmueble), h]));
  const viejo = new Map<string, any>();
  try { XLSX.utils.sheet_to_json(XLSX.readFile(path.resolve('..', 'DATA NAGUANAGUA.xlsx')).Sheets['Record de deudas']).forEach((r: any) => viejo.set(up(r['Código']), r)); } catch { /* opcional */ }
  console.log({ jerarquia: jer.length, inmuebles: inms.length, condominios: condos.length, unidades: unidades.length, huerfanos_pendientes: huerBy.size });

  const hijosDe = new Map<string, string[]>();
  jer.forEach(j => { if (j.padre) { const p = up(j.padre); if (!hijosDe.has(p)) hijosDe.set(p, []); hijosDe.get(p)!.push(up(j.codigo)); } });
  const descendientes = (raiz: string) => jer.filter(j => up(j.raiz) === raiz && j.nivel > 0);

  /** ¿Se puede traer esta unidad? Activa en el sistema nuevo (o huérfano pendiente) y dueño no dado de baja en SIGYR. */
  const unidadValida = (cod: string) => {
    const j = jerBy.get(cod);
    if (j?.dueno_baja) return { ok: false, motivo: 'Dueño dado de baja en SIGYR' };
    const i = inmBy.get(cod);
    if (i) return i.estado === 'Activo' ? { ok: true, fuente: 'inmueble', i } : { ok: false, motivo: `Inmueble ${i.estado} en el sistema nuevo` };
    const h = huerBy.get(cod);
    if (h) return { ok: true, fuente: 'huerfano', h };
    return { ok: false, motivo: 'No existe en el sistema nuevo' };
  };

  const nuevosCondos: any[] = [], nuevasUni: any[] = [], excluidos: any[] = [], unidadesNoTraidas: any[] = [];
  const raices = [...new Set(jer.filter(j => j.nivel === 0).map(j => up(j.codigo)))];
  for (const raiz of raices) {
    if (condoBy.has(raiz) || HMR.has(raiz) || uniBy.has(raiz)) continue;     // ya está en el módulo (o es parte de HMR)
    const p = inmBy.get(raiz);
    if (!p) { excluidos.push({ codigo: raiz, motivo: 'El padre no existe en el sistema nuevo' }); continue; }
    if (p.estado === 'Inactivo') { excluidos.push({ codigo: raiz, nombre: p.contribuyente, motivo: 'Padre INACTIVO en el sistema nuevo (no se trae)' }); continue; }
    const desc = descendientes(raiz);
    const validos = desc.map(d => ({ d, v: unidadValida(up(d.codigo)) }));
    validos.filter(x => !x.v.ok).forEach(x => unidadesNoTraidas.push({ condominio: raiz, unidad: x.d.codigo, motivo: (x.v as any).motivo }));
    const ok = validos.filter(x => x.v.ok);
    const rearmado = p.estado === 'Eliminado';
    if (!ok.length) { excluidos.push({ codigo: raiz, nombre: p.contribuyente, motivo: 'Sin unidades activas' }); continue; }
    // Condominio real = hay dueños distintos al del padre (por cédula de SIGYR o del sistema nuevo)
    const docsHijos = ok.map(x => ({ identidad: (x.v as any).i?.identidad || (x.v as any).h?.identidad || x.d.doc }));
    if (!M.esCondominioReal({ identidad: p.identidad }, docsHijos)) { excluidos.push({ codigo: raiz, nombre: p.contribuyente, motivo: 'Mismo dueño con varios inmuebles → se queda en Contribuyentes' }); continue; }
    if (!rearmado && viejo.get(raiz)?.Uso === 'Individual') { excluidos.push({ codigo: raiz, nombre: p.contribuyente, motivo: 'Era "Individual" en el sistema anterior' }); continue; }

    const esRes = calc.isResidencialInm(p);
    const tipos = new Set(ok.map(x => calc.isResidencialInm((x.v as any).i || { tipo: 'RESIDENCIAL', actividad_principal: (x.v as any).h?.actividad }) ? 'R' : 'C'));
    const tipo = esRes ? (tipos.has('C') ? 'MIXTO' : 'RESIDENCIAL') : (tipos.has('R') ? 'MIXTO' : 'COMERCIAL');
    const modalidad = rearmado ? 'INDIVIDUAL' : M.modalidadSugerida(raiz, esRes);
    const propios = modalidad === 'INDIVIDUAL';
    const mesesPadre = rearmado ? 0 : Math.max(0, parseInt(p.meses_deuda || '0'));
    nuevosCondos.push({
      codigo: raiz, identidad: p.identidad, nombre: p.contribuyente || raiz, tipo, modalidad,
      cant_declarada: Math.max(1, parseInt(p.cant_inmuebles || '0') || 0, ok.length), actividad: p.actividad_principal,
      tarifa_mmv: parseFloat(p.mmv_mes || 0) || null, agente_retencion: !!p.agente_retencion,
      correo: p.correo_electronico || null, telefono: p.telefono || null, direccion: p.direccion || null,
      permite_pago_por_unidad: propios, permite_abonos: true, cobro_tarifa_por_unidad: false,
      aseo_pendiente_desde: M.pendienteDesdeParaMeses(mesesPadre),
      origen: rearmado ? 'SIGYR_REARMADO' : 'SIGYR_NUEVO',
      notas: rearmado ? 'Rearmado desde SIGYR (06/10/2026): el registro padre estaba eliminado; cada unidad paga su deuda.' : 'Agregado desde la jerarquía de SIGYR (06/10/2026).',
      migrado_desde: { inmueble: raiz, estado_padre: p.estado, meses_deuda: p.meses_deuda, cant_inmuebles: p.cant_inmuebles, mmv_mes: p.mmv_mes, fecha: new Date().toISOString() },
    });
    for (const x of ok) {
      const cod = up(x.d.codigo); const i = (x.v as any).i; const h = (x.v as any).h;
      const meses = i ? Math.max(0, parseInt(i.meses_deuda || '0')) : (h?.meses_deuda || 0);
      const act = i?.actividad_principal || h?.actividad || null;
      nuevasUni.push({
        _condo: raiz, _padre: x.d.nivel >= 2 ? up(x.d.padre) : null, _huerfano: h?.id || null,
        inmueble: cod, numero: h?.numero || null, identidad: i?.identidad || h?.identidad || null, propietario: i?.contribuyente || h?.nombre || null,
        actividad: act, tarifa_mmv: i ? (parseFloat(i.mmv_mes || 0) || null) : null,
        estado: /DESOCUPAD/i.test(act || '') ? 'Desocupada' : 'Activa',
        aseo_pendiente_desde: M.pendienteDesdeParaMeses(propios ? meses : mesesPadre),
        es_grupo: (hijosDe.get(cod) || []).length > 0,
      });
    }
  }

  // ── Nietos en condominios que YA están en el módulo ──
  const enlacesExistentes: { id: string; inmueble: string; padre: string }[] = [];
  const gruposExistentes = new Set<string>();
  const nietosNuevosEnModulo: any[] = [];
  for (const c of condos) {
    for (const d of descendientes(up(c.codigo))) {
      const cod = up(d.codigo);
      if (d.nivel < 2) continue;
      const padre = up(d.padre);
      const uPadre = uniBy.get(padre);
      if (!uPadre || uPadre.condominio_id !== c.id) continue;     // la torre no está en este condominio: queda directo
      gruposExistentes.add(uPadre.id);
      const u = uniBy.get(cod);
      if (u) { if (u.condominio_id === c.id && u.padre_unidad_id !== uPadre.id) enlacesExistentes.push({ id: u.id, inmueble: cod, padre }); }
      else {
        const v = unidadValida(cod);
        if (!v.ok) { unidadesNoTraidas.push({ condominio: c.codigo, unidad: cod, motivo: (v as any).motivo }); continue; }
        const i = (v as any).i, h = (v as any).h;
        const propios = c.modalidad === 'INDIVIDUAL' || c.cobro_tarifa_por_unidad;
        const meses = i ? Math.max(0, parseInt(i.meses_deuda || '0')) : (h?.meses_deuda || 0);
        nietosNuevosEnModulo.push({ condominio_id: c.id, _padreId: uPadre.id, _huerfano: h?.id || null, inmueble: cod, identidad: i?.identidad || h?.identidad || null,
          propietario: i?.contribuyente || h?.nombre || null, actividad: i?.actividad_principal || h?.actividad || null, tarifa_mmv: i ? (parseFloat(i.mmv_mes || 0) || null) : null,
          estado: 'Activa', aseo_pendiente_desde: propios ? M.pendienteDesdeParaMeses(meses) : c.aseo_pendiente_desde });
      }
    }
  }

  // Unidades repetidas (una unidad no puede estar en dos condominios)
  const vistos = new Set(uniBy.keys()); const repetidas: any[] = [];
  const nuevasOk = nuevasUni.filter(u => { if (vistos.has(u.inmueble)) { repetidas.push(u); return false; } vistos.add(u.inmueble); return true; });

  // ── Resumen + Excel ──
  const rearm = nuevosCondos.filter(c => c.origen === 'SIGYR_REARMADO');
  const resumen = {
    modo: APLICAR ? 'APLICAR' : 'SIMULACION',
    condominios_rearmados: rearm.length, unidades_rearmados: nuevasOk.filter(u => rearm.some(c => c.codigo === u._condo)).length,
    condominios_nuevos_dueños_distintos: nuevosCondos.length - rearm.length, unidades_nuevos: nuevasOk.filter(u => !rearm.some(c => c.codigo === u._condo)).length,
    torres_en_nuevos: nuevasOk.filter(u => u.es_grupo).length, nietos_en_nuevos: nuevasOk.filter(u => u._padre).length,
    torres_en_existentes: gruposExistentes.size, nietos_enlazados_existentes: enlacesExistentes.length, nietos_agregados_existentes: nietosNuevosEnModulo.length,
    huerfanos_resueltos: nuevasOk.filter(u => u._huerfano).length + nietosNuevosEnModulo.filter(u => u._huerfano).length,
    excluidos: excluidos.length, unidades_no_traidas: unidadesNoTraidas.length, repetidas: repetidas.length,
  };
  console.log(resumen);
  const wb = new ExcelJS.Workbook();
  const hoja = (nombre: string, cols: [string, string, number][], filas: any[]) => {
    const h = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    h.columns = cols.map(([header, key, width]) => ({ header, key, width }));
    filas.forEach(f => h.addRow(f));
    h.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A4A2A' } };
    h.autoFilter = { from: 'A1', to: String.fromCharCode(64 + cols.length) + '1' };
  };
  hoja('Resumen', [['Concepto', 'k', 50], ['Cantidad', 'v', 14]], Object.entries(resumen).map(([k, v]) => ({ k, v })));
  hoja('Condominios a crear', [['Código', 'codigo', 12], ['Nombre', 'nombre', 45], ['RIF', 'identidad', 14], ['Origen', 'origen', 16], ['Tipo', 'tipo', 12], ['Modalidad', 'modalidad', 14], ['Unidades', 'n', 9], ['Torres', 't', 8], ['Declaradas', 'cant_declarada', 10]],
    nuevosCondos.map(c => ({ ...c, n: nuevasOk.filter(u => u._condo === c.codigo).length, t: nuevasOk.filter(u => u._condo === c.codigo && u.es_grupo).length })).sort((a, b) => b.n - a.n));
  hoja('Unidades a crear', [['Condominio', '_condo', 12], ['Torre / sub-grupo', '_padre', 14], ['Unidad', 'inmueble', 12], ['Dueño', 'propietario', 38], ['Cédula', 'identidad', 14], ['Actividad', 'actividad', 30], ['Es torre', 'es_grupo', 8], ['Pendiente desde', 'aseo_pendiente_desde', 14], ['Viene de huérfanos', '_huerfano', 10]],
    nuevasOk.map(u => ({ ...u, es_grupo: u.es_grupo ? 'SÍ' : '', _huerfano: u._huerfano ? 'SÍ' : '' })));
  hoja('Nietos en existentes', [['Unidad', 'inmueble', 12], ['Torre', 'padre', 12], ['Acción', 'a', 20]],
    [...enlacesExistentes.map(e => ({ ...e, a: 'Enlazar a su torre' })), ...nietosNuevosEnModulo.map(n => ({ inmueble: n.inmueble, padre: '', a: 'Agregar' }))]);
  hoja('Se quedan en Contribuyentes', [['Código', 'codigo', 12], ['Nombre', 'nombre', 45], ['Motivo', 'motivo', 60]], excluidos);
  hoja('Unidades NO traídas', [['Condominio', 'condominio', 12], ['Unidad', 'unidad', 12], ['Motivo', 'motivo', 45]], unidadesNoTraidas);
  if (repetidas.length) hoja('Repetidas', [['Unidad', 'inmueble', 12], ['Condominio', '_condo', 12]], repetidas);
  const salida = path.resolve('..', `Condominios_Fase2_${APLICAR ? 'APLICADA' : 'SIMULACION'}.xlsx`);
  await wb.xlsx.writeFile(salida);
  console.log('Excel:', salida);
  if (!APLICAR) process.exit(0);

  // ── Verificar columnas de fase 2 ──
  const chk = await sb.from('condominio_unidades').select('padre_unidad_id, es_grupo').limit(1);
  if (chk.error) throw new Error('Falta ejecutar sql/2026-10-06_condominios_fase2.sql en Supabase: ' + chk.error.message);

  // ── Respaldo ──
  fs.mkdirSync(RESP, { recursive: true });
  const resp = path.join(RESP, `respaldo_condominios_fase2_${Date.now()}.json`);
  fs.writeFileSync(resp, JSON.stringify({ condos, unidades, huerfanos: huer }));
  console.log('Respaldo:', resp);

  // ── Escritura ──
  const idCondo = new Map<string, string>();
  for (let i = 0; i < nuevosCondos.length; i += 100) {
    const { data, error } = await sb.from('condominios').insert(nuevosCondos.slice(i, i + 100)).select('id,codigo');
    if (error) throw new Error('condominios: ' + error.message);
    data!.forEach((d: any) => idCondo.set(up(d.codigo), d.id));
  }
  // Unidades: primero torres (sin padre), luego el resto con su padre
  const idUni = new Map<string, string>();
  const insertar = async (filas: any[]) => {
    for (let i = 0; i < filas.length; i += 400) {
      const lote = filas.slice(i, i + 400).map(({ _condo, _padre, _huerfano, _padreId, ...u }) => ({
        ...u, condominio_id: u.condominio_id || idCondo.get(_condo), padre_unidad_id: _padreId || (_padre ? idUni.get(_padre) || null : null),
      }));
      const { data, error } = await sb.from('condominio_unidades').insert(lote).select('id,inmueble');
      if (error) throw new Error('unidades: ' + error.message);
      data!.forEach((d: any) => idUni.set(up(d.inmueble), d.id));
      await sleep(150);
    }
  };
  await insertar(nuevasOk.filter(u => !u._padre));
  await insertar(nuevasOk.filter(u => u._padre));
  await insertar(nietosNuevosEnModulo);
  for (const e of enlacesExistentes) {
    const padreId = uniBy.get(e.padre)!.id;
    const { error } = await sb.from('condominio_unidades').update({ padre_unidad_id: padreId }).eq('id', e.id);
    if (error) console.warn('enlace', e.inmueble, error.message);
  }
  const grupos = [...gruposExistentes];
  for (let i = 0; i < grupos.length; i += 200) await sb.from('condominio_unidades').update({ es_grupo: true }).in('id', grupos.slice(i, i + 200));
  // Huérfanos resueltos
  const resueltos = [...nuevasOk, ...nietosNuevosEnModulo].filter(u => u._huerfano);
  for (const u of resueltos) {
    await sb.from('huerfanos').update({ estado: 'Asignado a condominio', resuelto_por: 'Sistema (fase 2 condominios)', resuelto_en: new Date().toISOString(),
      resolucion: { condominio: u._condo || null, automatico: true } }).eq('id', u._huerfano).eq('estado', 'Pendiente');
  }
  await sb.from('auditoria').insert({ accion: 'Condominios fase 2: traslado con jerarquía SIGYR', usuario: 'Sistema (autorizado por DZ-Administrador)', detalles: { ...resumen, respaldo: path.basename(resp), _categoria: 'DATOS', criticidad: 'ALTA' } });
  console.log('Fase 2 aplicada.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
