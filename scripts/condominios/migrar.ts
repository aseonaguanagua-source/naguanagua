/**
 * MIGRACIÓN DE CONDOMINIOS: inmuebles → condominios / condominio_unidades
 *
 *   Simulación (no escribe nada, genera Excel de cuadre):
 *     npx tsx --tsconfig tsconfig.json scripts/condominios/migrar.ts
 *   Aplicar (requiere haber revisado el Excel):
 *     npx tsx --tsconfig tsconfig.json scripts/condominios/migrar.ts --aplicar
 *
 * NO modifica la tabla `inmuebles`. Solo llena las tablas nuevas del módulo.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
Object.assign(process.env, env);

const APLICAR = process.argv.includes('--aplicar');
const COLS = 'id,inmueble,identidad,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,meses_deuda,deuda_mmv,multa_bs,deuda_congelada_bs,estado,es_condominio,condominio_padre_id,agente_retencion,correo_electronico,telefono';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Decisiones del municipio (06/10/2026) */
const FORZAR_CONDOMINIO: Record<string, { cant_declarada?: number; cobro_tarifa_por_unidad?: boolean; modalidad?: string; unidades?: string[]; nota: string }> = {
  URB016822: { cant_declarada: 565, nota: 'C.C. FREE MARKET: condominio de 565 unidades (confirmado)' },
  URB009841: {
    cant_declarada: 39, cobro_tarifa_por_unidad: true, modalidad: 'CENTRALIZADO',
    // Locales de HMR con su propia actividad; el condominio paga todo
    unidades: ['URB009575', 'URB009651', 'URB009803', 'URB009613', 'URB009727', 'URB009689', 'URB009423', 'URB009461', 'URB009499', 'URB009765', 'URB009537', 'URB018655'],
    nota: 'INVERSIONES HMR: condominio paga completo, cada local con su propia actividad (confirmado)',
  },
};
/** Inmuebles que NO deben tratarse como condominio propio (son unidades de otro) */
const ABSORBIDOS = new Set(Object.values(FORZAR_CONDOMINIO).flatMap(f => f.unidades || []));
/** Identidades cuyas copias colgantes no son unidades reales */
const IGNORAR_HIJOS_DE_PADRES = ABSORBIDOS;

