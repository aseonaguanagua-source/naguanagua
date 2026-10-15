const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('=== 1. REGISTRANDO URB030765 EN CONDOMINIOS Y CONDOMINIO_UNIDADES ===');

  const condoData = {
    codigo: 'URB030765',
    identidad: 'J-075227549',
    nombre: 'CECOM S.A. (GRANJA ESMERALDA)',
    tipo: 'COMERCIAL',
    modalidad: 'MIXTO_COMERCIAL',
    cant_declarada: 10,
    actividad: 'N/A',
    tarifa_mmv: 53.32,
    agente_retencion: true,
    telefono: '0414-4294384',
    correo: 'carolina.ramirezrc@gmail.com',
    direccion: '1 SN GRANJA ESMERALDA OFICINA NRO. SN SECTOR MAÑONGO, NAGUANAGUA EDO. CARABOBO',
    estado: 'Activo',
    permite_pago_por_unidad: true,
    permite_abonos: true,
    cobro_tarifa_por_unidad: true,
    aseo_pendiente_desde: '2026-09-01',
    multa_meses: 0,
    multa_exonerada_hasta: '2026-09-01'
  };

  const { data: cExist } = await supabase.from('condominios').select('id').eq('codigo', 'URB030765').maybeSingle();
  let condoId = cExist?.id;

  if (condoId) {
    await supabase.from('condominios').update(condoData).eq('id', condoId);
    console.log('Condominio actualizado:', condoId);
  } else {
    const { data: cNew, error: eC } = await supabase.from('condominios').insert([condoData]).select('id').single();
    if (eC) throw eC;
    condoId = cNew.id;
    console.log('Condominio creado:', condoId);
  }

  // 10 unidades hijas
  const unidades = [
    { inmueble: 'URB030766', numero: 'CUBÍCULO SN', propietario: 'BIENES C A', identidad: 'J-075083970', actividad: 'OFICINAS (MEDIA)', tarifa_mmv: 6.21 },
    { inmueble: 'URB030767', numero: 'OFICINA SN', propietario: 'C.A. BARRERA', identidad: 'J-075010027', actividad: 'OFICINAS (MEDIA)', tarifa_mmv: 6.21 },
    { inmueble: 'URB030768', numero: 'ANEXO 6', propietario: 'C. A. INVERSIONES VENEZOLANAS GANADERAS, C.A. INVEGA', identidad: 'J-000201153', actividad: 'OFICINAS (MEDIA)', tarifa_mmv: 6.21 },
    { inmueble: 'URB030769', numero: 'ANEXO 9', propietario: 'CECOM S.A.', identidad: 'J-075227549', actividad: 'ADMINISTRADORAS (ALTA)', tarifa_mmv: 10.12 },
    { inmueble: 'URB030770', numero: 'OFICINA SN', propietario: 'CECOM S.A.', identidad: 'J-075227549', actividad: 'INMUEBLES Y LOCALES DESOCUPADOS', tarifa_mmv: 1.98 },
    { inmueble: 'URB030771', numero: 'OFICINA SN', propietario: 'CECOM S.A.', identidad: 'J-075227549', actividad: 'INMUEBLES Y LOCALES DESOCUPADOS', tarifa_mmv: 1.98 },
    { inmueble: 'URB030772', numero: 'OFICINA SN', propietario: 'FRUTICOLA POTRERITO C A', identidad: 'J-001036113', actividad: 'OFICINAS (MEDIA)', tarifa_mmv: 6.21 },
    { inmueble: 'URB030773', numero: 'OFICINA SN', propietario: 'SUMINISTROS SEM, C.A', identidad: 'J-409438660', actividad: 'OFICINAS (MEDIA)', tarifa_mmv: 6.21 },
    { inmueble: 'URB030774', numero: 'OFICINA SN', propietario: 'CECOM S.A.', identidad: 'J-075227549', actividad: 'INMUEBLES Y LOCALES DESOCUPADOS', tarifa_mmv: 1.98 },
    { inmueble: 'URB030775', numero: 'OFICINA SN', propietario: 'ANÍBAL MARTÍN GARRIDO GALÁN', identidad: 'V-159786273', actividad: 'OFICINAS (MEDIA)', tarifa_mmv: 6.21 }
  ];

  for (const u of unidades) {
    const uRow = {
      condominio_id: condoId,
      inmueble: u.inmueble,
      numero: u.numero,
      propietario: u.propietario,
      identidad: u.identidad,
      actividad: u.actividad,
      tarifa_mmv: u.tarifa_mmv,
      estado: 'Activo',
      aseo_pendiente_desde: '2026-09-01',
      multa_meses: 0,
      multa_exonerada_hasta: '2026-09-01'
    };
    const { data: uEx } = await supabase.from('condominio_unidades').select('id').eq('condominio_id', condoId).eq('inmueble', u.inmueble).maybeSingle();
    if (uEx) {
      await supabase.from('condominio_unidades').update(uRow).eq('id', uEx.id);
    } else {
      await supabase.from('condominio_unidades').insert([uRow]);
    }
  }
  console.log('10 unidades vinculadas en condominio_unidades.');

  // Actualizar tabla inmuebles
  await supabase.from('inmuebles').update({
    es_condominio: true,
    cant_inmuebles: 10,
    mmv_mes: 53.32,
    meses_deuda: 1
  }).eq('inmueble', 'URB030765');

  for (const u of unidades) {
    await supabase.from('inmuebles').update({
      padre_id: 'URB030765',
      condominio_padre_id: 'URB030765',
      meses_deuda: 1,
      mmv_mes: u.tarifa_mmv
    }).eq('inmueble', u.inmueble);
  }
  console.log('Tabla inmuebles sincronizada.');

  console.log('=== 2. GENERANDO PDF DE ESTADO DE CUENTA ===');
  const { data: cfgTasa } = await supabase.from('sistema_config').select('valor').eq('id', 'tasa_bcv_semanal').maybeSingle();
  const tasaBCV = parseFloat(cfgTasa?.valor || '982.75895071');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9;

  // Header IAMEC
  doc.setFillColor(248, 250, 252);
  doc.rect(14, 10, W - 28, 24, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, 10, W - 28, 24, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('ALCALDÍA BOLIVARIANA DE NAGUANAGUA', W / 2, 17, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO (IAMEC)', W / 2, 22, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('DIRECCIÓN DE HACIENDA Y RECAUDACIÓN TRIBUTARIA MUNICIPAL', W / 2, 27, { align: 'center' });
  doc.text('RIF: G-20007673-9 | NAGUANAGUA, EDO. CARABOBO', W / 2, 31, { align: 'center' });

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('ESTADO DE CUENTA CONSOLIDADO', W / 2, 42, { align: 'center' });
  doc.setFontSize(8.5);
  doc.setTextColor(30, 64, 175);
  doc.text('CONDOMINIO COMERCIAL / LOCAL MATRIZ CON 10 ACTIVIDADES ECONÓMICAS', W / 2, 47, { align: 'center' });

  // Cuadro de Datos
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 52, W - 28, 28, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('CONTRIBUYENTE MATRIZ:', 18, 58);
  doc.text('R.I.F.:', 135, 58);
  doc.text('CÓDIGO PRINCIPAL:', 18, 64);
  doc.text('TOTAL ACTIVIDADES:', 135, 64);
  doc.text('DIRECCIÓN:', 18, 70);
  doc.text('TASA BCV VIGENTE:', 135, 70);
  doc.text('PERÍODO FACTURADO:', 18, 76);
  doc.text('CONDICIÓN FISCAL:', 135, 76);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('CECOM S.A. (GRANJA ESMERALDA)', 58, 58);
  doc.text('J-075227549', 165, 58);
  doc.text('URB030765', 58, 64);
  doc.text('10 Unidades / Locales', 165, 64);
  doc.setFont('helvetica', 'normal');
  doc.text('Sector Mañongo, Granja Esmeralda, Naguanagua, Edo. Carabobo', 58, 70);
  doc.text(`Bs. ${tasaBCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / MMV`, 165, 70);
  doc.text('Septiembre 2026 (1 Mes)', 58, 76);
  doc.text('Agente de Retención (75% IVA)', 165, 76);

  // Tabla con las 10 actividades
  const tableData = unidades.map((u, idx) => {
    const baseBs = u.tarifa_mmv * tasaBCV;
    const ivaBs = baseBs * 0.16;
    const retBs = ivaBs * 0.75;
    const totalBs = baseBs + ivaBs - retBs;
    return [
      idx + 1,
      u.inmueble,
      u.numero,
      u.actividad,
      u.propietario + '\n(' + u.identidad + ')',
      u.tarifa_mmv.toFixed(2),
      'Bs. ' + baseBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      'Bs. ' + ivaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      '- Bs. ' + retBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      'Bs. ' + totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ];
  });

  const totMMV = unidades.reduce((s, u) => s + u.tarifa_mmv, 0);
  const totBaseBs = totMMV * tasaBCV;
  const totIvaBs = totBaseBs * 0.16;
  const totRetBs = totIvaBs * 0.75;
  const totPagarBs = totBaseBs + totIvaBs - totRetBs;

  const autoTable = require('jspdf-autotable').default || require('jspdf-autotable');
  autoTable(doc, {
    startY: 84,
    head: [['#', 'Código', 'Local', 'Actividad Económica', 'Contribuyente / RIF', 'Tarifa MMV', 'Base Imponible', 'IVA (16%)', 'Retención IVA (75%)', 'Total Neto Bs.']],
    body: tableData,
    foot: [[
      { content: 'TOTALES CONSOLIDADOS:', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
      totMMV.toFixed(2),
      'Bs. ' + totBaseBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      'Bs. ' + totIvaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      '- Bs. ' + totRetBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      'Bs. ' + totPagarBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ]],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [226, 232, 240] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 6 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      2: { halign: 'center', cellWidth: 16 },
      3: { cellWidth: 32 },
      4: { cellWidth: 34 },
      5: { halign: 'right', cellWidth: 14 },
      6: { halign: 'right', cellWidth: 20 },
      7: { halign: 'right', cellWidth: 16 },
      8: { halign: 'right', cellWidth: 18 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 20 }
    },
    margin: { left: 10, right: 10 }
  });

  const finalY = doc.lastAutoTable.finalY + 6;

  // Cuadro Resumen de Pago
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(120, finalY, 86, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(22, 101, 52);
  doc.text('Subtotal Base Imponible:', 124, finalY + 6);
  doc.text('Bs. ' + totBaseBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 202, finalY + 6, { align: 'right' });
  doc.text('IVA (16%):', 124, finalY + 11);
  doc.text('Bs. ' + totIvaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 202, finalY + 11, { align: 'right' });
  doc.text('Retención de IVA (75%):', 124, finalY + 16);
  doc.text('- Bs. ' + totRetBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 202, finalY + 16, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(21, 128, 61);
  doc.text('TOTAL NETO A PAGAR:', 124, finalY + 23);
  doc.text('Bs. ' + totPagarBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 202, finalY + 23, { align: 'right' });

  // Cuentas Bancarias IAMEC
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, finalY, 104, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('CUENTAS BANCARIAS OFICIALES IAMEC:', 14, finalY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('• BANCAMIGA: 0172-0110-7111-0134-0717 (Cta. Corriente)', 14, finalY + 12);
  doc.text('• BANESCO:    0134-0415-1441-5103-1715 (Cta. Corriente)', 14, finalY + 17);
  doc.text('A nombre de: INST. AUTONOMO MPAL. DE ECOSOCIALISMO', 14, finalY + 22);
  doc.text('RIF: G-20007673-9', 14, finalY + 26);

  // Notas legales
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento oficial emitido conforme a la Ordenanza Municipal de Gestión y Manejo Integral de Desechos y Residuos Sólidos de Naguanagua.', 10, finalY + 33);
  doc.text('Válido a la tasa oficial del Banco Central de Venezuela correspondiente al día de pago. Emitido el: ' + new Date().toLocaleString('es-VE'), 10, finalY + 36);

  const outPath = '/Users/davidzara/Documents/naguanagua_zero/Estado_de_Cuenta_URB030765_CECOM_GRANJA_ESMERALDA.pdf';
  doc.save(outPath);
  console.log('PDF generado exitosamente en:', outPath);
}

run().catch(console.error);
