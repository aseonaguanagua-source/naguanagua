import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

interface TrabajadorInfo {
  usuario: string;
  nombre: string;
  letra: string;
  rol: string;
  etiqueta: string;
}

const parseDet = (raw: any): Record<string, any> => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { texto: raw };
    }
  }
  return typeof raw === 'object' ? raw : {};
};

const normKey = (s: any): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export function inferirCategoriaReal(row: any, det: Record<string, any>): string {
  const rawCat = String(row.categoria || det._categoria || '').toUpperCase().trim();
  const accion = String(row.accion || '').toLowerCase();
  const modulo = String(row.modulo || det._modulo || '').toLowerCase();

  if (accion.startsWith('modo dios')) return 'MODO_DIOS';
  if (rawCat === 'CONDOMINIOS' || accion.includes('condominio') || modulo.includes('condominio')) {
    if (accion.includes('cobro')) return 'COBRO';
    if (accion.includes('saldo a favor') || accion.includes('nota de cr')) return 'NOTA_CREDITO';
    return 'CONDOMINIOS';
  }
  if (accion.includes('nota de cr') || accion.includes('saldo a favor') || modulo.includes('nota-credito')) {
    return 'NOTA_CREDITO';
  }
  if (
    rawCat === 'FACTURACION' ||
    accion.includes('factura') ||
    accion.includes('retenci') ||
    modulo.includes('facturacion') ||
    modulo.includes('factura-digital') ||
    modulo.includes('retenciones')
  ) {
    return 'FACTURACION';
  }
  if (rawCat === 'CONCILIACION' || accion.includes('conciliac') || modulo.includes('conciliacion')) {
    return 'CONCILIACION';
  }
  if (rawCat === 'COBRO' || accion.includes('cobro') || accion.includes('abono parcial en caja')) {
    return 'COBRO';
  }
  if (rawCat === 'TRANSFERENCIA' || accion.includes('transferencia registrada') || accion.includes('por verificar')) {
    return 'TRANSFERENCIA';
  }
  if (rawCat === 'TASA' || accion.includes('tasa bcv')) {
    return 'TASA';
  }
  if (
    rawCat === 'DEUDA' ||
    accion.includes('ajuste de deuda') ||
    accion.includes('multa') ||
    accion.includes('exonerac')
  ) {
    return 'DEUDA';
  }
  if (
    rawCat === 'CONTRIBUYENTE' ||
    accion.includes('contribuyente') && !accion.includes('consulta de contribuyente en caja') ||
    accion.includes('cambio de rif') ||
    accion.includes('reactivación')
  ) {
    if (accion.includes('consulta de contribuyente en caja')) return 'CAJA';
    return 'CONTRIBUYENTE';
  }
  if (rawCat === 'SESION' || accion.includes('inicio de sesión') || accion.includes('cierre de sesión')) {
    return 'SESION';
  }
  if (rawCat && rawCat !== 'SISTEMA') return rawCat;
  return rawCat || 'SISTEMA';
}