(async () => {
  const { supabaseAdmin: sb } = await import('@/lib/supabaseAdmin');
  const calc = await import('@/lib/calculos');
  const M = await import('@/lib/condominios/motor');
  const ExcelJS = createRequire(path.join(process.cwd(), 'package.json'))('exceljs');

  const { data: cfg } = await sb.from('sistema_config').select('id, valor').in('id', ['tasa_bcv_manual', 'tasa_bcv_semanal']);
  const tasa = parseFloat(String(cfg?.find((c: any) => c.id === 'tasa_bcv_manual')?.valor || 0)) ||
    parseFloat(String(cfg?.find((c: any) => c.id === 'tasa_bcv_semanal')?.valor || 0));
  if (!tasa) throw new Error('Sin tasa BCV');

  if (APLICAR) {
    const { count } = await sb.from('condominio_movimientos').select('id', { count: 'exact', head: true });
    if ((count || 0) > 0) throw new Error(`Ya hay ${count} movimientos registrados en el módulo: no se puede re-migrar encima.`);
  }

  // Lectura por cursor, lotes de 1000 con pausa (no satura la BD)
  const all: any[] = [];
  let lastId: string | null = null;
  for (;;) {
    let q = sb.from('inmuebles').select(COLS).order('id').limit(1000);
    if (lastId) q = q.gt('id', lastId);
    const { data, error } = await q;
    if (error) { console.warn('reintento', error.message); await sleep(3000); continue; }
    if (!data?.length) break;
    all.push(...data);
    lastId = data[data.length - 1].id;
    process.stdout.write(`\r${all.length} inmuebles leídos`);
    await sleep(150);
  }
  console.log('');

  const byCode = new Map(all.map(i => [String(i.inmueble || '').toUpperCase(), i]));
  const hijosDe = new Map<string, any[]>();
  for (const i of all) {
    const p = String(i.condominio_padre_id || '').toUpperCase();
    if (!p || i.estado === 'Eliminado') continue;
    if (!hijosDe.has(p)) hijosDe.set(p, []);
    hijosDe.get(p)!.push(i);
  }

  const candidatos = all.filter(i => i.estado !== 'Eliminado' && (
    i.es_condominio === true || parseInt(i.cant_inmuebles || '0') > 1 || hijosDe.has(String(i.inmueble || '').toUpperCase())));

  const condos: any[] = [];
  const unidades: any[] = [];
  const reporte: any[] = [];
  const excluidos: any[] = [];

  for (const p of candidatos) {
    const code = String(p.inmueble || '').toUpperCase();
    const forz = FORZAR_CONDOMINIO[code];
    if (ABSORBIDOS.has(code)) { excluidos.push({ codigo: code, nombre: p.contribuyente, motivo: 'Es local de otro condominio (HMR)' }); continue; }
    // Un padre que a su vez cuelga de otro condominio válido no es condominio propio
    const padreDe = String(p.condominio_padre_id || '').toUpperCase();
    if (!forz && padreDe && byCode.has(padreDe) && byCode.get(padreDe).estado !== 'Eliminado') {
      excluidos.push({ codigo: code, nombre: p.contribuyente, motivo: `Cuelga de ${padreDe}` }); continue;
    }

    const hijos = forz?.unidades
      ? forz.unidades.map(c => byCode.get(c)).filter(Boolean)
      : (IGNORAR_HIJOS_DE_PADRES.has(code) ? [] : (hijosDe.get(code) || []));

    if (!forz && !M.esCondominioReal(p, hijos)) {
      excluidos.push({ codigo: code, nombre: p.contribuyente, motivo: 'Mismo dueño con varias actividades → se queda en Contribuyentes' });
      continue;
    }

    const esRes = calc.isResidencialInm(p);
    const tiposHijos = new Set(hijos.map((h: any) => calc.isResidencialInm(h) ? 'R' : 'C'));
    const tipo = esRes ? (tiposHijos.has('C') ? 'MIXTO' : 'RESIDENCIAL') : (tiposHijos.has('R') ? 'MIXTO' : 'COMERCIAL');
    const modalidad = (forz?.modalidad || M.modalidadSugerida(code, esRes)) as any;
    const cant = forz?.cant_declarada || Math.max(1, parseInt(p.cant_inmuebles || '1'));
    const porUnidad = !!forz?.cobro_tarifa_por_unidad;
    const mesesPadre = Math.max(0, parseInt(p.meses_deuda || '0'));

    const condo = {
      codigo: code, identidad: p.identidad, nombre: p.contribuyente || code, tipo, modalidad,
      cant_declarada: cant, actividad: p.actividad_principal, tarifa_mmv: parseFloat(p.mmv_mes || 0) || null,
      agente_retencion: !!p.agente_retencion, correo: p.correo_electronico || null, telefono: p.telefono || null, direccion: p.direccion || null,
      cobro_tarifa_por_unidad: porUnidad,
      permite_pago_por_unidad: modalidad === 'INDIVIDUAL',
      permite_abonos: true,
      aseo_pendiente_desde: M.pendienteDesdeParaMeses(mesesPadre),
      notas: forz?.nota || null,
      migrado_desde: { inmueble: code, cant_inmuebles: p.cant_inmuebles, meses_deuda: p.meses_deuda, deuda_mmv: p.deuda_mmv, multa_bs: p.multa_bs, deuda_congelada_bs: p.deuda_congelada_bs, mmv_mes: p.mmv_mes, fecha: new Date().toISOString() },
    };
    const propios = modalidad === 'INDIVIDUAL' || porUnidad;
    const uRows = hijos.map((h: any) => ({
      _codigo: code,
      inmueble: String(h.inmueble).toUpperCase(), identidad: h.identidad, propietario: h.contribuyente,
      actividad: h.actividad_principal, tarifa_mmv: parseFloat(h.mmv_mes || 0) || null,
      estado: /DESOCUPAD/i.test(h.actividad_principal || '') ? 'Desocupada' : 'Activa',
      // Pago individual / tarifa por unidad: cada unidad arrastra su propia deuda; si no, la del condominio
      aseo_pendiente_desde: M.pendienteDesdeParaMeses(propios ? Math.max(0, parseInt(h.meses_deuda || '0')) : mesesPadre),
      _meses: propios ? Math.max(0, parseInt(h.meses_deuda || '0')) : mesesPadre,
    }));
    condos.push(condo);
    unidades.push(...uRows);

    // ── Cuadre: deuda nueva (motor) vs deuda que calcula Caja hoy ──
    const cMotor = { ...condo, tarifa_mmv: condo.tarifa_mmv ?? undefined } as any;
    const reparto = M.cargosPorUnidad(cMotor, uRows.map(u => ({ id: u.inmueble, inmueble: u.inmueble, actividad: u.actividad, tarifa_mmv: u.tarifa_mmv, estado: u.estado as any })), tasa);
    let deudaNueva = 0;
    for (const r of reparto) {
      const u = uRows.find(x => x.inmueble === r.clave);
      const meses = u ? u._meses : mesesPadre;
      deudaNueva += M.deudaPorMeses(meses, r.montoBs, esRes, condo.agente_retencion).totalBs;
    }
    const deudaCaja = (inm: any) => {
      const meses = Math.max(0, parseInt(inm.meses_deuda || '0'));
      if (!meses) return 0;
      const res = calc.isResidencialInm(inm);
      const b = calc.calcularMensualidad(inm, tasa);
      return b * meses + b * (res ? 0.1 : 0.12) * Math.max(0, meses - 1) + (res ? 0 : b * 0.16 * meses);
    };
    const cajaHoy = r2(deudaCaja(p) + (propios ? hijos.reduce((s: number, h: any) => s + deudaCaja(h), 0) : 0));
    reporte.push({
      codigo: code, nombre: condo.nombre, tipo, modalidad, por_unidad: porUnidad ? 'SÍ' : '', declarada: cant,
      unidades: uRows.length, sin_registrar: reparto.find(r => r.clave === M.SIN_REGISTRAR)?.cantidad || 0,
      meses: mesesPadre, mensual: r2(M.cargoMensual(cMotor, uRows as any, tasa).condominioBs),
      caja_hoy: cajaHoy, deuda_nueva: r2(deudaNueva), diferencia: r2(deudaNueva - cajaHoy), nota: forz?.nota || '',
    });
  }

  // Unidades repetidas en dos condominios: se queda en el primero y se reporta
  const vistos = new Set<string>();
  const duplicadas: any[] = [];
  const unidadesOk = unidades.filter(u => { if (vistos.has(u.inmueble)) { duplicadas.push(u); return false; } vistos.add(u.inmueble); return true; });

  // ── Excel de cuadre ──
  const wb = new ExcelJS.Workbook();
  const h1 = wb.addWorksheet('Cuadre', { views: [{ state: 'frozen', ySplit: 1 }] });
  h1.columns = [
    { header: 'Código', key: 'codigo', width: 12 }, { header: 'Nombre', key: 'nombre', width: 38 }, { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Modalidad', key: 'modalidad', width: 17 }, { header: 'Tarifa por local', key: 'por_unidad', width: 9 },
    { header: 'Declaradas', key: 'declarada', width: 10 }, { header: 'Unidades', key: 'unidades', width: 9 }, { header: 'Sin registrar', key: 'sin_registrar', width: 9 },
    { header: 'Meses', key: 'meses', width: 7 }, { header: 'Mensualidad Bs', key: 'mensual', width: 15 },
    { header: 'Deuda Caja hoy Bs', key: 'caja_hoy', width: 17 }, { header: 'Deuda nueva Bs', key: 'deuda_nueva', width: 17 },
    { header: 'Diferencia Bs', key: 'diferencia', width: 15 }, { header: 'Nota', key: 'nota', width: 50 },
  ];
  reporte.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).forEach(r => h1.addRow(r));
  h1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A4A2A' } };
  ['J', 'K', 'L', 'M'].forEach(c => { h1.getColumn(c).numFmt = '#,##0.00'; });
  h1.autoFilter = { from: 'A1', to: 'N1' };
  const h2 = wb.addWorksheet('Se quedan en Contribuyentes');
  h2.columns = [{ header: 'Código', key: 'codigo', width: 12 }, { header: 'Nombre', key: 'nombre', width: 40 }, { header: 'Motivo', key: 'motivo', width: 60 }];
  excluidos.forEach(e => h2.addRow(e)); h2.getRow(1).font = { bold: true };
  if (duplicadas.length) {
    const h3 = wb.addWorksheet('Unidades repetidas');
    h3.columns = [{ header: 'Unidad', key: 'inmueble', width: 12 }, { header: 'Condominio', key: '_codigo', width: 12 }];
    duplicadas.forEach(d => h3.addRow(d));
  }
  const tot = (k: string) => r2(reporte.reduce((s, r) => s + r[k], 0));
  const salida = path.resolve('..', `Migracion_Condominios_${APLICAR ? 'APLICADA' : 'SIMULACION'}.xlsx`);
  await wb.xlsx.writeFile(salida);
  console.log(JSON.stringify({ modo: APLICAR ? 'APLICAR' : 'SIMULACION', tasa, condominios: condos.length, unidades: unidadesOk.length, repetidas: duplicadas.length, excluidos: excluidos.length, caja_hoy: tot('caja_hoy'), deuda_nueva: tot('deuda_nueva'), excel: salida }));

  if (!APLICAR) process.exit(0);

  // ── Escritura (solo tablas nuevas) ──
  await sb.from('condominio_unidades').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await sb.from('condominios').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const idPorCodigo = new Map<string, string>();
  for (let i = 0; i < condos.length; i += 200) {
    const { data, error } = await sb.from('condominios').insert(condos.slice(i, i + 200)).select('id,codigo');
    if (error) throw new Error(`condominios lote ${i}: ${error.message}`);
    data!.forEach((d: any) => idPorCodigo.set(d.codigo, d.id));
    await sleep(200);
  }
  const filas = unidadesOk.map(({ _codigo, _meses, ...u }) => ({ ...u, condominio_id: idPorCodigo.get(_codigo) }));
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await sb.from('condominio_unidades').insert(filas.slice(i, i + 500));
    if (error) throw new Error(`unidades lote ${i}: ${error.message}`);
    process.stdout.write(`\r${Math.min(i + 500, filas.length)}/${filas.length} unidades`);
    await sleep(200);
  }
  await sb.from('auditoria').insert({ accion: 'Migración módulo condominios', usuario: 'Sistema', detalles: { condominios: condos.length, unidades: filas.length, _categoria: 'DATOS', criticidad: 'ALTA' } });
  console.log('\nMigración aplicada.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
