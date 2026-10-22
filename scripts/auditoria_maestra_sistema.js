const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
  } catch(e) {}
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runMasterAudit() {
  console.log('====================================================================');
  console.log('AUDITORÍA MAESTRA SENIOR: INTEGRIDAD, BASES DE DATOS Y FLUJOS');
  console.log('====================================================================\n');

  const hallazgos = {
    contribuyentes: { total: 0, cedulasInvalidas: 0, sinNombre: 0, telefonosInvalidos: 0, emailsInvalidos: 0 },
    inmuebles: { total: 0, sinDireccion: 0, deudasNegativas: 0, mesesDeudaIncoherentes: 0, sinPropietario: 0, direccionesExcedidas: 0 },
    condominios: { total: 0, unidadesTotales: 0, unidadesHuerfanas: 0, sinPadre: 0 },
    pagos: { total: 0, jsonInvalido: 0, sinReferencia: 0, duplicados: 0, aprobadosSinFactura: 0 },
    facturas: { total: 0, sinMonto: 0, sinContribuyente: 0 }
  };

  // 1. AUDITORÍA DE CONTRIBUYENTES
  console.log('--- 1. AUDITANDO TABLA CONTRIBUYENTES ---');
  let offset = 0;
  const batchSize = 1000;
  let hayMas = true;
  const cedulasSet = new Set();
  let duplicadosCedula = 0;

  while (hayMas) {
    const { data, error } = await supabase
      .from('contribuyentes')
      .select('identidad, nombre, telefono, email')
      .range(offset, offset + batchSize - 1);

    if (error || !data || data.length === 0) {
      hayMas = false;
      break;
    }

    hallazgos.contribuyentes.total += data.length;
    for (const c of data) {
      const iden = (c.identidad || '').trim().toUpperCase();
      if (!iden || iden.length < 3) {
        hallazgos.contribuyentes.cedulasInvalidas++;
      } else {
        if (cedulasSet.has(iden)) {
          duplicadosCedula++;
        } else {
          cedulasSet.add(iden);
        }
      }

      if (!c.nombre || c.nombre.trim().length === 0) {
        hallazgos.contribuyentes.sinNombre++;
      }

      if (c.email && (!c.email.includes('@') || !c.email.includes('.'))) {
        hallazgos.contribuyentes.emailsInvalidos++;
      }
    }

    offset += batchSize;
    if (data.length < batchSize) hayMas = false;
  }
  console.log(`Contribuyentes analizados: ${hallazgos.contribuyentes.total}`);
  console.log(`- Cédulas/RIFs inválidos: ${hallazgos.contribuyentes.cedulasInvalidas}`);
  console.log(`- Sin nombre / razón social: ${hallazgos.contribuyentes.sinNombre}`);
  console.log(`- Cédulas duplicadas: ${duplicadosCedula}`);
  console.log(`- Correos mal formateados: ${hallazgos.contribuyentes.emailsInvalidos}\n`);

  // 2. AUDITORÍA DE INMUEBLES
  console.log('--- 2. AUDITANDO TABLA INMUEBLES (51,553 registros) ---');
  offset = 0;
  hayMas = true;
  let muestrasInmueble = [];

  while (hayMas) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, direccion, estado, meses_deuda, deuda_mmv, numero_local, licencia')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error leyendo inmuebles:', error);
      hayMas = false;
      break;
    }

    if (!data || data.length === 0) {
      hayMas = false;
      break;
    }

    hallazgos.inmuebles.total += data.length;
    for (const inm of data) {
      if (!inm.direccion || inm.direccion.trim().length === 0) {
        hallazgos.inmuebles.sinDireccion++;
      }
      if (inm.deuda_mmv < 0 || inm.meses_deuda < 0) {
        hallazgos.inmuebles.deudasNegativas++;
      }
      if (inm.meses_deuda > 0 && (inm.deuda_mmv === null || inm.deuda_mmv === 0)) {
        hallazgos.inmuebles.mesesDeudaIncoherentes++;
      }
      if (!inm.identidad) {
        hallazgos.inmuebles.sinPropietario++;
      }
      if (inm.direccion && inm.direccion.length > 150) {
        hallazgos.inmuebles.direccionesExcedidas++;
      }
    }

    offset += batchSize;
    if (data.length < batchSize) hayMas = false;
  }
  console.log(`Inmuebles analizados: ${hallazgos.inmuebles.total}`);
  console.log(`- Sin dirección: ${hallazgos.inmuebles.sinDireccion}`);
  console.log(`- Deudas negativas: ${hallazgos.inmuebles.deudasNegativas}`);
  console.log(`- Meses deuda > 0 con Deuda MMV = 0: ${hallazgos.inmuebles.mesesDeudaIncoherentes}`);
  console.log(`- Sin RIF/Cédula asignada: ${hallazgos.inmuebles.sinPropietario}`);
  console.log(`- Direcciones excesivamente largas (>150 car.): ${hallazgos.inmuebles.direccionesExcedidas}\n`);

  // 3. AUDITORÍA DE CONDOMINIOS Y UNIDADES
  console.log('--- 3. AUDITANDO CONDOMINIOS Y UNIDADES ---');
  const { data: conds, error: errCond } = await supabase
    .from('condominios')
    .select('id, codigo, nombre, identidad, aseo_pendiente_desde, cant_declarada');

  if (errCond) console.error('Error leyendo condominios:', errCond);
  hallazgos.condominios.total = conds ? conds.length : 0;
  console.log(`Condominios registrados: ${hallazgos.condominios.total}`);

  const { count: countUnidades, error: errUnid } = await supabase
    .from('condominio_unidades')
    .select('*', { count: 'exact', head: true });

  hallazgos.condominios.unidadesTotales = countUnidades || 0;
  console.log(`Unidades de condominio: ${hallazgos.condominios.unidadesTotales}`);

  // 4. AUDITORÍA DE PAGOS REPORTADOS
  console.log('\n--- 4. AUDITANDO PAGOS REPORTADOS ---');
  offset = 0;
  hayMas = true;
  const refSet = new Set();
  let refDuplicadas = 0;

  while (hayMas) {
    const { data, error } = await supabase
      .from('pagos_reportados')
      .select('id, referencia, monto, estado, tipo, detalles')
      .range(offset, offset + batchSize - 1);

    if (error || !data || data.length === 0) {
      hayMas = false;
      break;
    }

    hallazgos.pagos.total += data.length;
    for (const p of data) {
      const ref = (p.referencia || '').trim();
      if (!ref) {
        hallazgos.pagos.sinReferencia++;
      } else {
        if (refSet.has(ref)) {
          refDuplicadas++;
        } else {
          refSet.add(ref);
        }
      }

      let parsed = null;
      try {
        parsed = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : p.detalles;
      } catch(e) {
        hallazgos.pagos.jsonInvalido++;
      }

      if (p.estado === 'Aprobado') {
        const fd = parsed?.factura_digital;
        if (!fd?.emitida && !fd?.numero_documento && !fd?.url) {
          hallazgos.pagos.aprobadosSinFactura++;
        }
      }
    }

    offset += batchSize;
    if (data.length < batchSize) hayMas = false;
  }
  console.log(`Pagos reportados analizados: ${hallazgos.pagos.total}`);
  console.log(`- Referencias vacías: ${hallazgos.pagos.sinReferencia}`);
  console.log(`- Referencias duplicadas en BD: ${refDuplicadas}`);
  console.log(`- JSON detalles corrupto: ${hallazgos.pagos.jsonInvalido}`);
  console.log(`- Pagos Aprobados pendientes de Factura Digital Fiscal: ${hallazgos.pagos.aprobadosSinFactura}\n`);

  // 5. AUDITORÍA DE FACTURAS
  console.log('--- 5. AUDITANDO FACTURAS ---');
  const { data: facts, count: countFacts } = await supabase
    .from('facturas')
    .select('id, referencia, identidad, monto, estado', { count: 'exact' });

  hallazgos.facturas.total = countFacts || 0;
  let factSinIden = 0;
  let factSinMonto = 0;
  for (const f of (facts || [])) {
    if (!f.identidad) factSinIden++;
    if (!f.monto || f.monto <= 0) factSinMonto++;
  }
  console.log(`Facturas registradas: ${hallazgos.facturas.total}`);
  console.log(`- Sin identidad asociada: ${factSinIden}`);
  console.log(`- Sin monto o monto <= 0: ${factSinMonto}\n`);

  console.log('====================================================================');
  console.log('RESUMEN DE SALUD GLOBAL DE LA BASE DE DATOS Y DEL SISTEMA');
  console.log('====================================================================');
}

runMasterAudit().catch(console.error);
