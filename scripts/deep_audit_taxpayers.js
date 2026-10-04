const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['\"]|['\"]$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function isFictitiousEmail(email) {
  if (!email || typeof email !== 'string') return true;
  const clean = email.toLowerCase().trim();
  if (!clean || clean.length < 5 || !clean.includes('@') || !clean.includes('.')) return true;
  if (clean.includes('example.com') || clean.includes('test.com') || clean.includes('sincorreo') || 
      clean.includes('noemail') || clean.includes('notiene') || clean.includes('ficticio') || 
      clean.includes('alcaldia') || clean.includes('noreply') || clean.includes('sin_correo')) {
    return true;
  }
  return false;
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 10 || clean === '00000000000' || /^0+$/.test(clean)) return false;
  return true;
}

async function runDeepAudit() {
  console.log('================================================================');
  console.log('AUDITORÍA 100% PROFUNDA DE CONTRIBUYENTES Y CATASTRO INMOBILIARIO');
  console.log('================================================================\n');

  // 1. TOTALES GLOBALES
  const { count: totalContribuyentes } = await supabase
    .from('contribuyentes')
    .select('*', { count: 'exact', head: true });

  const { count: totalInmuebles } = await supabase
    .from('inmuebles')
    .select('*', { count: 'exact', head: true });

  const { count: totalPagos } = await supabase
    .from('pagos_reportados')
    .select('*', { count: 'exact', head: true });

  const { count: totalTrabajadores } = await supabase
    .from('trabajadores')
    .select('*', { count: 'exact', head: true });

  console.log(`- Total Contribuyentes Registrados: ${totalContribuyentes}`);
  console.log(`- Total Inmuebles en Catastro: ${totalInmuebles}`);
  console.log(`- Total Pagos Reportados: ${totalPagos}`);
  console.log(`- Total Trabajadores / Operadores: ${totalTrabajadores}\n`);

  // 2. AUDITORÍA DE CONTRIBUYENTES
  console.log('--- Auditando tabla contribuyentes (35.762 registros) ---');
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  let vCount = 0, jCount = 0, gCount = 0, eCount = 0, otherType = 0;
  let withEmailReal = 0, withEmailFicticio = 0, withoutEmail = 0;
  let withValidPhone = 0, withoutPhone = 0;
  let withAddress = 0, withoutAddress = 0;
  let withObservaciones = 0;
  const allIdentidadesContribuyentes = new Set();
  const duplicateContribs = [];
  let totalContribuyentesProcessed = 0;

  while (hasMore) {
    const { data, error } = await supabase
      .from('contribuyentes')
      .select('id, identidad, nombre, email, telefono, direccion, observaciones')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error(`Error en página ${page} de contribuyentes:`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    totalContribuyentesProcessed += data.length;

    for (const c of data) {
      const iden = (c.identidad || '').trim().toUpperCase();
      const normIden = iden.replace(/[^A-Z0-9]/g, '');

      if (allIdentidadesContribuyentes.has(normIden)) {
        duplicateContribs.push(iden);
      } else {
        allIdentidadesContribuyentes.add(normIden);
      }

      if (iden.startsWith('V-') || iden.startsWith('V')) vCount++;
      else if (iden.startsWith('J-') || iden.startsWith('J')) jCount++;
      else if (iden.startsWith('G-') || iden.startsWith('G')) gCount++;
      else if (iden.startsWith('E-') || iden.startsWith('E')) eCount++;
      else otherType++;

      if (!c.email || c.email.trim() === '') withoutEmail++;
      else if (isFictitiousEmail(c.email)) withEmailFicticio++;
      else withEmailReal++;

      if (isValidPhone(c.telefono)) withValidPhone++;
      else withoutPhone++;

      if (c.direccion && c.direccion.trim().length > 3) withAddress++;
      else withoutAddress++;

      if (c.observaciones && c.observaciones.trim().length > 2) withObservaciones++;
    }

    page++;
    if (page % 5 === 0) {
      process.stdout.write(`... procesados ${totalContribuyentesProcessed} contribuyentes\n`);
    }
  }
  console.log(`Finalizado contribuyentes. Total procesados: ${totalContribuyentesProcessed}\n`);

  // 3. AUDITORÍA DE INMUEBLES
  console.log('--- Auditando tabla inmuebles (51.414 registros) ---');
  let inmpage = 0;
  const inmPageSize = 1000;
  let inmHasMore = true;

  let residenciales = 0;
  let comerciales = 0;
  let industriales = 0;
  let otrosTipos = 0;
  let contenedoresPadre = 0;
  let agentesRetencion = 0;
  let condominios = 0;
  let conEmailInm = 0;
  let conTlfInm = 0;

  let vinculadosAContribuyente = 0;
  let sinVinculoContribuyente = 0;
  let totalInmueblesProcessed = 0;

  const identidadesEnInmuebles = new Set();
  const inmueblesPorContribuyente = {};

  while (inmHasMore) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, tipo, actividad_principal, direccion, cant_inmuebles, agente_retencion, es_condominio, correo_electronico, telefono, clasificacion')
      .order('id')
      .range(inmpage * inmPageSize, (inmpage + 1) * inmPageSize - 1);

    if (error) {
      console.error(`Error en página ${inmpage} de inmuebles:`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      inmHasMore = false;
      break;
    }

    totalInmueblesProcessed += data.length;

    for (const inm of data) {
      const iden = (inm.identidad || '').trim().toUpperCase();
      const normIden = iden.replace(/[^A-Z0-9]/g, '');

      if (normIden) {
        identidadesEnInmuebles.add(normIden);
        inmueblesPorContribuyente[normIden] = (inmueblesPorContribuyente[normIden] || 0) + 1;

        if (allIdentidadesContribuyentes.has(normIden)) {
          vinculadosAContribuyente++;
        } else {
          sinVinculoContribuyente++;
        }
      }

      // Tipos
      const t = (inm.tipo || '').toUpperCase();
      const cla = (inm.clasificacion || '').toUpperCase();
      const act = (inm.actividad_principal || '').toUpperCase();
      const combined = `${t} ${cla} ${act}`;

      if (combined.includes('RESIDENCIAL') || combined.includes('VIVIENDA') || t === 'RESIDENCIAL') {
        residenciales++;
      } else if (combined.includes('COMERCIAL') || t === 'COMERCIAL') {
        comerciales++;
      } else if (combined.includes('INDUSTRIAL') || t === 'INDUSTRIAL') {
        industriales++;
      } else {
        otrosTipos++;
      }

      // Contenedores padre
      if ((inm.cant_inmuebles && inm.cant_inmuebles > 0) && (act === 'N/A' || !act || act.trim() === '')) {
        contenedoresPadre++;
      }

      if (inm.agente_retencion === true || inm.agente_retencion === 'true') agentesRetencion++;
      if (inm.es_condominio === true || inm.es_condominio === 'true') condominios++;
      if (inm.correo_electronico && inm.correo_electronico.trim().length > 3) conEmailInm++;
      if (inm.telefono && inm.telefono.trim().length > 5) conTlfInm++;
    }

    inmpage++;
    if (inmpage % 10 === 0) {
      process.stdout.write(`... procesados ${totalInmueblesProcessed} inmuebles\n`);
    }
  }
  console.log(`Finalizado inmuebles. Total procesados: ${totalInmueblesProcessed}\n`);

  // 4. AUDITORÍA DE PAGOS
  const { data: pagosData } = await supabase.from('pagos_reportados').select('*');
  let totalBsReportado = 0;
  let porVerificar = 0, aprobados = 0, rechazados = 0;
  const bancosUsados = {};
  const formasPago = {};

  if (pagosData) {
    for (const p of pagosData) {
      totalBsReportado += Number(p.monto_bs || p.monto || 0);
      const est = (p.estatus || p.estado || '').toLowerCase();
      if (est.includes('verificar') || est.includes('pendiente')) porVerificar++;
      else if (est.includes('aprobad') || est.includes('conciliad')) aprobados++;
      else if (est.includes('rechazad')) rechazados++;

      const bco = (p.banco_origen || 'No especificado').toUpperCase();
      bancosUsados[bco] = (bancosUsados[bco] || 0) + 1;

      const fp = (p.metodo_pago || p.forma_pago || 'Transferencia').toUpperCase();
      formasPago[fp] = (formasPago[fp] || 0) + 1;
    }
  }

  // 5. TRABAJADORES
  const { data: trabData } = await supabase.from('trabajadores').select('*');

  // Top 10 Contribuyentes con más inmuebles
  const topHolders = Object.entries(inmueblesPorContribuyente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const report = {
    auditoria_contribuyentes: {
      total_en_bd: totalContribuyentes,
      total_auditados: totalContribuyentesProcessed,
      distribucion_tipo: {
        naturales_venezolanos_V: vCount,
        pct_naturales: ((vCount / totalContribuyentesProcessed) * 100).toFixed(2) + '%',
        juridicos_empresas_J: jCount,
        pct_juridicos: ((jCount / totalContribuyentesProcessed) * 100).toFixed(2) + '%',
        extranjeros_E: eCount,
        gubernamentales_G: gCount,
        otros_sin_prefijo: otherType
      },
      calidad_contacto: {
        con_email_real: withEmailReal,
        pct_email_real: ((withEmailReal / totalContribuyentesProcessed) * 100).toFixed(2) + '%',
        con_email_ficticio: withEmailFicticio,
        sin_email: withoutEmail,
        pct_sin_email: ((withoutEmail / totalContribuyentesProcessed) * 100).toFixed(2) + '%',
        con_telefono_valido: withValidPhone,
        pct_telefono_valido: ((withValidPhone / totalContribuyentesProcessed) * 100).toFixed(2) + '%',
        sin_telefono: withoutPhone,
        con_direccion_fiscal: withAddress,
        pct_con_direccion: ((withAddress / totalContribuyentesProcessed) * 100).toFixed(2) + '%',
        con_observaciones_historicas: withObservaciones
      },
      duplicados_detectados: duplicateContribs.length,
      muestra_duplicados: duplicateContribs.slice(0, 5)
    },
    auditoria_inmuebles: {
      total_en_bd: totalInmuebles,
      total_auditados: totalInmueblesProcessed,
      distribucion_uso: {
        residenciales: residenciales,
        pct_residenciales: ((residenciales / totalInmueblesProcessed) * 100).toFixed(2) + '%',
        comerciales: comerciales,
        pct_comerciales: ((comerciales / totalInmueblesProcessed) * 100).toFixed(2) + '%',
        industriales: industriales,
        pct_industriales: ((industriales / totalInmueblesProcessed) * 100).toFixed(2) + '%',
        otros_mixtos_baldios: otrosTipos
      },
      clasificacion_especial: {
        contenedores_padre_sigyr: contenedoresPadre,
        agentes_de_retencion_75iva: agentesRetencion,
        condominios_registrados: condominios
      },
      vinculacion_contribuyente: {
        identidades_unicas_en_catastro: identidadesEnInmuebles.size,
        inmuebles_vinculados_a_contribuyente: vinculadosAContribuyente,
        inmuebles_sin_ficha_contribuyente: sinVinculoContribuyente,
        pct_vinculacion: ((vinculadosAContribuyente / totalInmueblesProcessed) * 100).toFixed(2) + '%'
      },
      top_propietarios_por_inmuebles: topHolders
    },
    auditoria_pagos: {
      total_pagos_registrados: totalPagos,
      monto_total_bs: totalBsReportado,
      estados: {
        por_verificar: porVerificar,
        aprobados: aprobados,
        rechazados: rechazados
      },
      bancos_utilizados: bancosUsados,
      metodos_pago: formasPago
    },
    trabajadores_sistema: trabData ? trabData.map(t => ({
      usuario: t.usuario,
      nombre: t.nombre,
      rol: t.rol,
      estado: t.estado,
      created_at: t.created_at
    })) : []
  };

  fs.writeFileSync('scripts/audit_100_percent_report.json', JSON.stringify(report, null, 2));
  console.log('REPORTE COMPLETO GENERADO: scripts/audit_100_percent_report.json');
}

runDeepAudit();