/**
 * Lectura completa y normalizada de la bitácora de auditoría para el panel admin.
 * Soporta cargar todo el histórico (todos los días) paginando en paralelo en el servidor,
 * unificando todas las variantes de nombres de cada trabajador municipal.
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const desde = sp.get('desde') || '';
    const hasta = sp.get('hasta') || '';
    const usuarioFiltro = (sp.get('usuario') || '').trim();
    const categoria = (sp.get('categoria') || '').trim();
    const accion = (sp.get('accion') || '').trim();
    const searchQ = (sp.get('q') || '').trim();
    const soloConteo = sp.get('count') === '1';
    const incluirConsultas = sp.get('incluir_consultas') === '1';
    const maxLimit = incluirConsultas ? 40000 : 25000;
    const limit = Math.min(parseInt(sp.get('limit') || String(maxLimit)) || maxLimit, 50000);
    const verModoDios = sp.get('modo_dios') === '1' || categoria === 'MODO_DIOS';

    // 1. Cargar catálogo de trabajadores para unificar variantes de usuario
    const { data: trabsData } = await supabaseAdmin
      .from('trabajadores')
      .select('usuario, nombre, letra, rol, estado');

    const trabajadoresMap = new Map<string, TrabajadorInfo>();
    const trabajadoresList: TrabajadorInfo[] = [];

    for (const t of trabsData || []) {
      const login = String(t.usuario || '').trim();
      const nombre = String(t.nombre || login).trim().toUpperCase();
      const letra = String(t.letra || '').trim().toUpperCase();
      const rol = String(t.rol || 'Operador').trim();
      const etiqueta = letra ? `${letra}-${nombre}` : nombre;

      const info: TrabajadorInfo = { usuario: login, nombre, letra, rol, etiqueta };
      trabajadoresList.push(info);

      // Registrar todas las llaves posibles con las que este trabajador aparece en auditoria
      if (login) trabajadoresMap.set(normKey(login), info);
      if (nombre) trabajadoresMap.set(normKey(nombre), info);
      if (letra && nombre) {
        trabajadoresMap.set(normKey(`${letra}-${nombre}`), info);
        trabajadoresMap.set(normKey(`${letra}-${login}`), info);
      }
      if (nombre && login) {
        trabajadoresMap.set(normKey(`${nombre} (${login})`), info);
      }
    }

    // Alias adicionales de administrador
    const dzInfo = trabajadoresMap.get(normKey('dzara')) || {
      usuario: 'dzara',
      nombre: 'DAVID ZARA',
      letra: 'DZ',
      rol: 'Administrador',
      etiqueta: 'DZ-DAVID ZARA',
    };
    ['dzadministrador', 'dzdavidzara', 'administradordzara', 'davidzaradzara'].forEach(k => {
      trabajadoresMap.set(k, dzInfo);
    });

    const resolverTrabajador = (rawUser: any, det: Record<string, any>): TrabajadorInfo => {
      const rawStr = String(rawUser || '').trim();
      if (!rawStr) {
        return { usuario: 'sistema', nombre: 'SISTEMA', letra: '', rol: 'Sistema', etiqueta: 'SISTEMA' };
      }
      if (/^portal\s+/i.test(rawStr) || /^portal-/i.test(rawStr)) {
        const rif = rawStr.replace(/^portal[\s-]+/i, '').trim().toUpperCase();
        return {
          usuario: `Portal ${rif}`,
          nombre: `PORTAL CONTRIBUYENTE (${rif})`,
          letra: '',
          rol: 'Contribuyente Portal',
          etiqueta: `PORTAL (${rif})`,
        };
      }
      if (/^sistema/i.test(rawStr)) {
        return { usuario: 'sistema', nombre: 'SISTEMA AUTOMÁTICO', letra: '', rol: 'Sistema', etiqueta: 'SISTEMA' };
      }

      const kDirect = normKey(rawStr);
      if (trabajadoresMap.has(kDirect)) return trabajadoresMap.get(kDirect)!;

      // Extraer entre paréntesis: ej. "CARLIETH PALENCIA (carlieth)"
      const parenMatch = rawStr.match(/\(([^)]+)\)/);
      if (parenMatch) {
        const kParen = normKey(parenMatch[1]);
        if (trabajadoresMap.has(kParen)) return trabajadoresMap.get(kParen)!;
      }

      // Quitar prefijo de letra: ej. "O-CARLIETH PALENCIA" -> "CARLIETH PALENCIA"
      const sinLetra = rawStr.replace(/^[A-Z]{1,2}\s*-\s*/i, '').trim();
      const kSinLetra = normKey(sinLetra);
      if (trabajadoresMap.has(kSinLetra)) return trabajadoresMap.get(kSinLetra)!;

      // Revisar _usuario_nombre en detalles
      if (det?._usuario_nombre) {
        const kDet = normKey(det._usuario_nombre);
        if (trabajadoresMap.has(kDet)) return trabajadoresMap.get(kDet)!;
      }

      const upper = rawStr.toUpperCase();
      return {
        usuario: rawStr,
        nombre: upper,
        letra: String(det?._usuario_letra || '').toUpperCase(),
        rol: String(det?._usuario_rol || 'Operador'),
        etiqueta: upper,
      };
    };

    const buildQuery = (isCount = false) => {
      let q = isCount
        ? supabaseAdmin.from('auditoria').select('id', { count: 'exact', head: true })
        : supabaseAdmin
            .from('auditoria')
            .select('id, created_at, usuario, accion, categoria, modulo, detalles')
            .order('created_at', { ascending: false });

      if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) q = q.gte('created_at', `${desde}T00:00:00-04:00`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) q = q.lte('created_at', `${hasta}T23:59:59.999-04:00`);
      if (accion) q = q.eq('accion', accion);

      // Si no se piden explícitamente las consultas de lectura de Caja (y no se está filtrando específicamente la categoría CAJA),
      // excluir 'Consulta de Contribuyente en Caja' para que carguen TODOS los días de operaciones reales sin truncarse
      if (!incluirConsultas && categoria !== 'CAJA') {
        q = q.neq('accion', 'Consulta de Contribuyente en Caja');
      }

      if (verModoDios) {
        q = q.ilike('accion', 'MODO DIOS%');
      } else {
        q = q.not('accion', 'ilike', 'MODO DIOS%');
      }

      if (searchQ) {
        const safe = searchQ.replace(/[,()]/g, ' ').trim();
        if (safe) {
          q = q.or(
            [
              `usuario.ilike.%${safe}%`,
              `accion.ilike.%${safe}%`,
              `modulo.ilike.%${safe}%`,
              `detalles->>texto.ilike.%${safe}%`,
              `detalles->>identidad.ilike.%${safe}%`,
              `detalles->>inmueble.ilike.%${safe}%`,
              `detalles->>codigo.ilike.%${safe}%`,
              `detalles->>codigo_inmueble.ilike.%${safe}%`,
              `detalles->>condominio.ilike.%${safe}%`,
              `detalles->>contribuyente.ilike.%${safe}%`,
              `detalles->>referencia.ilike.%${safe}%`,
              `detalles->>referencia_pago.ilike.%${safe}%`,
              `detalles->>referencia_bancaria.ilike.%${safe}%`,
              `detalles->>factura.ilike.%${safe}%`,
              `detalles->>motivo.ilike.%${safe}%`,
              `detalles->>nota.ilike.%${safe}%`,
              `detalles->>_ip.ilike.%${safe}%`,
            ].join(',')
          );
        }
      }
      return q;
    };

    const { count: totalMatchingCount, error: countError } = await buildQuery(true);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if (soloConteo) {
      return NextResponse.json({ count: totalMatchingCount || 0 });
    }

    const totalToFetch = Math.min(totalMatchingCount || 0, limit);
    const pageSize = 1000;
    const ranges: { start: number; end: number }[] = [];
    for (let offset = 0; offset < totalToFetch; offset += pageSize) {
      ranges.push({
        start: offset,
        end: Math.min(offset + pageSize - 1, totalToFetch - 1),
      });
    }

    const allRawRows: any[] = [];
    const concurrency = 6;
    for (let i = 0; i < ranges.length; i += concurrency) {
      const slice = ranges.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map(r => buildQuery(false).range(r.start, r.end))
      );
      for (const res of results) {
        if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
        if (res.data) allRawRows.push(...res.data);
      }
    }

    // Normalizar cada registro (unificar usuario, categoría real y limpiar deuda_previa gigante para aligerar red)
    const normalizedRows: any[] = [];
    for (const r of allRawRows) {
      const det = parseDet(r.detalles);
      if (!verModoDios && det?._categoria === 'MODO_DIOS') continue;

      const trab = resolverTrabajador(r.usuario, det);
      const catReal = inferirCategoriaReal(r, det);

      if (categoria && categoria !== 'TODAS' && catReal !== categoria) continue;
      if (usuarioFiltro && trab.etiqueta !== usuarioFiltro && r.usuario !== usuarioFiltro) continue;

      // Resumir deuda_previa pesada si es un arreglo enorme para no saturar el JSON del navegador
      let cleanDet = det;
      if (Array.isArray(det.deuda_previa) && det.deuda_previa.length > 5) {
        cleanDet = {
          ...det,
          unidades_en_deuda_previa: det.deuda_previa.length,
          deuda_previa: undefined,
        };
      }

      normalizedRows.push({
        id: r.id,
        created_at: r.created_at,
        usuario: trab.etiqueta,
        usuario_original: r.usuario,
        usuario_nombre: trab.nombre,
        usuario_login: trab.usuario,
        usuario_letra: trab.letra,
        usuario_rol: trab.rol,
        accion: r.accion,
        categoria: catReal,
        modulo: r.modulo || det._modulo || '',
        detalles: cleanDet,
      });
    }

    return NextResponse.json({
      data: normalizedRows,
      total_en_bd: totalMatchingCount || normalizedRows.length,
      incluir_consultas: incluirConsultas,
      trabajadores: trabajadoresList.map(t => ({
        etiqueta: t.etiqueta,
        nombre: t.nombre,
        usuario: t.usuario,
        letra: t.letra,
        rol: t.rol,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 });
  }
}
