// PDF con TODO lo que se aplica en el saneamiento global + eliminación de lo que no existe en SIGYR.
// npx tsx scripts/saneamiento/pdf_plan_global.ts -> naguanagua_zero/Plan_Saneamiento_Global.pdf
import fs from 'fs';
const DIR = '/Users/davidzara/Documents/naguanagua_zero/SQL_GLOBAL';
const SCR = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/global';
const OUT = '/Users/davidzara/Documents/naguanagua_zero/Plan_Saneamiento_Global.pdf';

(async () => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const { logos } = await import('../../src/lib/logosBase64');
  const res = JSON.parse(fs.readFileSync(`${DIR}/resumen.json`, 'utf8'));
  const elim = JSON.parse(fs.readFileSync(`${SCR}/eliminar.json`, 'utf8'));
  const lineas = (pref: string) => fs.readdirSync(DIR).filter(f => f.startsWith(pref)).sort().flatMap(f => fs.readFileSync(`${DIR}/${f}`, 'utf8').split(/\r?\n/)).filter(l => /^(UPDATE|INSERT)/.test(l));
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297; let y = 0;
  const titulo = (t: string) => { doc.addPage(); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(t, 10, 14); y = 18; };
  const tabla = (head: string[], body: any[][], color: [number, number, number] = [22, 101, 52], fs_ = 7.5) => {
    autoTable(doc, { startY: y, head: [head], body, theme: 'grid', styles: { fontSize: fs_, cellPadding: 1.2 }, headStyles: { fillColor: color }, margin: { left: 10, right: 10 } });
    y = (doc as any).lastAutoTable.finalY + 6;
  };
  const parrafo = (t: string) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); const ls = doc.splitTextToSize(t, W - 20); doc.text(ls, 10, y); y += ls.length * 4.2 + 2; };

  // ── Portada / resumen
  try { doc.addImage(logos.iamec, 'PNG', 10, 4, 26, 14); } catch { /* */ }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('PLAN DE SANEAMIENTO GLOBAL - CONTRIBUYENTES Y CONDOMINIOS', W / 2, 13, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Fuente de verdad: sistema viejo SIGYR (export 05/10/2026) · Generado ${new Date().toLocaleString('es-VE')}`, W / 2, 19, { align: 'center' });
  y = 25;
  const e = elim;
  tabla(['#', 'PASO', 'QUÉ SE HACE', 'REGISTROS', 'CÓMO SE DESHACE'], [
    ['0', 'Respaldo', 'Copia completa de inmuebles, condominios y locales (JSON) antes de tocar nada', 'todo', '—'],
    ['1', 'Tarifas F.O.', 'Tarifas guardadas en UCD (F.O. × 0,137) pasan a su F.O. oficial de la ordenanza. SUBE EL COBRO a lo correcto.', `${res.tarifasUCDaFO.inmuebles} contribuyentes + ${res.tarifasUCDaFO.unidades} locales`, 'Respaldo paso 0'],
    ['2', 'Números de local', 'Número de local/casa del sistema viejo, SOLO donde está vacío', `${res.locales.inmuebles} + ${res.locales.unidades}`, 'Respaldo paso 0'],
    ['3', 'Padres N/A', 'Cada actividad queda ligada a su N/A (el N/A cobra la suma de sus actividades, nunca doble)', `${res.padresNA.inmueblesPadre} + ${res.padresNA.nietosLigados} nietos + ${res.padresNA.gruposMarcados} grupos`, 'Respaldo paso 0'],
    ['4', 'Meses pagados (individual)', 'Revisión: ningún contribuyente tiene meses ya pagados que volvieron', `${res.mesesPagadosQueVolvieron.revisados} revisados, 0 casos`, '—'],
    ['5', 'Meses pagados (condominios)', 'Locales a los que les volvieron períodos ya pagados: se corrige el "pendiente desde". Causa corregida en el código.', `${res.condominiosPeriodosPagadosQueVolvieron.unidades} locales`, 'Respaldo paso 0'],
    ['6', 'Locales faltantes', 'Se agregan al módulo los locales vivos en SIGYR que faltaban (N/A anidados se aplanan)', `${res.localesFaltantesEnModulo.hijos} hijos + ${res.localesFaltantesEnModulo.nietos} nietos`, 'Respaldo paso 0'],
    ['7', 'Eliminar lo que no existe en SIGYR', 'Se marcan como "Eliminado" (no se borran físicamente) los códigos eliminados o inexistentes en el sistema viejo, sin pagos y creados antes del corte', `${e.inmuebles.eliminar.length} contribuyentes, ${e.unidades.eliminar.length} locales, ${e.condominios.eliminar.length} condominios`, 'Volver estado anterior (respaldo)'],
    ['8', 'Servicios especiales', 'Tabla de tarifas y columnas nuevas (requiere SQL Editor: es cambio de estructura)', 'DDL', 'DROP de lo creado'],
  ], [22, 101, 52], 8);
  parrafo('Protecciones: no se elimina nada que tenga pagos, que se haya creado después del 05/10/2026 o en el módulo de condominios (van a REVISIÓN). Cada UPDATE solo actúa si el dato todavía tiene el valor esperado. Las eliminaciones son lógicas (estado), reversibles.');
  parrafo(`Revisión manual: ${e.inmuebles.revisar.length} contribuyentes y ${e.unidades.revisar.length} locales que no existen en SIGYR pero tienen pagos o son nuevos; ${res.mesesPagadosQueVolvieron.revisarManual.length} con "AJUSTE DE DEUDA"; ${Object.keys(res.condominiosFueraDelModulo).length} padres grandes (N/A/condominios) fuera del módulo.`);

  // ── 1
  titulo(`PASO 1 · Tarifas guardadas en UCD -> F.O. oficial (${res.tarifasUCDaFO.inmuebles + res.tarifasUCDaFO.unidades})`);
  tabla(['TABLA', 'CÓDIGO / ID', 'VALOR ACTUAL', 'F.O. OFICIAL'], lineas('01_').map(l => {
    let m = l.match(/UPDATE inmuebles SET mmv_mes=([\d.]+) WHERE inmueble='([^']+)' AND mmv_mes=([\d.]+)/);
    if (m) return ['inmuebles', m[2], m[3], m[1]];
    m = l.match(/UPDATE condominio_unidades SET tarifa_mmv=([\d.]+) WHERE id='([^']+)'/);
    return ['condominio_unidades', m?.[2] || '', '(UCD)', m?.[1] || ''];
  }), [30, 64, 175], 6.5);
  // ── 2
  titulo('PASO 2 · Números de local (solo donde está vacío) — muestra de 120');
  parrafo(`Total: ${res.locales.inmuebles} contribuyentes y ${res.locales.unidades} locales de condominio. Listado completo en SQL_GLOBAL/02_locales_parte1..5.sql`);
  tabla(['TABLA', 'CÓDIGO / ID', 'NÚMERO'], lineas('02_').slice(0, 120).map(l => {
    const m = l.match(/UPDATE (\w+) SET \w+='((?:[^']|'')*)' WHERE \w+='([^']+)'/); return [m?.[1], m?.[3], m?.[2]];
  }), [30, 64, 175], 6.5);
  // ── 3
  titulo('PASO 3 · Estructura N/A (hijo -> padre)');
  tabla(['TABLA', 'REGISTRO', 'CAMBIO'], lineas('03_').map(l => {
    let m = l.match(/UPDATE inmuebles SET padre_id='([^']+)' WHERE inmueble='([^']+)'/); if (m) return ['inmuebles', m[2], `padre N/A = ${m[1]}`];
    m = l.match(/UPDATE condominio_unidades SET (\w+)=('?[^' ]+'?) WHERE id='([^']+)'/); return ['condominio_unidades', m?.[3], `${m?.[1]} = ${m?.[2]}`];
  }), [30, 64, 175], 6.5);
  // ── 5
  titulo(`PASO 5 · Condominios: períodos ya pagados que volvieron (${res.condominiosPeriodosPagadosQueVolvieron.unidades})`);
  tabla(['LOCAL', 'PENDIENTE DESDE (HOY)', 'CORRECTO (pagó hasta)'], lineas('05_').map(l => {
    const m = l.match(/SET aseo_pendiente_desde='([^']+)' .* aseo_pendiente_desde='([^']+)'; -- (\S+):/); return [m?.[3], m?.[2], m?.[1]];
  }), [30, 64, 175], 6.5);
  // ── 6
  titulo(`PASO 6 · Locales que faltan en el módulo (${res.localesFaltantesEnModulo.hijos + res.localesFaltantesEnModulo.nietos})`);
  tabla(['CÓDIGO', 'NÚMERO', 'PROPIETARIO', 'ACTIVIDAD', 'F.O.', 'N/A', 'HIJO DE'], lineas('06_').map(l => {
    const m = l.match(/SELECT '[^']+', '([^']+)', ('(?:[^']|'')*'|NULL), ('(?:[^']|'')*'|NULL), ('(?:[^']|'')*'|NULL), ('(?:[^']|'')*'|NULL), ([\d.]+|NULL), 'Activa', (true|false), (\(SELECT[^)]*inmueble='([^']+)'[^)]*\)|NULL)/);
    const u = (s?: string) => (s || '').replace(/^'|'$/g, '').replace(/''/g, "'").replace(/^NULL$/, '');
    return m ? [m[1], u(m[2]), u(m[4]), u(m[5]), u(m[6]), m[7] === 'true' ? 'SÍ' : '', m[9] || '(condominio)'] : [l.slice(0, 60)];
  }), [30, 64, 175], 6.5);
  // ── 7
  titulo(`PASO 7 · Se ELIMINAN (estado "Eliminado") — no existen en el sistema viejo (${e.inmuebles.eliminar.length + e.unidades.eliminar.length + e.condominios.eliminar.length})`);
  parrafo('Condominios a eliminar: ' + (e.condominios.eliminar.length ? e.condominios.eliminar.map((c: any) => c.codigo).join(', ') : 'NINGUNO (todos existen en SIGYR)') + '. Locales de condominio a eliminar: ' + (e.unidades.eliminar.length || 'NINGUNO') + '.');
  tabla(['CÓDIGO', 'CONTRIBUYENTE', 'ESTADO HOY', 'MOTIVO'], e.inmuebles.eliminar.map((x: any) => [x.inmueble, x.contribuyente || '', x.estado, x.motivo]), [153, 27, 27], 6.5);
  titulo('NO se eliminan — requieren revisión (tienen pagos o se crearon después del corte)');
  tabla(['TIPO', 'CÓDIGO', 'CONDOMINIO / NOMBRE', 'MOTIVO SIGYR', 'POR QUÉ NO SE ELIMINA'], [
    ...e.condominios.revisar.map((x: any) => ['Condominio', x.codigo, x.nombre, x.motivo, x.razonRevisar]),
    ...e.unidades.revisar.map((x: any) => ['Local', x.inmueble, x.condominio, x.motivo, x.razonRevisar]),
    ...e.inmuebles.revisar.map((x: any) => ['Contribuyente', x.inmueble, x.contribuyente || '', x.motivo, x.razonRevisar]),
  ], [180, 120, 0], 7);
  tabla(['PADRE (N/A o condominio fuera del módulo)', 'HIJOS VIVOS EN SIGYR'], Object.entries(res.condominiosFueraDelModulo).map(([k, v]) => [k, String(v)]), [180, 120, 0], 7);
  tabla(['CÓDIGO', 'DEBÍA', 'PAGÓ', 'DEBE HOY', 'MOTIVO'], res.mesesPagadosQueVolvieron.revisarManual.map((x: any) => [x.cod, x.previa, x.pagados, x.actual, x.motivo]), [180, 120, 0], 7);
  // ── Modo Dios
  titulo('MODO DIOS (modo desarrollador)');
  parrafo('Al activar el modo desarrollador (doble clic en el logo + clave) aparece el botón "MODO DIOS" en todas las pantallas administrativas:');
  [
    '• Alt + clic sobre cualquier código, cédula o RIF de la pantalla abre su ficha con TODOS los campos editables y una ayuda debajo de cada campo.',
    '• "Cambiar código en todo el sistema" y "Cambiar cédula/RIF en todo el sistema": muestra en qué tablas aparece y lo cambia en todas a la vez.',
    '• "Todas las tablas": cualquier tabla de la base de datos (pagos, facturas, usuarios, condominios...) con edición celda por celda (doble clic, Enter guarda), crear y eliminar filas.',
    '• Cada cambio pide confirmación mostrando "antes -> después", se guarda en la base de datos y queda en auditoría.',
    '• "Historial / deshacer": lista de todos los cambios del Modo Dios con botón para volver al valor anterior.',
    '• Seguridad: solo funciona con sesión de Administrador + clave de desarrollador.',
  ].forEach(parrafo);

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.text(`IAMEC · Plan de saneamiento global · Página ${i} de ${n}`, W / 2, 205, { align: 'center' }); }
  fs.writeFileSync(OUT, Buffer.from(doc.output('arraybuffer')));
  console.log('PDF', OUT, n, 'páginas');
})();
