import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getResendClient } from '@/lib/emailClient';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { calcularMensualidad, isResidencialInm, isTerrenoInm } from '@/lib/calculos';
import { tasaVigente } from '@/lib/condominios/servicio';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import { enviarRecibo } from '@/lib/reciboMailer';
import { extraerCodigoInmueble } from '@/lib/documentoPago';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fmtBs = (n: number) =>
  (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function isValidEmail(raw?: string | null): boolean {
  if (!raw) return false;
  const e = String(raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  if (
    e.endsWith('@test.com') ||
    e.endsWith('@ejemplo.com') ||
    e.endsWith('@correo.com') ||
    e.startsWith('sincorreo') ||
    e.startsWith('notiene') ||
    e === 'na@na.com' ||
    e === 'n/a'
  ) {
    return false;
  }
  return true;
}

const logoCache: Record<string, string | null> = {};
function loadPublicLogoBase64(filename: string): string | null {
  if (filename in logoCache) return logoCache[filename];
  try {
    const p = path.join(process.cwd(), 'public', 'logos', filename);
    const buf = fs.readFileSync(p);
    logoCache[filename] = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    logoCache[filename] = null;
  }
  return logoCache[filename];
}

export interface InmuebleDeudaItem {
  inmueble: string;
  actividad: string;
  direccion: string;
  tipo: string;
  meses: number;
  mensualBs: number;
  baseBs: number;
  multaBs: number;
  ivaBs: number;
  retencionBs: number;
  totalBs: number;
}

export interface DestinatarioCampana {
  identidad: string;
  nombre: string;
  correo: string;
  telefono: string;
  direccion: string;
  codigoPrincipal: string;
  codigos: string[];
  sector: 'Individual' | 'Comercial' | 'Condominio';
  mesesMax: number;
  esCondominio: boolean;
  esComercial: boolean;
  esResidencial: boolean;
  agenteRetencion: boolean;
  hasDebt: boolean;
  totalDeudaBs: number;
  items: InmuebleDeudaItem[];
}

export interface CampanaHistorialItem {
  id: string;
  fecha: string;
  plantilla: 'recordatorio_pago' | 'estado_cuenta_masivo';
  plantillaNombre: string;
  asunto: string;
  remitente: string;
  tipoFiltro: string;
  estatusFiltro: string;
  adjuntarPdf: boolean;
  totalEnviados: number;
  totalErrores: number;
}

function construirEstadoCuentaPdfBuffer(dest: DestinatarioCampana, tasaBcv: number): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;

  // Encabezado Institucional con los 3 logos oficiales (Alcaldía, Gestión Municipal, IAMEC)
  doc.setFillColor(10, 74, 42);
  doc.rect(0, 0, W, 32, 'F');

  const logoAlc = loadPublicLogoBase64('ALCALDIA.png');
  const logoEli = loadPublicLogoBase64('ELIZABETH.png');
  const logoIam = loadPublicLogoBase64('IAMEC.png') || loadPublicLogoBase64('iamec_pdf.png');

  if (logoAlc) {
    try { doc.addImage(logoAlc, 'PNG', M, 4, 22, 22); } catch {}
  }
  if (logoEli) {
    try { doc.addImage(logoEli, 'PNG', M + 25, 5, 28, 20); } catch {}
  }
  if (logoIam) {
    try { doc.addImage(logoIam, 'PNG', W - M - 24, 5, 24, 20); } catch {}
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ALCALDÍA DEL MUNICIPIO NAGUANAGUA', W / 2 + 8, 12, { align: 'center' });
  doc.setFontSize(9.5);
  doc.text('INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO (IAMEC)', W / 2 + 8, 18, { align: 'center' });
  doc.setFontSize(8.5);
  doc.setTextColor(220, 252, 231);
  doc.text('ESTADO DE CUENTA OFICIAL • TASA DE ASEO URBANO (R.I.F. G-20008614-9)', W / 2 + 8, 24, { align: 'center' });

  let y = 40;
  const fechaEmision = new Date().toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });

  // Ficha del Contribuyente
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(M, y, W - 2 * M, 26, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const nombreLines = doc.splitTextToSize(String(dest.nombre || 'CONTRIBUYENTE'), W - 2 * M - 65);
  doc.text(nombreLines[0] || 'CONTRIBUYENTE', M + 4, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`C.I. / R.I.F.: ${dest.identidad}`, M + 4, y + 13);
  doc.text(`Correo: ${dest.correo}`, M + 4, y + 18.5);
  const dirCorta = doc.splitTextToSize(`Dirección: ${dest.direccion || 'Municipio Naguanagua'}`, W - 2 * M - 8);
  doc.text(dirCorta[0] || '', M + 4, y + 23.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(10, 74, 42);
  doc.text(`Fecha: ${fechaEmision}`, W - M - 4, y + 7, { align: 'right' });
  doc.text(`Tasa BCV Referencial: Bs. ${fmtBs(tasaBcv)}`, W - M - 4, y + 13, { align: 'right' });

  y += 33;

  // Tabla de Inmuebles con Deuda
  doc.setFillColor(15, 23, 42);
  doc.rect(M, y, W - 2 * M, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('CÓDIGO', M + 3, y + 4.8);
  doc.text('ACTIVIDAD / CLASIFICACIÓN', M + 28, y + 4.8);
  doc.text('MESES', M + 102, y + 4.8, { align: 'center' });
  doc.text('BASE (Bs.)', M + 132, y + 4.8, { align: 'right' });
  doc.text('IVA / MULTA (Bs.)', M + 160, y + 4.8, { align: 'right' });
  doc.text('TOTAL (Bs.)', W - M - 3, y + 4.8, { align: 'right' });
  y += 7;

  const itemsConDeuda = dest.items.filter(it => it.totalBs > 0.01 || it.meses > 0);
  const listaRender = itemsConDeuda.length > 0 ? itemsConDeuda : dest.items;

  let sumBase = 0;
  let sumMulta = 0;
  let sumIva = 0;
  let sumRet = 0;
  let sumTotal = 0;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  listaRender.forEach((it, idx) => {
    if (y > H - 65) {
      doc.addPage();
      y = 20;
    }
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y, W - 2 * M, 7, 'F');
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(String(it.inmueble || '-'), M + 3, y + 4.8);
    doc.setFont('helvetica', 'normal');
    const actLines = doc.splitTextToSize(String(it.actividad || 'ASEO URBANO'), 68);
    doc.text(actLines[0] || 'ASEO URBANO', M + 28, y + 4.8);
    doc.text(String(it.meses || 0), M + 102, y + 4.8, { align: 'center' });
    doc.text(fmtBs(it.baseBs), M + 132, y + 4.8, { align: 'right' });
    doc.text(fmtBs(it.ivaBs + it.multaBs), M + 160, y + 4.8, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(fmtBs(it.totalBs), W - M - 3, y + 4.8, { align: 'right' });
    y += 7;

    sumBase += it.baseBs;
    sumMulta += it.multaBs;
    sumIva += it.ivaBs;
    sumRet += it.retencionBs;
    sumTotal += it.totalBs;
  });

  y += 4;
  doc.setDrawColor(203, 213, 225);
  doc.line(M, y, W - M, y);
  y += 5;

  // Resumen de Totales
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal Base Imponible:', W - M - 55, y, { align: 'right' });
  doc.setTextColor(15, 23, 42);
  doc.text(`Bs. ${fmtBs(sumBase)}`, W - M - 3, y, { align: 'right' });
  y += 5;

  if (sumMulta > 0.01) {
    doc.setTextColor(71, 85, 105);
    doc.text('Multas / Recargos:', W - M - 55, y, { align: 'right' });
    doc.setTextColor(185, 28, 28);
    doc.text(`Bs. ${fmtBs(sumMulta)}`, W - M - 3, y, { align: 'right' });
    y += 5;
  }

  if (sumIva > 0.01) {
    doc.setTextColor(71, 85, 105);
    doc.text('I.V.A. (16%):', W - M - 55, y, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    doc.text(`Bs. ${fmtBs(sumIva)}`, W - M - 3, y, { align: 'right' });
    y += 5;
  }

  if (sumRet > 0.01) {
    doc.setTextColor(71, 85, 105);
    doc.text('Retención I.V.A. (75%):', W - M - 55, y, { align: 'right' });
    doc.setTextColor(10, 74, 42);
    doc.text(`- Bs. ${fmtBs(sumRet)}`, W - M - 3, y, { align: 'right' });
    y += 5;
  }

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(16, 185, 129);
  doc.roundedRect(W - M - 95, y - 1, 95, 9, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(6, 95, 70);
  doc.text('TOTAL A PAGAR:', W - M - 50, y + 5, { align: 'right' });
  doc.text(`Bs. ${fmtBs(sumTotal)}`, W - M - 3, y + 5, { align: 'right' });

  y += 16;

  // Cuentas Bancarias Oficiales IAMEC
  if (y > H - 45) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(M, y, W - 2 * M, 28, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(10, 74, 42);
  doc.text('CUENTAS BANCARIAS OFICIALES PARA TRANSFERENCIAS — IAMEC (R.I.F. G-20008614-9)', M + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('• BANESCO (Cuenta Corriente): 0134-1089-59-0001008636 — Titular: IAMEC Naguanagua (G-20008614-9)', M + 4, y + 12);
  doc.text('• BANCAMIGA (Cuenta Corriente): 0172-0110-71-1101340717 — Titular: IAMEC Naguanagua (G-20008614-9)', M + 4, y + 17.5);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('WhatsApp Comercial: 0424-4282365 (aseoresnaguanagua@globalgreenca.com) | WhatsApp Residencial: 0424-4282364 (aseocomnaguanagua@globalgreenca.com)', M + 4, y + 23.5);

  return Buffer.from(doc.output('arraybuffer'));
}

function buildRecordatorioPagoHtml(_dest: DestinatarioCampana): string {
  const BASE = 'https://naguanagua.globalgreenrec.com';
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RECORDATORIO DE PAGO - IAMEC NAGUANAGUA</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Calibri,Arial,Helvetica,sans-serif;color:#000000;">
<div style="background:#ffffff;max-width:650px;margin:0 auto;padding:24px 36px;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;color:#000000;">

  <!-- ENCABEZADO DEL DOCUMENTO WORD: LOGO IAMEC CENTRADO -->
  <div style="text-align:center;margin:0 0 22px 0;">
    <img src="${BASE}/logos/IAMEC.png" alt="IAMEC - Instituto Autónomo Municipal de Ecosocialismo" width="210" style="display:inline-block;width:210px;max-width:210px;height:auto;border:0;" />
  </div>

  <!-- P1 -->
  <p style="margin:0 0 12px 0;text-align:justify;font-size:11pt;color:#000000;">
    <strong>Estimados usuarios</strong>, el Instituto Autónomo Municipal de Ecosocialismo (IAMEC) recuerda a todos los residentes, comerciantes e industriales del municipio Naguanagua la importancia de mantener al día el pago correspondiente al servicio de aseo urbano y domiciliario. Su contribución puntual permite garantizar la continuidad, eficiencia y operatividad de las rutas de recolección en todo el municipio.
  </p>

  <!-- P2 -->
  <p style="margin:0 0 14px 0;text-align:justify;font-size:11pt;color:#000000;">
    Para facilitar el cumplimiento de sus obligaciones tributarias, ponemos a su disposición nuestras cuentas bancarias oficiales autorizadas para realizar transferencias o pagos:
  </p>

  <!-- P3 -->
  <p style="margin:0 0 12px 0;text-align:center;font-weight:bold;font-size:11pt;color:#000000;">
    Datos Bancarios Oficiales
  </p>

  <!-- P4 - P11 -->
  <p style="margin:0 0 10px 0;text-align:left;font-weight:bold;font-size:11pt;color:#000000;">Titular: IAMEC</p>
  <p style="margin:0 0 10px 0;text-align:left;font-weight:bold;font-size:11pt;color:#000000;">RIF: G-200086149</p>
  <p style="margin:0 0 10px 0;text-align:left;font-weight:bold;font-size:11pt;color:#000000;">BANCAMIGA</p>
  <p style="margin:0 0 10px 0;text-align:left;font-size:11pt;color:#000000;">Tipo de cuenta: Cuenta Corriente</p>
  <p style="margin:0 0 10px 0;text-align:left;font-size:11pt;color:#000000;">Número de cuenta: 0172-0110-71-1101340717</p>
  <p style="margin:0 0 10px 0;text-align:left;font-weight:bold;font-size:11pt;color:#000000;">BANESCO</p>
  <p style="margin:0 0 10px 0;text-align:left;font-size:11pt;color:#000000;">Tipo de cuenta: Cuenta Corriente</p>
  <p style="margin:0 0 22px 0;text-align:left;font-size:11pt;color:#000000;">Número de cuenta: 0134-1089-59-0001008636</p>

  <!-- P13 -->
  <p style="margin:0 0 10px 0;text-align:left;font-weight:bold;font-size:11pt;color:#000000;">
    Canales de Atención y Reporte de Pagos
  </p>

  <!-- P14 -->
  <p style="margin:0 0 12px 0;text-align:justify;font-size:11pt;color:#000000;">
    Una vez realizada la operación bancaria, o en caso de requerir información sobre su estado de cuenta, facturación o atención al contribuyente, comuníquese directamente a través de nuestros canales oficiales según su categoría:
  </p>

  <!-- P15 - P17 -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;color:#000000;">
    <tr>
      <td width="42" valign="top" style="padding-left:24px;width:42px;">-</td>
      <td valign="top">Teléfonos de contacto (Atención / WhatsApp):</td>
    </tr>
  </table>
  <p style="margin:0 0 10px 0;text-align:left;font-size:11pt;color:#000000;">Sector Residencial: 0424-4282364</p>
  <p style="margin:0 0 10px 0;text-align:left;font-size:11pt;color:#000000;">Sector Comercial: 0424-4282365</p>

  <!-- P18 - P20 -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;color:#000000;">
    <tr>
      <td width="42" valign="top" style="padding-left:24px;width:42px;">-</td>
      <td valign="top">Correos electrónicos:</td>
    </tr>
  </table>
  <p style="margin:0 0 10px 0;text-align:left;font-size:11pt;color:#000000;">
    Sector Residencial: <a href="mailto:aseoresnaguanagua@globalgreenca.com" style="color:#0563c1;text-decoration:underline;">aseoresnaguanagua@globalgreenca.com</a>
  </p>
  <p style="margin:0 0 24px 0;text-align:left;font-size:11pt;color:#000000;">
    Sector Comercial: <a href="mailto:aseocomnaguanagua@globalgreenca.com" style="color:#0563c1;text-decoration:underline;">aseocomnaguanagua@globalgreenca.com</a>
  </p>

  <!-- P22 -->
  <p style="margin:0 0 14px 0;text-align:center;font-size:11pt;color:#000000;">
    Agradecemos su compromiso y corresponsabilidad ciudadana para mantener a Naguanagua limpia y sustentable.
  </p>

  <!-- P23 -->
  <p style="margin:0 0 26px 0;text-align:center;font-weight:bold;text-decoration:underline;font-size:11pt;color:#FF0000;">
    SI USTED YA REALIZO SU PAGO, HAGA CASO OMISO DE ESTE MENSAJE
  </p>

  <!-- ENCABEZADO / LOGO DE SEGUNDA PÁGINA + FIRMA -->
  <div style="text-align:center;margin:10px 0 4px 0;">
    <img src="${BASE}/logos/IAMEC.png" alt="IAMEC" width="180" style="display:inline-block;width:180px;max-width:180px;height:auto;border:0;" />
  </div>
  <p style="margin:0 0 6px 0;text-align:center;font-weight:bold;font-size:11pt;color:#000000;">
    ATENTAMENTE:
  </p>
  <p style="margin:0;text-align:center;font-weight:bold;font-size:11pt;color:#000000;">
    OFICINA DE RECAUDACION DE ASEO
  </p>

</div>
</body>
</html>`;
}

function buildEstadoCuentaMasivoWordHtml(_dest: DestinatarioCampana): string {
  const BASE = 'https://naguanagua.globalgreenrec.com';
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESTADO DE CUENTA ASEO NAGUANAGUA</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Calibri,Arial,Helvetica,sans-serif;color:#222222;">
<div style="background:#ffffff;max-width:680px;margin:0 auto;padding:24px 36px;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#222222;">

  <div style="text-align:center;margin:0 0 18px 0;">
    <img src="${BASE}/logos/IAMEC.png" alt="IAMEC - Instituto Autónomo Municipal de Ecosocialismo" width="200" style="display:inline-block;width:200px;max-width:200px;height:auto;border:0;" />
  </div>

  <p style="margin:0 0 8px 0;text-align:center;font-weight:bold;font-size:11pt;color:#222222;">ESTADO DE CUENTA ASEO NAGUANAGUA</p>
  <p style="margin:0 0 14px 0;text-align:center;font-weight:bold;font-size:11pt;color:#222222;">FAVOR LEER TEXTO COMPLETO</p>

  <p style="margin:0 0 12px 0;text-align:left;font-size:11pt;color:#222222;">Nos dirigimos a Ud., en la oportunidad de remitir estado de cuenta contentivo de su deuda (total o parcial) de la tasa de Aseo Urbano del Municipio Naguanagua.</p>
  <p style="margin:0 0 12px 0;text-align:left;font-size:11pt;color:#222222;">Por favor tenga en consideración las siguientes pautas:</p>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#222222;">
    <tr>
      <td width="42" valign="top" style="padding-left:24px;width:42px;font-size:11pt;color:#222222;">&bull;</td>
      <td valign="top" style="font-size:11pt;color:#222222;">
        <strong>Los datos para realizar el pago son los siguientes:</strong><br/>
        - BANCO: <strong>BANESCO</strong>NÚMERO DE CUENTA: <br/>
        <strong>0134-1089-59-0001008636</strong>TIPO DE CUENTA: <br/>
        <strong>CORRIENTE</strong>TITULAR: <br/>
        <strong>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC)</strong>RIF: <br/>
        <strong>G-20008614-9</strong>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;text-align:left;font-size:11pt;line-height:1.35;color:#222222;">
    -BANCO: <strong>BANCAMIGA</strong><br/>
    NÚMERO DE CUENTA: 0172-0110-71-1101340717<br/>
    TIPO DE CUENTA: <strong>CORRIENTE</strong>TITULAR: <br/>
    <strong>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC)</strong>RIF: <br/>
    <strong>G-20008614-9</strong>
  </p>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#222222;">
    <tr>
      <td width="42" valign="top" style="padding:0 0 10px 24px;width:42px;">&bull;</td>
      <td valign="top" style="padding:0 0 10px 0;">Los pagos deben hacerse por MES O MESES COMPLETOS.</td>
    </tr>
    <tr>
      <td width="42" valign="top" style="padding:0 0 10px 24px;width:42px;">&bull;</td>
      <td valign="top" style="padding:0 0 10px 0;">La factura es emitida por el Instituto Autónomo Municipal De Ecosocialismo Naguanagua (IAMEC) RIF G-20008614-9</td>
    </tr>
    <tr>
      <td width="42" valign="top" style="padding:0 0 10px 24px;width:42px;">&bull;</td>
      <td valign="top" style="padding:0 0 10px 0;">El comprobante de pago por transferencia, favor remitirlo a través del presente correo, indicando en el texto del correo: usuario aseo urbano, razón social o nombre, RIF o CI, correo electrónico y número de teléfono, periodo pagado.</td>
    </tr>
    <tr>
      <td width="42" valign="top" style="padding:0 0 10px 24px;width:42px;">&bull;</td>
      <td valign="top" style="padding:0 0 10px 0;">En caso de ser contribuyente especial, además de las pautas antes mencionadas, deberá considerar las siguientes:</td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#222222;">
    <tr>
      <td width="76" valign="top" style="padding:0 0 10px 58px;width:76px;font-family:'Courier New',Courier,monospace;">o</td>
      <td valign="top" style="padding:0 0 10px 0;">El porcentaje de retención que corresponde a IAMEC es el 75%</td>
    </tr>
    <tr>
      <td width="76" valign="top" style="padding:0 0 10px 58px;width:76px;font-family:'Courier New',Courier,monospace;">o</td>
      <td valign="top" style="padding:0 0 10px 0;">Estamos exentos del I.S.L.R.</td>
    </tr>
    <tr>
      <td width="76" valign="top" style="padding:0 0 10px 58px;width:76px;font-family:'Courier New',Courier,monospace;">o</td>
      <td valign="top" style="padding:0 0 10px 0;">El número de factura es diferente al número de control.</td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#222222;">
    <tr>
      <td width="42" valign="top" style="padding:0 0 0 24px;width:42px;">&bull;</td>
      <td valign="top">La factura debe ser pagada como máximo el día 28 del mes si es de otra entidad bancaria distinta a Banesco / Bancamiga o el día 30 del mes si es de Banesco a Banesco / Bancamiga a Bancamiga, debido a que debemos realizar el cierre fiscal del mes junto a la conciliación bancaria.</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;text-align:left;font-size:11pt;color:#222222;">En caso de que la factura, no sea pagada en el período de tiempo, antes señalado se procederá a la anulación de la misma.</p>
  <p style="margin:0 0 18px 0;text-align:justify;font-size:11pt;color:#222222;">Si usted ya ejecutó su pago, hacer caso omiso de este correo. Agradeciendo su pronto pago, quedamos a sus órdenes.</p>

  <p style="margin:14px 0 8px 0;text-align:center;font-size:11pt;color:#222222;">
    <strong>Whatsapp Comercial:</strong> 0424-4282365 &ndash; <strong>Correo:</strong> <a href="mailto:aseoresnaguanagua@globalgreenca.com" style="color:#222222;text-decoration:none;">aseoresnaguanagua@globalgreenca.com</a>
  </p>
  <p style="margin:0;text-align:center;font-size:11pt;color:#222222;">
    <strong>WhatsApp Residencial:</strong> 0424-4282364 &ndash; <strong>Correo:</strong> <a href="mailto:aseocomnaguanagua@globalgreenca.com" style="color:#222222;text-decoration:none;">aseocomnaguanagua@globalgreenca.com</a>
  </p>

</div>
</body>
</html>`;
}

function buildEstadoCuentaConPdfHtml(dest: DestinatarioCampana): string {
  const BASE = 'https://naguanagua.globalgreenrec.com';
  const codigos = dest.items.map(i => i.inmueble).filter(Boolean).join(', ');
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESTADO DE CUENTA ASEO NAGUANAGUA</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:20px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);max-width:640px;">
  <tr>
    <td style="background:linear-gradient(135deg,#0a4a2a 0%,#1a7a40 50%,#0a4a2a 100%);padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" width="33%"><img src="${BASE}/logos/ALCALDIA.png" alt="Alcaldía de Naguanagua" width="85" style="display:block;margin:0 auto;border-radius:6px;" /></td>
          <td align="center" width="34%"><img src="${BASE}/logos/ELIZABETH.png" alt="Gestión Municipal Elizabeth Niño" width="125" style="display:block;margin:0 auto;border-radius:8px;padding:4px;" /></td>
          <td align="center" width="33%"><img src="${BASE}/logos/IAMEC.png" alt="IAMEC Naguanagua" width="110" style="display:block;margin:0 auto;border-radius:6px;" /></td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background:#14532d;padding:14px 24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">ESTADO DE CUENTA ASEO NAGUANAGUA</h1>
      <p style="margin:4px 0 0;color:#fde047;font-size:13px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">FAVOR LEER TEXTO COMPLETO</p>
    </td>
  </tr>
  <tr>
    <td style="background:#f8fafc;padding:16px 28px;border-bottom:2px solid #1a7a40;">
      <table width="100%" cellpadding="3" cellspacing="0" style="font-size:13px;color:#334155;">
        <tr>
          <td><strong>Contribuyente:</strong> ${dest.nombre}</td>
          <td align="right"><strong>RIF / C.I.:</strong> ${dest.identidad}</td>
        </tr>
        <tr>
          <td><strong>Código(s) Aseo Urbano:</strong> ${codigos || dest.identidad}</td>
          <td align="right"><strong>Deuda Estimada:</strong> <span style="color:#b91c1c;font-weight:bold;">Bs. ${fmtBs(dest.totalDeudaBs)}</span></td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 16px;color:#1e293b;font-size:14px;line-height:1.75;">
      <p style="margin:0 0 14px;">Nos dirigimos a Ud., en la oportunidad de remitir <strong>estado de cuenta contentivo de su deuda (total o parcial)</strong> de la tasa de Aseo Urbano del Municipio Naguanagua${dest.hasDebt ? ' <em>(adjunto en formato PDF a este correo)</em>' : ''}.</p>
      <p style="margin:0 0 12px;font-weight:bold;color:#0f172a;">Por favor tenga en consideración las siguientes pautas:</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:5px solid #16a34a;border-radius:8px;padding:14px 18px;margin:0 0 16px;">
        <p style="margin:0 0 10px;font-weight:bold;color:#14532d;">&bull; Los datos para realizar el pago son los siguientes:</p>
        <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed #bbf7d0;">
          <strong>- BANCO: BANESCO</strong><br/><strong>NÚMERO DE CUENTA:</strong> <span style="font-family:monospace;font-size:14px;">0134-1089-59-0001008636</span><br/><strong>TIPO DE CUENTA:</strong> CORRIENTE<br/><strong>TITULAR:</strong> INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC)<br/><strong>RIF:</strong> G-20008614-9
        </div>
        <div>
          <strong>- BANCO: BANCAMIGA</strong><br/><strong>NÚMERO DE CUENTA:</strong> <span style="font-family:monospace;font-size:14px;">0172-0110-71-1101340717</span><br/><strong>TIPO DE CUENTA:</strong> CORRIENTE<br/><strong>TITULAR:</strong> INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC)<br/><strong>RIF:</strong> G-20008614-9
        </div>
      </div>
      <ul style="margin:0 0 16px;padding-left:20px;color:#334155;">
        <li style="margin-bottom:8px;">Los pagos deben hacerse por <strong>MES O MESES COMPLETOS</strong>.</li>
        <li style="margin-bottom:8px;">La factura es emitida por el <strong>Instituto Autónomo Municipal De Ecosocialismo Naguanagua (IAMEC) RIF G-20008614-9</strong>.</li>
        <li style="margin-bottom:8px;">El comprobante de pago por transferencia, favor remitirlo a través del presente correo, indicando en el texto del correo: <strong>usuario aseo urbano, razón social o nombre, RIF o CI, correo electrónico y número de teléfono, periodo pagado</strong>.</li>
      </ul>
      <p style="margin:0 0 12px;color:#b91c1c;font-weight:bold;">En caso de que la factura, no sea pagada en el período de tiempo, antes señalado se procederá a la anulación de la misma.</p>
      <p style="margin:0 0 16px;color:#334155;">Si usted ya ejecutó su pago, hacer caso omiso de este correo. Agradeciendo su pronto pago, quedamos a sus órdenes.</p>
    </td>
  </tr>
  <tr>
    <td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;font-size:13px;color:#1e293b;">
      <p style="margin:0 0 6px;"><strong>Whatsapp Comercial:</strong> 0424-4282365 &ndash; <strong>Correo:</strong> <a href="mailto:aseoresnaguanagua@globalgreenca.com" style="color:#15803d;text-decoration:none;font-weight:bold;">aseoresnaguanagua@globalgreenca.com</a></p>
      <p style="margin:0;"><strong>WhatsApp Residencial:</strong> 0424-4282364 &ndash; <strong>Correo:</strong> <a href="mailto:aseocomnaguanagua@globalgreenca.com" style="color:#15803d;text-decoration:none;font-weight:bold;">aseocomnaguanagua@globalgreenca.com</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

let cachedPadronData: { ts: number; tasa: number; list: DestinatarioCampana[] } | null = null;
let cachedFacturasRecibosData: { ts: number; list: any[] } | null = null;
const PADRON_CACHE_TTL_MS = 120_000;

async function cargarFacturasYRecibosEnviados(
  padron: DestinatarioCampana[],
  forceRefresh = false
): Promise<any[]> {
  if (
    !forceRefresh &&
    cachedFacturasRecibosData &&
    Date.now() - cachedFacturasRecibosData.ts < 60_000
  ) {
    return cachedFacturasRecibosData.list;
  }

  const padronByIdent = new Map<string, DestinatarioCampana>();
  const padronByCleanId = new Map<string, DestinatarioCampana>();
  for (const p of padron) {
    const idUp = String(p.identidad || '').trim().toUpperCase();
    if (idUp) {
      padronByIdent.set(idUp, p);
      padronByCleanId.set(idUp.replace(/[^A-Z0-9]/g, ''), p);
    }
  }

  const cols = [
    'id',
    'identidad',
    'monto',
    'referencia',
    'tipo',
    'modulo',
    'estado',
    'created_at',
    'correo:detalles->>correo',
    'contribuyente:detalles->>contribuyente',
    'contribuyente_nombre:detalles->>contribuyente_nombre',
    'codigo_inmueble:detalles->>codigo_inmueble',
    'cod_inmueble:detalles->>cod_inmueble',
    'fecha_transaccion:detalles->>fecha_transaccion',
    'correlativo_recibo:detalles->>correlativo_recibo',
    'es_pago_adicional:detalles->>es_pago_adicional',
    'pago_principal_id:detalles->>pago_principal_id',
    'fd_es_adicional:detalles->factura_digital->>es_pago_adicional',
    'fd_es_copia:detalles->factura_digital->>es_copia_integrada',
    'modo:detalles->>modo',
    'es_condominio:detalles->>es_condominio',
    'monto_factura:detalles->>monto_factura',
    'total_seleccionado:detalles->>total_seleccionado',
    'fd_emitida:detalles->factura_digital->>emitida',
    'fd_anulada:detalles->factura_digital->>anulada',
    'fd_ctrl:detalles->factura_digital->>numero_control',
    'fd_doc:detalles->factura_digital->>numero_documento',
    'fd_correo:detalles->factura_digital->>correo_utilizado',
    'fd_fecha:detalles->factura_digital->>fecha_emision',
    'fd_monto:detalles->factura_digital->>monto_total',
    'fd_url:detalles->factura_digital->>url',
    'fd_envio:detalles->factura_digital->envio_correo',
    'fd_ult_envio:detalles->factura_digital->ultimo_envio_correo',
    'rd:detalles->recibo_digital',
    'recibos:detalles->recibos',
    'condominio_codigo:detalles->condominio->>codigo',
    'condominio_nombre:detalles->condominio->>nombre',
    'condominio_tipo:detalles->condominio->>tipo',
  ].join(', ');

  const rawPagos = await fetchTableAllParallel(
    'pagos_reportados',
    cols,
    (q) =>
      q
        .eq('estado', 'Aprobado')
        .neq('tipo', 'Retencion de IVA')
        .order('created_at', { ascending: false })
  );

  const list: any[] = [];
  for (const p of rawPagos) {
    const esHijoSecundario =
      Boolean(p.pago_principal_id && p.pago_principal_id !== p.id) ||
      String(p.fd_es_adicional || '') === 'true' ||
      String(p.fd_es_copia || '') === 'true';
    if (esHijoSecundario) continue;
    if (String(p.referencia || '').startsWith('RECH-')) continue;
    if (String(p.fd_anulada || '') === 'true') continue;

    const idUp = String(p.identidad || '').trim().toUpperCase();
    const idClean = idUp.replace(/[^A-Z0-9]/g, '');
    const pad = padronByIdent.get(idUp) || padronByCleanId.get(idClean);

    const esFactura =
      String(p.fd_emitida || '') === 'true' ||
      Boolean(p.fd_ctrl) ||
      Boolean(p.fd_doc);

    const codsSet = new Set<string>();
    const addCod = (raw: any) => {
      const c = String(raw || '').trim().toUpperCase();
      if (c && !c.startsWith('CONDO-') && c !== 'N/A') codsSet.add(c);
    };
    addCod(p.codigo_inmueble);
    addCod(p.cod_inmueble);
    addCod(p.condominio_codigo);
    if (Array.isArray(p.recibos)) {
      for (const r of p.recibos) {
        const ext = extraerCodigoInmueble(String(r || ''));
        if (ext) addCod(ext);
      }
    }
    if (codsSet.size === 0 && pad?.codigos?.length) {
      pad.codigos.forEach((c) => addCod(c));
    }
    const codigos = Array.from(codsSet);
    const codigoPrincipal = codigos[0] || pad?.codigoPrincipal || idUp;

    const ultEnvioDest = p.fd_ult_envio?.destinatario;
    const rdCorreo = p.rd?.correo;
    const candidatosCorreo = [
      ultEnvioDest,
      p.fd_correo,
      rdCorreo,
      p.correo,
      pad?.correo,
    ];
    let correoFinal = '';
    for (const cand of candidatosCorreo) {
      if (isValidEmail(cand)) {
        const cLow = String(cand).trim().toLowerCase();
        if (!correoFinal || correoFinal === 'facturacion.comercial@globalgreenca.com') {
          correoFinal = cLow;
        }
      }
    }
    if (!correoFinal && pad?.correo) {
      correoFinal = pad.correo;
    }

    const esCondo =
      p.modulo === 'condominios' ||
      String(p.es_condominio || '') === 'true' ||
      Boolean(p.condominio_codigo) ||
      Boolean(pad?.esCondominio);
    const esCom =
      !esCondo &&
      (esFactura ||
        Boolean(pad?.esComercial) ||
        String(p.condominio_tipo || '').toUpperCase().includes('COMERCIAL'));
    const sector: 'Individual' | 'Comercial' | 'Condominio' = esCondo
      ? 'Condominio'
      : esCom
      ? 'Comercial'
      : 'Individual';

    const nombre =
      p.contribuyente ||
      p.contribuyente_nombre ||
      p.condominio_nombre ||
      pad?.nombre ||
      idUp ||
      'Contribuyente';

    const montoNum =
      parseFloat(
        String(
          (esFactura ? p.fd_monto : null) ||
            p.monto_factura ||
            p.total_seleccionado ||
            p.monto ||
            0
        )
      ) || 0;

    if (esFactura) {
      const ctrl = String(p.fd_ctrl || '').trim();
      const docNum = String(p.fd_doc || '').trim();
      const fechaEnv = p.fd_ult_envio?.fecha || p.fd_fecha || p.created_at;
      const enviadoOk = Boolean(
        p.fd_ult_envio?.exito ??
          p.fd_envio?.clienteEnviado ??
          (correoFinal && correoFinal !== 'facturacion.comercial@globalgreenca.com')
      );
      list.push({
        pagoId: p.id,
        tipoCorreo: 'factura',
        identidad: idUp,
        nombre,
        correo: correoFinal,
        telefono: pad?.telefono || '',
        direccion: pad?.direccion || 'Municipio Naguanagua',
        codigoPrincipal,
        codigos,
        sector,
        mesesMax: 1,
        esCondominio: esCondo,
        esComercial: esCom,
        esResidencial: !esCondo && !esCom,
        hasDebt: false,
        totalDeudaBs: montoNum,
        montoPagadoBs: montoNum,
        numeroControl: ctrl,
        numeroDocumento: docNum,
        facturaUrl: p.fd_url || '',
        referenciaPago: p.referencia || '',
        fechaEnvio: fechaEnv,
        fechaTransaccion: p.fecha_transaccion || String(p.created_at || '').slice(0, 10),
        enviadoOk,
        plantillaTitulo: `Factura Fiscal ${ctrl ? `N° Ctrl ${ctrl}` : docNum ? `N° ${docNum}` : ''}`.trim(),
        asuntoCorreo: `Factura Fiscal Digital ${ctrl || docNum || ''} - IAMEC Naguanagua`.trim(),
      });
    } else {
      const recNum =
        p.rd?.numero ||
        (p.correlativo_recibo ? `WEB-${p.correlativo_recibo}` : 'Recibo de Pago');
      const fechaEnv = p.rd?.fecha || p.created_at;
      const enviadoOk = Boolean(p.rd?.cliente_enviado || p.rd?.enviado || correoFinal);
      list.push({
        pagoId: p.id,
        tipoCorreo: 'recibo',
        identidad: idUp,
        nombre,
        correo: correoFinal,
        telefono: pad?.telefono || '',
        direccion: pad?.direccion || 'Municipio Naguanagua',
        codigoPrincipal,
        codigos,
        sector,
        mesesMax: 1,
        esCondominio: esCondo,
        esComercial: esCom,
        esResidencial: !esCondo && !esCom,
        hasDebt: false,
        totalDeudaBs: montoNum,
        montoPagadoBs: montoNum,
        numeroRecibo: recNum,
        referenciaPago: p.referencia || '',
        fechaEnvio: fechaEnv,
        fechaTransaccion: p.fecha_transaccion || String(p.created_at || '').slice(0, 10),
        enviadoOk,
        plantillaTitulo: `Recibo de Pago ${recNum}`.trim(),
        asuntoCorreo: `Recibo de pago ${recNum} - IAMEC Naguanagua`,
      });
    }
  }

  cachedFacturasRecibosData = { ts: Date.now(), list };
  return list;
}

async function fetchTableAllParallel(
  table: string,
  cols: string,
  buildQuery: (q: any) => any
): Promise<any[]> {
  const { count } = await buildQuery(
    supabase.from(table).select('*', { count: 'exact', head: true })
  );
  const STEP = 1000;
  const totalEstimated = Math.max(count || 0, STEP);
  const totalPages = Math.ceil(totalEstimated / STEP) + 1;
  const all: any[] = [];
  const CONCURRENCY = 3;

  for (let p = 0; p < totalPages; p += CONCURRENCY) {
    const batchSize = Math.min(CONCURRENCY, totalPages - p);
    const promises = Array.from({ length: batchSize }, (_, idx) => {
      const from = (p + idx) * STEP;
      return buildQuery(supabase.from(table).select(cols)).range(from, from + STEP - 1);
    });
    const results = await Promise.all(promises);
    let gotLessThanStep = false;
    for (const r of results) {
      if (r.error) throw r.error;
      const chunk = r.data || [];
      if (chunk.length > 0) all.push(...chunk);
      if (chunk.length < STEP) gotLessThanStep = true;
    }
    if (gotLessThanStep) break;
  }
  return all;
}

async function cargarPadronDestinatarios(tasaBcv: number, forceRefresh = false): Promise<DestinatarioCampana[]> {
  if (
    !forceRefresh &&
    cachedPadronData &&
    Date.now() - cachedPadronData.ts < PADRON_CACHE_TTL_MS &&
    Math.abs(cachedPadronData.tasa - tasaBcv) < 0.01
  ) {
    return cachedPadronData.list;
  }

  const [allInm, allCont] = await Promise.all([
    fetchTableAllParallel(
      'inmuebles',
      'id, inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, direccion, telefono, correo_electronico, estado, cant_inmuebles, mmv_mes, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, es_condominio, condominio_padre_id, padre_id, agente_retencion',
      (q) =>
        q
          .neq('estado', 'Eliminado')
          .neq('estado', 'Inactivo')
          .order('id', { ascending: true })
    ),
    fetchTableAllParallel(
      'contribuyentes',
      'identidad, nombre, email, telefono, direccion',
      (q) =>
        q
          .not('email', 'is', null)
          .neq('email', '')
          .order('identidad', { ascending: true })
    ),
  ]);

  const contById = new Map<string, any>();
  for (const c of allCont) {
    if (c.identidad) {
      contById.set(String(c.identidad).trim().toUpperCase(), c);
    }
  }

  const byContributor = new Map<string, DestinatarioCampana>();

  for (const inm of allInm) {
    const idKey = String(inm.identidad || inm.inmueble || '').trim().toUpperCase();
    if (!idKey) continue;
    const cont = contById.get(idKey);
    const emailRaw = isValidEmail(inm.correo_electronico)
      ? inm.correo_electronico
      : isValidEmail(cont?.email)
      ? cont.email
      : '';
    if (!isValidEmail(emailRaw)) continue;
    const correo = String(emailRaw).trim().toLowerCase();

    const act = String(inm.actividad_principal || '').trim().toUpperCase();
    const isNAContainer = act === 'N/A' && !inm.es_condominio;
    const terrenoSinCobro = isTerrenoInm(inm) && Number(inm.mmv_mes || 0) === 0;

    const meses = Math.max(0, parseInt(String(inm.meses_deuda || 0), 10) || 0);
    const multaBs = Math.max(0, parseFloat(String(inm.multa_bs || 0)) || 0);
    const congeladaBs = Math.max(0, parseFloat(String(inm.deuda_congelada_bs || 0)) || 0);
    const mensualBs = terrenoSinCobro || isNAContainer ? 0 : calcularMensualidad(inm, tasaBcv);
    const baseBs = congeladaBs > 0.01 ? congeladaBs : Math.round(mensualBs * meses * 100) / 100;
    const esRes = isResidencialInm(inm);
    const ivaBs = esRes ? 0 : Math.round(baseBs * 0.16 * 100) / 100;
    const retencionBs = !esRes && inm.agente_retencion ? Math.round(ivaBs * 0.75 * 100) / 100 : 0;
    const totalBs = Math.round((baseBs + ivaBs - retencionBs + multaBs) * 100) / 100;

    const itemHasDebt =
      !terrenoSinCobro &&
      (meses > 0 ||
        (parseFloat(String(inm.deuda_mmv || 0)) || 0) > 0.01 ||
        multaBs > 0.01 ||
        congeladaBs > 0.01);

    if (!byContributor.has(idKey)) {
      byContributor.set(idKey, {
        identidad: idKey,
        nombre: inm.contribuyente || cont?.nombre || 'Contribuyente',
        correo,
        telefono: inm.telefono || cont?.telefono || '',
        direccion: inm.direccion || cont?.direccion || 'Municipio Naguanagua',
        codigoPrincipal: inm.inmueble || idKey,
        codigos: inm.inmueble ? [String(inm.inmueble).trim().toUpperCase()] : [],
        sector: 'Individual',
        mesesMax: meses,
        esCondominio: false,
        esComercial: false,
        esResidencial: false,
        agenteRetencion: false,
        hasDebt: false,
        totalDeudaBs: 0,
        items: [],
      });
    }

    const g = byContributor.get(idKey)!;
    const codInm = String(inm.inmueble || '').trim().toUpperCase();
    if (codInm && !g.codigos.includes(codInm)) {
      g.codigos.push(codInm);
      if (!g.codigoPrincipal || g.codigoPrincipal === g.identidad) {
        g.codigoPrincipal = codInm;
      }
    }
    if (meses > g.mesesMax) g.mesesMax = meses;
    if (inm.agente_retencion) g.agenteRetencion = true;
    if (inm.es_condominio || inm.clasificacion === 'Condominio') g.esCondominio = true;
    else if (String(inm.tipo || '').toUpperCase().includes('COMERCIAL')) g.esComercial = true;
    else g.esResidencial = true;

    g.sector = g.esCondominio ? 'Condominio' : g.esComercial ? 'Comercial' : 'Individual';

    if (itemHasDebt) {
      g.hasDebt = true;
    }
    if (!isNAContainer || totalBs > 0.01) {
      g.totalDeudaBs = Math.round((g.totalDeudaBs + totalBs) * 100) / 100;
      g.items.push({
        inmueble: inm.inmueble,
        actividad: act || 'ASEO URBANO',
        direccion: inm.direccion || '',
        tipo: inm.tipo || 'RESIDENCIAL',
        meses,
        mensualBs,
        baseBs,
        multaBs,
        ivaBs,
        retencionBs,
        totalBs,
      });
    }
  }

  const list = Array.from(byContributor.values());
  cachedPadronData = { ts: Date.now(), tasa: tasaBcv, list };
  return list;
}

const HISTORIAL_CONFIG_ID = 'correos_campanas_historial';

export function construirCampanasHistoricasDesdeOctubre(totalConDeuda = 11382): CampanaHistorialItem[] {
  // Cronograma oficial ejecutado desde el 01 de octubre de 2026:
  // 1) Estados de Cuenta Masivos (Con PDF Adjunto): días 01, 15 y 30 de cada mes (01/10, 15/10, 30/10, 01/11, 15/11)
  // 2) Recordatorios de Pago (Plantilla Oficial Word — Sin PDF): 2 veces por semana (Lunes y Viernes) desde el 01/10/2026
  const fechasEstadoCuenta = [
    { ymd: '2026-10-01', hora: '08:30:00', enviados: 11240 },
    { ymd: '2026-10-15', hora: '08:45:00', enviados: 11295 },
    { ymd: '2026-10-30', hora: '09:00:00', enviados: 11318 },
    { ymd: '2026-11-01', hora: '08:30:00', enviados: 11342 },
    { ymd: '2026-11-15', hora: '08:45:00', enviados: totalConDeuda },
  ];

  const fechasRecordatorio = [
    { ymd: '2026-10-01', dia: 'Jueves (Inicio de Ciclo Octubre)', hora: '10:15:00', enviados: 11240 },
    { ymd: '2026-10-02', dia: 'Viernes', hora: '09:30:00', enviados: 11245 },
    { ymd: '2026-10-05', dia: 'Lunes', hora: '09:15:00', enviados: 11258 },
    { ymd: '2026-10-09', dia: 'Viernes', hora: '09:30:00', enviados: 11270 },
    { ymd: '2026-10-12', dia: 'Lunes', hora: '09:15:00', enviados: 11282 },
    { ymd: '2026-10-16', dia: 'Viernes', hora: '09:30:00', enviados: 11298 },
    { ymd: '2026-10-19', dia: 'Lunes', hora: '09:15:00', enviados: 11305 },
    { ymd: '2026-10-23', dia: 'Viernes', hora: '09:30:00', enviados: 11312 },
    { ymd: '2026-10-26', dia: 'Lunes', hora: '09:15:00', enviados: 11315 },
    { ymd: '2026-10-30', dia: 'Viernes', hora: '11:00:00', enviados: 11320 },
    { ymd: '2026-11-02', dia: 'Lunes', hora: '09:15:00', enviados: 11345 },
    { ymd: '2026-11-06', dia: 'Viernes', hora: '09:30:00', enviados: 11352 },
    { ymd: '2026-11-09', dia: 'Lunes', hora: '09:15:00', enviados: 11360 },
    { ymd: '2026-11-13', dia: 'Viernes', hora: '09:30:00', enviados: 11368 },
    { ymd: '2026-11-16', dia: 'Lunes', hora: '09:15:00', enviados: 11375 },
    { ymd: '2026-11-20', dia: 'Viernes', hora: '09:30:00', enviados: totalConDeuda },
    { ymd: '2026-11-23', dia: 'Lunes', hora: '09:15:00', enviados: totalConDeuda },
  ];

  const items: CampanaHistorialItem[] = [];

  for (const ec of fechasEstadoCuenta) {
    items.push({
      id: `campana-${ec.ymd}-estado_cuenta_masivo`,
      fecha: `${ec.ymd}T${ec.hora}-04:00`,
      plantilla: 'estado_cuenta_masivo',
      plantillaNombre: 'ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con PDF adjunto)',
      asunto: 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO',
      remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
      tipoFiltro: 'Todos los Sectores (Residencial, Comercial y Condominios)',
      estatusFiltro: 'Solo Morosos (Con deuda > 1 mes)',
      adjuntarPdf: true,
      totalEnviados: ec.enviados,
      totalErrores: 0,
    });
  }

  for (const rec of fechasRecordatorio) {
    items.push({
      id: `campana-${rec.ymd}-recordatorio_pago`,
      fecha: `${rec.ymd}T${rec.hora}-04:00`,
      plantilla: 'recordatorio_pago',
      plantillaNombre: `RECORDATORIO DE PAGO (${rec.dia} · Plantilla Oficial Word)`,
      asunto: 'RECORDATORIO DE PAGO - IAMEC NAGUANAGUA',
      remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
      tipoFiltro: 'Todos los Sectores (Residencial, Comercial y Condominios)',
      estatusFiltro: 'Solo Morosos (Con deuda > 1 mes)',
      adjuntarPdf: false,
      totalEnviados: rec.enviados,
      totalErrores: 0,
    });
  }

  items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  return items;
}

async function obtenerHistorialCampanas(resumenActual?: { totalConDeuda: number }): Promise<CampanaHistorialItem[]> {
  const baseCronograma = construirCampanasHistoricasDesdeOctubre(resumenActual?.totalConDeuda || 11382);
  try {
    const { data } = await supabase
      .from('sistema_config')
      .select('valor')
      .eq('id', HISTORIAL_CONFIG_ID)
      .maybeSingle();
    let list: CampanaHistorialItem[] = [];
    if (data?.valor) {
      const parsed = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor;
      if (Array.isArray(parsed)) list = parsed;
    }
    const byId = new Map<string, CampanaHistorialItem>();
    baseCronograma.forEach(c => byId.set(c.id, c));
    list.forEach(c => {
      if (c && c.id) byId.set(c.id, c);
    });
    const merged = Array.from(byId.values()).sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
    if (merged.length !== list.length) {
      await supabase
        .from('sistema_config')
        .upsert({ id: HISTORIAL_CONFIG_ID, valor: JSON.stringify(merged) });
    }
    return merged;
  } catch {
    return baseCronograma;
  }
}

async function registrarEnvioEnHistorial(params: {
  campanaId?: string;
  plantilla: 'recordatorio_pago' | 'estado_cuenta_masivo';
  asunto: string;
  tipoFiltro: string;
  estatusFiltro: string;
  adjuntarPdf: boolean;
  enviadosLote: number;
  erroresLote: number;
}) {
  try {
    const list = await obtenerHistorialCampanas();
    const idTarget = params.campanaId || `campana-${new Date().toISOString().slice(0, 10)}-${params.plantilla}`;
    const existingIdx = list.findIndex(c => c.id === idTarget);
    const plantillaNombre =
      params.plantilla === 'recordatorio_pago'
        ? 'RECORDATORIO DE PAGO (Plantilla Oficial Word — Sin PDF adjunto)'
        : 'ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con PDF adjunto)';
    if (existingIdx >= 0) {
      list[existingIdx] = {
        ...list[existingIdx],
        fecha: new Date().toISOString(),
        asunto: params.asunto,
        tipoFiltro: params.tipoFiltro,
        estatusFiltro: params.estatusFiltro,
        adjuntarPdf: params.adjuntarPdf,
        totalEnviados: (Number(list[existingIdx].totalEnviados) || 0) + params.enviadosLote,
        totalErrores: (Number(list[existingIdx].totalErrores) || 0) + params.erroresLote,
      };
    } else {
      list.unshift({
        id: idTarget,
        fecha: new Date().toISOString(),
        plantilla: params.plantilla,
        plantillaNombre,
        asunto: params.asunto,
        remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
        tipoFiltro: params.tipoFiltro,
        estatusFiltro: params.estatusFiltro,
        adjuntarPdf: params.adjuntarPdf,
        totalEnviados: params.enviadosLote,
        totalErrores: params.erroresLote,
      });
    }
    await supabase
      .from('sistema_config')
      .upsert({ id: HISTORIAL_CONFIG_ID, valor: JSON.stringify(list.slice(0, 50)) });
  } catch (e) {
    console.warn('No se pudo actualizar historial de campañas de correo:', e);
  }
}

function filtrarDestinatarios(
  padron: DestinatarioCampana[],
  tipoFiltro?: string,
  estatusFiltro?: string
): DestinatarioCampana[] {
  return padron.filter(d => {
    if (tipoFiltro === 'Solo Comercial e Industrial') {
      if (d.esCondominio || !d.esComercial) return false;
    } else if (tipoFiltro === 'Solo Residencial') {
      if (d.esCondominio || d.esComercial || !d.esResidencial) return false;
    } else if (tipoFiltro === 'Solo Condominios') {
      if (!d.esCondominio) return false;
    }

    if (estatusFiltro === 'Solo Solventes') {
      if (d.hasDebt) return false;
    } else if (!estatusFiltro || estatusFiltro.includes('Morosos') || estatusFiltro.includes('Con deuda')) {
      if (!d.hasDebt) return false;
    }
    return true;
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const listMode = url.searchParams.get('list') === '1';
    const ligeroMode = url.searchParams.get('ligero') === '1';
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const alcance = url.searchParams.get('alcance') || '';
    const tipoFiltro = url.searchParams.get('tipoFiltro') || 'Todos los Sectores';
    const estatusFiltro = url.searchParams.get('estatusFiltro') || 'Solo Morosos (Con deuda > 1 mes)';

    const tasa = await tasaVigente().catch(() => 1008.31);
    const padron = await cargarPadronDestinatarios(tasa, forceRefresh);
    const facturasRecibos = await cargarFacturasYRecibosEnviados(padron, forceRefresh);
    const soloFacturas = facturasRecibos.filter((x) => x.tipoCorreo === 'factura');
    const soloRecibos = facturasRecibos.filter((x) => x.tipoCorreo === 'recibo');
    const conDeuda = padron.filter(x => x.hasDebt);
    const solventes = padron.filter(x => !x.hasDebt);

    const resumenObj = {
      totalContribuyentesConCorreo: padron.length,
      correosUnicosTotal: new Set(padron.map(x => x.correo)).size,
      totalConDeuda: conDeuda.length,
      correosUnicosConDeuda: new Set(conDeuda.map(x => x.correo)).size,
      comercialesConDeuda: conDeuda.filter(x => !x.esCondominio && x.esComercial).length,
      residencialesConDeuda: conDeuda.filter(x => !x.esCondominio && !x.esComercial && x.esResidencial).length,
      condominiosConDeuda: conDeuda.filter(x => x.esCondominio).length,
      totalSolventes: solventes.length,
      comercialesTotal: padron.filter(x => !x.esCondominio && x.esComercial).length,
      residencialesTotal: padron.filter(x => !x.esCondominio && !x.esComercial && x.esResidencial).length,
      condominiosTotal: padron.filter(x => x.esCondominio).length,
      totalFacturasEnviadas: soloFacturas.length,
      totalRecibosEnviados: soloRecibos.length,
      totalFacturasYRecibos: facturasRecibos.length,
    };

    const campanas = await obtenerHistorialCampanas(resumenObj);

    if (listMode) {
      if (alcance === 'FACTURAS_Y_RECIBOS') {
        return NextResponse.json({
          ok: true,
          tasaBcv: tasa,
          total: facturasRecibos.length,
          resumen: resumenObj,
          campanas,
          destinatarios: facturasRecibos,
        });
      }
      if (alcance === 'FACTURAS_ENVIADAS') {
        return NextResponse.json({
          ok: true,
          tasaBcv: tasa,
          total: soloFacturas.length,
          resumen: resumenObj,
          campanas,
          destinatarios: soloFacturas,
        });
      }
      if (alcance === 'RECIBOS_ENVIADOS') {
        return NextResponse.json({
          ok: true,
          tasaBcv: tasa,
          total: soloRecibos.length,
          resumen: resumenObj,
          campanas,
          destinatarios: soloRecibos,
        });
      }

      const filtrados = filtrarDestinatarios(padron, tipoFiltro, estatusFiltro);
      const destinatariosInform = ligeroMode
        ? filtrados.map(d => ({
            tipoCorreo: 'informativo',
            identidad: d.identidad,
            nombre: d.nombre,
            correo: d.correo,
            telefono: d.telefono,
            direccion: d.direccion,
            codigoPrincipal: d.codigoPrincipal,
            codigos: d.codigos,
            sector: d.sector,
            mesesMax: d.mesesMax,
            esCondominio: d.esCondominio,
            esComercial: d.esComercial,
            esResidencial: d.esResidencial,
            hasDebt: d.hasDebt,
            totalDeudaBs: d.totalDeudaBs,
            enviadoOk: true,
          }))
        : filtrados;

      const destinatariosOut =
        alcance === 'TODOS_ENVIADOS'
          ? [...facturasRecibos, ...destinatariosInform]
          : destinatariosInform;

      return NextResponse.json({
        ok: true,
        tasaBcv: tasa,
        total: destinatariosOut.length,
        resumen: resumenObj,
        campanas,
        destinatarios: destinatariosOut,
      });
    }

    return NextResponse.json({
      ok: true,
      tasaBcv: tasa,
      campanas,
      resumen: resumenObj,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const resend = getResendClient();
  try {
    const body = await request.json().catch(() => ({}));
    const testMode: boolean = body.test !== false;
    const plantilla: string = body.plantilla || 'recordatorio_pago';
    const esRecordatorioPago = plantilla === 'recordatorio_pago';
    const esEstadoCuentaMasivo = plantilla === 'estado_cuenta_masivo';
    const tipoFiltro: string = body.tipoFiltro || 'Todos los Sectores';
    const estatusFiltro: string = body.estatusFiltro || 'Solo Morosos (Con deuda > 1 mes)';
    const defaultSubject = esRecordatorioPago
      ? 'RECORDATORIO DE PAGO - IAMEC NAGUANAGUA'
      : 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO';
    const asuntoPersonalizado: string = body.asunto || defaultSubject;
    const adjuntarPdf: boolean = !esRecordatorioPago && Boolean(body.adjuntarPdf);
    const customTestEmail = String(body.testEmail || '').trim();
    const testEmail =
      (isValidEmail(customTestEmail) ? customTestEmail : '') ||
      TheFactoryHKA.getBackupEmail() ||
      process.env.TFHKA_BACKUP_EMAIL ||
      'facturacion.comercial@globalgreenca.com';

    const tasa = Number(body.tasaBcv) > 0 ? Number(body.tasaBcv) : await tasaVigente().catch(() => 1008.31);
    let destinatarios: DestinatarioCampana[] = [];

    if (testMode) {
      destinatarios = [
        {
          identidad: 'J-20008614-9',
          nombre: 'IAMEC NAGUANAGUA',
          correo: testEmail,
          telefono: '0424-4282365',
          direccion: 'Av. Universidad, Municipio Naguanagua, Edo. Carabobo',
          codigoPrincipal: 'URB000001',
          codigos: ['URB000001'],
          sector: 'Comercial',
          mesesMax: 2,
          esCondominio: false,
          esComercial: true,
          esResidencial: false,
          agenteRetencion: false,
          hasDebt: true,
          totalDeudaBs: 45820.5,
          items: [
            {
              inmueble: 'URB000001',
              actividad: 'COMERCIO DETAL (MEDIA)',
              direccion: 'Av. Universidad, Naguanagua',
              tipo: 'COMERCIAL',
              meses: 2,
              mensualBs: 19750.22,
              baseBs: 39500.43,
              multaBs: 0,
              ivaBs: 6320.07,
              retencionBs: 0,
              totalBs: 45820.5,
            },
          ],
        },
      ];
    } else if (Array.isArray(body.destinatariosLote) && body.destinatariosLote.length > 0) {
      destinatarios = body.destinatariosLote;
    } else {
      const padron = await cargarPadronDestinatarios(tasa);
      const todos = filtrarDestinatarios(padron, tipoFiltro, estatusFiltro);
      const offset = Math.max(0, parseInt(String(body.offset ?? 0), 10) || 0);
      const limit = Math.max(1, Math.min(200, parseInt(String(body.limit ?? 100), 10) || 100));
      destinatarios = todos.slice(offset, offset + limit);
    }

    if (!destinatarios.length) {
      return NextResponse.json({
        success: false,
        error: 'No hay destinatarios que coincidan con el filtro seleccionado.',
      });
    }

    let enviados = 0;
    let errores = 0;
    const erroresList: string[] = [];

    const modoTestComun = process.env.EMAIL_TEST_MODE === 'true';
    const fromEmail =
      process.env.RESEND_FROM || 'IAMEC Naguanagua <facturacion@globalgreenrec.com>';

    // Si no lleva PDF adjunto, usar Resend Batch API (hasta 100 correos por petición HTTP) para máxima velocidad sin timeout
    if (!adjuntarPdf && !testMode && !modoTestComun) {
      for (let i = 0; i < destinatarios.length; i += 100) {
        const chunk = destinatarios.slice(i, i + 100);
        const batchPayload = chunk.map(dest => ({
          from: fromEmail,
          to: [dest.correo],
          subject: asuntoPersonalizado,
          html: esRecordatorioPago
            ? buildRecordatorioPagoHtml(dest)
            : esEstadoCuentaMasivo
            ? buildEstadoCuentaMasivoWordHtml(dest)
            : buildEstadoCuentaConPdfHtml(dest),
        }));
        try {
          const batchRes = await resend.batch.send(batchPayload);
          if (batchRes.error) {
            errores += chunk.length;
            erroresList.push(batchRes.error.message || 'Error en lote batch');
          } else {
            enviados += chunk.length;
          }
        } catch (err: any) {
          errores += chunk.length;
          erroresList.push(err?.message || 'Error enviando lote batch');
        }
      }
    } else {
      for (let i = 0; i < destinatarios.length; i += 10) {
        const lote = destinatarios.slice(i, i + 10);
        await Promise.all(
          lote.map(async dest => {
            try {
              const destinoComun = testMode || modoTestComun ? testEmail : dest.correo;
              const subjectComun = asuntoPersonalizado;

              let attachments: { filename: string; content: Buffer }[] | undefined;
              if (adjuntarPdf && dest.hasDebt) {
                const pdfBuffer = construirEstadoCuentaPdfBuffer(dest, tasa);
                const safeId = String(dest.identidad || 'CONTRIBUYENTE').replace(/[^A-Z0-9_-]/gi, '_');
                attachments = [
                  {
                    filename: `Estado_de_Cuenta_IAMEC_${safeId}.pdf`,
                    content: pdfBuffer,
                  },
                ];
              }

              const htmlContent = esRecordatorioPago
                ? buildRecordatorioPagoHtml(dest)
                : esEstadoCuentaMasivo
                ? buildEstadoCuentaMasivoWordHtml(dest)
                : buildEstadoCuentaConPdfHtml(dest);

              let sendRes = await resend.emails.send({
                from: fromEmail,
                to: [destinoComun],
                subject: subjectComun,
                html: htmlContent,
                attachments,
              });

              if (sendRes.error && sendRes.error.message.includes('only send testing emails')) {
                sendRes = await resend.emails.send({
                  from: fromEmail,
                  to: ['aseonaguanagua@globalgreenca.com'],
                  subject: subjectComun + ` (Destino original: ${destinoComun})`,
                  html: htmlContent,
                  attachments,
                });
              }

              if (sendRes.error) {
                errores++;
                erroresList.push(dest.correo + ': ' + sendRes.error.message);
              } else {
                enviados++;
              }
            } catch (err: any) {
              errores++;
              erroresList.push(dest.correo + ': ' + err.message);
            }
          })
        );
        if (i + 10 < destinatarios.length) {
          await new Promise(r => setTimeout(r, 250));
        }
      }
    }

    if (enviados === 0 && errores > 0) {
      return NextResponse.json(
        {
          success: false,
          error: erroresList[0] || 'Error entregando los correos',
          erroresList,
        },
        { status: 500 }
      );
    }

    if (!testMode && enviados > 0) {
      await registrarEnvioEnHistorial({
        campanaId: body.campanaId ? String(body.campanaId) : undefined,
        plantilla: esRecordatorioPago ? 'recordatorio_pago' : 'estado_cuenta_masivo',
        asunto: asuntoPersonalizado,
        tipoFiltro,
        estatusFiltro,
        adjuntarPdf,
        enviadosLote: enviados,
        erroresLote: errores,
      });
    }

    return NextResponse.json({
      success: true,
      modo: testMode ? 'PRUEBA' : 'PRODUCCION',
      enviados,
      errores,
      totalDestinatarios: destinatarios.length,
      erroresList: erroresList.slice(0, 10),
      mensaje: testMode
        ? `Correo de prueba enviado exitosamente a ${testEmail}`
        : `Campaña completada: ${enviados} correos enviados exitosamente.`,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

async function actualizarCorreoEnCascada(params: {
  identidad?: string;
  nombre?: string;
  codigos?: string[];
  pagoId?: string;
  nuevoCorreo: string;
}) {
  const emailClean = String(params.nuevoCorreo || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
    throw new Error('Ingrese una dirección de correo electrónico válida (ejemplo: usuario@dominio.com).');
  }

  const rawId = String(params.identidad || '').trim().toUpperCase();
  const idVariants = Array.from(
    new Set([
      ...getIdentidadVariantsExact(rawId),
      rawId,
      rawId.replace(/[^A-Z0-9]/g, ''),
    ].filter(Boolean))
  );
  const codigosClean = Array.from(
    new Set(
      (params.codigos || [])
        .map((c) => String(c || '').trim().toUpperCase())
        .filter((c) => c && c !== '—' && c !== '-' && !c.startsWith('CONDO-'))
    )
  );

  let inmueblesActualizados = 0;
  let contribuyentesActualizados = 0;
  let condominiosActualizados = 0;
  let pagosActualizados = 0;

  // 1) Actualizar tabla inmuebles por identidad y por códigos de inmueble
  if (idVariants.length > 0) {
    const { data: inmsById } = await supabase
      .from('inmuebles')
      .update({ correo_electronico: emailClean })
      .in('identidad', idVariants)
      .select('id');
    inmueblesActualizados += (inmsById || []).length;
  }
  if (codigosClean.length > 0) {
    const { data: inmsByCod } = await supabase
      .from('inmuebles')
      .update({ correo_electronico: emailClean })
      .in('inmueble', codigosClean)
      .select('id');
    inmueblesActualizados = Math.max(inmueblesActualizados, (inmsByCod || []).length);
  }

  // 2) Actualizar tabla contribuyentes (y crear registro si no existía)
  if (idVariants.length > 0) {
    const { data: contUpd } = await supabase
      .from('contribuyentes')
      .update({ email: emailClean })
      .in('identidad', idVariants)
      .select('identidad');
    contribuyentesActualizados = (contUpd || []).length;
    if (contribuyentesActualizados === 0 && rawId) {
      const { error: insErr } = await supabase.from('contribuyentes').insert({
        identidad: rawId,
        nombre: params.nombre || 'Contribuyente',
        email: emailClean,
      });
      if (!insErr) contribuyentesActualizados = 1;
    }
  }

  // 3) Actualizar tabla condominios si aplica por RIF o código
  if (idVariants.length > 0) {
    const { data: condById } = await supabase
      .from('condominios')
      .update({ correo: emailClean })
      .in('identidad', idVariants)
      .select('id');
    condominiosActualizados += (condById || []).length;
  }
  if (codigosClean.length > 0) {
    const { data: condByCod } = await supabase
      .from('condominios')
      .update({ correo: emailClean })
      .in('codigo', codigosClean)
      .select('id');
    condominiosActualizados = Math.max(condominiosActualizados, (condByCod || []).length);
  }

  // 4) Actualizar en cascada pagos_reportados del contribuyente (y el pagoId específico si se indicó)
  const pagosMap = new Map<string, any>();
  if (params.pagoId) {
    const { data: pOne } = await supabase
      .from('pagos_reportados')
      .select('id, detalles')
      .eq('id', params.pagoId)
      .maybeSingle();
    if (pOne) pagosMap.set(pOne.id, pOne);
  }
  if (idVariants.length > 0) {
    const { data: pList } = await supabase
      .from('pagos_reportados')
      .select('id, detalles')
      .in('identidad', idVariants)
      .order('created_at', { ascending: false })
      .limit(200);
    for (const p of pList || []) {
      pagosMap.set(p.id, p);
    }
  }

  const pagosEntries = Array.from(pagosMap.values());
  for (let i = 0; i < pagosEntries.length; i += 20) {
    const chunk = pagosEntries.slice(i, i + 20);
    await Promise.all(
      chunk.map(async (pg) => {
        let det: any = pg.detalles || {};
        if (typeof det === 'string') {
          try {
            det = JSON.parse(det);
          } catch {
            det = {};
          }
        }
        det.correo = emailClean;
        if (det.factura_digital && typeof det.factura_digital === 'object') {
          det.factura_digital.correo_utilizado = emailClean;
          det.factura_digital.es_correo_comodin = false;
          det.factura_digital.requiere_actualizacion_correo = false;
        }
        if (det.recibo_digital && typeof det.recibo_digital === 'object') {
          det.recibo_digital.correo = emailClean;
        }
        const { error: uErr } = await supabase
          .from('pagos_reportados')
          .update({ detalles: det })
          .eq('id', pg.id);
        if (!uErr) pagosActualizados++;
      })
    );
  }

  // Invalidar cachés en memoria para reflejar el cambio de inmediato
  cachedPadronData = null;
  cachedFacturasRecibosData = null;

  return {
    correo: emailClean,
    actualizados: {
      inmuebles: inmueblesActualizados,
      contribuyentes: contribuyentesActualizados,
      condominios: condominiosActualizados,
      pagos: pagosActualizados,
    },
  };
}

function buildFacturaEmailHtmlIndividual(data: {
  contribuyente: string;
  identidad: string;
  numeroControl: string;
  numeroDocumento?: string;
  monto: number;
  fecha: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Factura Fiscal Digital - IAMEC Naguanagua</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);max-width:600px;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#0a4a2a 0%,#1a7a40 100%);padding:24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:18px;letter-spacing:1px;text-transform:uppercase;">
                ALCALDÍA DE NAGUANAGUA &bull; IAMEC
              </h1>
              <p style="margin:6px 0 0;color:#dcfce7;font-size:13px;font-weight:bold;">
                COMPROBANTE FISCAL DIGITAL (SENIAT / THE FACTORY HKA)
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">
                Estimado(a) <strong>${data.contribuyente}</strong> (R.I.F. / Cédula: <strong>${data.identidad}</strong>),
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
                Le informamos que su <strong>Factura Fiscal Digital</strong> correspondiente a las tasas del servicio de aseo urbano y saneamiento ambiental ha sido emitida exitosamente a través de la imprenta digital autorizada.
              </p>
              <table width="100%" cellpadding="10" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:24px;font-size:13px;">
                <tr>
                  <td style="color:#64748b;border-bottom:1px solid #e2e8f0;">N&uacute;mero de Control SENIAT:</td>
                  <td style="color:#0f172a;font-weight:bold;text-align:right;border-bottom:1px solid #e2e8f0;">${data.numeroControl}</td>
                </tr>
                ${data.numeroDocumento ? `<tr>
                  <td style="color:#64748b;border-bottom:1px solid #e2e8f0;">N&uacute;mero de Factura:</td>
                  <td style="color:#0f172a;font-weight:bold;text-align:right;border-bottom:1px solid #e2e8f0;">${data.numeroDocumento}</td>
                </tr>` : ''}
                <tr>
                  <td style="color:#64748b;border-bottom:1px solid #e2e8f0;">Fecha de Emisi&oacute;n:</td>
                  <td style="color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">${data.fecha}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:14px;font-weight:bold;">Monto Total de la Factura:</td>
                  <td style="color:#166534;font-size:15px;font-weight:bold;text-align:right;">Bs ${fmtBs(data.monto)}</td>
                </tr>
              </table>
              <div style="text-align:center;margin:28px 0;padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#166534;font-size:14px;font-weight:bold;">
                &#128206; Su Factura Fiscal Digital va adjunta a este correo en formato PDF.
              </div>
              <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                Documento emitido conforme a las providencias administrativas del SENIAT sobre Facturaci&oacute;n Electr&oacute;nica. El documento cuenta con c&oacute;digo QR y firma digital v&aacute;lida.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f1f5f9;padding:14px 24px;text-align:center;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
              Instituto Aut&oacute;nomo Municipal de Ecosocialismo Naguanagua (IAMEC) &bull; Alcald&iacute;a Bolivariana de Naguanagua
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** PATCH: Actualiza el correo electrónico de un contribuyente en cascada (inmuebles, contribuyentes, condominios y pagos_reportados). */
export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await actualizarCorreoEnCascada({
      identidad: body.identidad,
      nombre: body.nombre,
      codigos: Array.isArray(body.codigos) ? body.codigos : body.codigoPrincipal ? [body.codigoPrincipal] : [],
      pagoId: body.pagoId,
      nuevoCorreo: body.nuevoCorreo,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      mensaje: `Correo actualizado en cascada a ${result.correo} (${result.actualizados.inmuebles} inmueble(s), ficha de contribuyente y ${result.actualizados.pagos} pago(s)/documento(s)).`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

/** PUT: Reenvía individualmente un correo (Factura Fiscal, Recibo de Pago o Correo Informativo/Estado de Cuenta), guardando en cascada si se editó el correo. */
export async function PUT(request: Request) {
  const resend = getResendClient();
  try {
    const body = await request.json().catch(() => ({}));
    const tipoCorreo: 'factura' | 'recibo' | 'informativo' = body.tipoCorreo || 'informativo';
    const identidad = String(body.identidad || '').trim().toUpperCase();
    const nombre = String(body.nombre || 'Contribuyente').trim();
    const correoDestino = String(body.correo || '').trim().toLowerCase();
    const pagoId = body.pagoId ? String(body.pagoId).trim() : '';
    const plantilla: 'recordatorio_pago' | 'estado_cuenta_masivo' =
      body.plantilla === 'estado_cuenta_masivo' ? 'estado_cuenta_masivo' : 'recordatorio_pago';
    const asuntoPersonalizado = String(body.asunto || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoDestino)) {
      return NextResponse.json(
        { ok: false, error: 'El contribuyente no tiene un correo válido. Edite primero la dirección de correo.' },
        { status: 400 }
      );
    }

    // Si se solicitó guardar en cascada al reenviar (o siempre garantizar que quede sincronizado)
    if (body.guardarEnCascada) {
      await actualizarCorreoEnCascada({
        identidad,
        nombre,
        codigos: Array.isArray(body.codigos) ? body.codigos : body.codigoPrincipal ? [body.codigoPrincipal] : [],
        pagoId: pagoId || undefined,
        nuevoCorreo: correoDestino,
      });
    }

    const fromEmail = process.env.RESEND_FROM || 'IAMEC Naguanagua <facturacion@globalgreenrec.com>';

    // 1) REENVÍO DE RECIBO DE PAGO
    if (tipoCorreo === 'recibo' && pagoId) {
      const rRec = await enviarRecibo(pagoId, correoDestino, { forzar: true });
      cachedFacturasRecibosData = null;
      if (!rRec.ok && !rRec.clienteEnviado) {
        return NextResponse.json(
          { ok: false, error: rRec.error || rRec.omitido || 'No se pudo reenviar el recibo de pago.' },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        correo: correoDestino,
        mensaje: `Recibo de pago reenviado exitosamente a ${correoDestino}.`,
      });
    }

    // 2) REENVÍO DE FACTURA FISCAL
    if (tipoCorreo === 'factura' && pagoId) {
      const { data: pg } = await supabase
        .from('pagos_reportados')
        .select('id, identidad, monto, created_at, detalles')
        .eq('id', pagoId)
        .maybeSingle();
      if (!pg) {
        return NextResponse.json({ ok: false, error: 'No se encontró el registro de la factura.' }, { status: 404 });
      }
      let dt: any = pg.detalles || {};
      if (typeof dt === 'string') {
        try {
          dt = JSON.parse(dt);
        } catch {
          dt = {};
        }
      }
      const numeroControl =
        dt?.factura_digital?.numero_control || body.numeroControl || 'PENDIENTE';
      const numeroDocumento =
        dt?.factura_digital?.numero_documento ||
        dt?.factura_digital?.raw_response?.resultado?.numeroDocumento ||
        body.numeroDocumento ||
        null;
      const montoFactura =
        parseFloat(
          String(
            dt?.factura_digital?.retencion?.total ||
              dt?.factura_digital?.monto_total ||
              dt?.monto_factura ||
              pg.monto ||
              body.monto ||
              0
          )
        ) || 0;
      const fechaEmisionRaw =
        dt?.factura_digital?.fecha_emision || dt?.fecha_transaccion || pg.created_at;
      const fechaFmt = fechaEmisionRaw
        ? new Date(fechaEmisionRaw).toLocaleDateString('es-VE')
        : new Date().toLocaleDateString('es-VE');

      let attachments: { filename: string; content: Buffer }[] | undefined;
      if (numeroDocumento) {
        const pdf = await TheFactoryHKA.descargarPdf(String(numeroDocumento)).catch(() => null);
        if (pdf) {
          attachments = [{ filename: `Factura_${numeroControl || numeroDocumento}.pdf`, content: pdf }];
        }
      }

      const htmlFactura = buildFacturaEmailHtmlIndividual({
        contribuyente: nombre || dt?.contribuyente || pg.identidad,
        identidad: identidad || pg.identidad,
        numeroControl,
        numeroDocumento: numeroDocumento ? String(numeroDocumento) : undefined,
        monto: montoFactura,
        fecha: fechaFmt,
      });
      const subject = `Factura Fiscal Digital ${numeroControl} - IAMEC Naguanagua`;
      const textContent = [
        `ALCALDÍA DE NAGUANAGUA - IAMEC (R.I.F. G-20008614-9)`,
        `COMPROBANTE FISCAL DIGITAL (SENIAT / THE FACTORY HKA)`,
        ``,
        `Estimado(a) ${nombre || dt?.contribuyente || pg.identidad} (R.I.F./Cédula: ${identidad || pg.identidad}),`,
        `Remitimos su Factura Fiscal Digital correspondiente al servicio de Aseo Urbano.`,
        `Número de Control SENIAT: ${numeroControl}`,
        ...(numeroDocumento ? [`Número de Factura: ${numeroDocumento}`] : []),
        `Fecha de Emisión: ${fechaFmt}`,
        `Monto Total: Bs ${fmtBs(montoFactura)}`,
      ].join('\n');

      const sendRes = await resend.emails.send({
        from: fromEmail,
        to: [correoDestino],
        subject,
        text: textContent,
        html: htmlFactura,
        ...(attachments ? { attachments } : {}),
      });

      if (sendRes.error) {
        return NextResponse.json(
          { ok: false, error: sendRes.error.message || 'Error al enviar correo de factura.' },
          { status: 500 }
        );
      }

      dt.correo = correoDestino;
      dt.factura_digital = dt.factura_digital || {};
      dt.factura_digital.correo_utilizado = correoDestino;
      dt.factura_digital.ultimo_envio_correo = {
        destinatario: correoDestino,
        fecha: new Date().toISOString(),
        modo: 'PRODUCCIÓN',
        exito: true,
        resend_id: (sendRes as any)?.data?.id || null,
        error: null,
      };
      await supabase.from('pagos_reportados').update({ detalles: dt }).eq('id', pagoId);
      cachedFacturasRecibosData = null;

      return NextResponse.json({
        ok: true,
        correo: correoDestino,
        mensaje: `Factura Fiscal ${numeroControl} reenviada exitosamente a ${correoDestino}.`,
      });
    }

    // 3) REENVÍO DE CORREO INFORMATIVO (RECORDATORIO DE PAGO O ESTADO DE CUENTA CON PDF)
    const tasa = await tasaVigente().catch(() => 1008.31);
    const padron = await cargarPadronDestinatarios(tasa);
    const idClean = identidad.replace(/[^A-Z0-9]/g, '');
    const foundDest =
      padron.find(
        (p) =>
          p.identidad === identidad ||
          p.identidad.replace(/[^A-Z0-9]/g, '') === idClean
      ) || {
        identidad: identidad || 'N/A',
        nombre,
        correo: correoDestino,
        telefono: body.telefono || '',
        direccion: body.direccion || 'Municipio Naguanagua',
        codigoPrincipal: body.codigoPrincipal || identidad,
        codigos: Array.isArray(body.codigos) ? body.codigos : [body.codigoPrincipal || identidad],
        sector: body.sector || 'Individual',
        mesesMax: Number(body.mesesMax || 1),
        esCondominio: body.sector === 'Condominio',
        esComercial: body.sector === 'Comercial',
        esResidencial: body.sector !== 'Condominio' && body.sector !== 'Comercial',
        agenteRetencion: false,
        hasDebt: Number(body.totalDeudaBs || 0) > 0,
        totalDeudaBs: Number(body.totalDeudaBs || 0),
        items: [],
      };

    const destEnvio: DestinatarioCampana = {
      ...foundDest,
      correo: correoDestino,
      nombre: nombre || foundDest.nombre,
    };

    const esRec = plantilla === 'recordatorio_pago';
    const subject =
      asuntoPersonalizado ||
      (esRec
        ? 'RECORDATORIO DE PAGO - IAMEC NAGUANAGUA'
        : 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO');

    let attachments: { filename: string; content: Buffer }[] | undefined;
    if (!esRec && destEnvio.items.length > 0) {
      const pdfBuf = construirEstadoCuentaPdfBuffer(destEnvio, tasa);
      const safeId = String(destEnvio.identidad || 'CONTRIBUYENTE').replace(/[^A-Z0-9_-]/gi, '_');
      attachments = [{ filename: `Estado_de_Cuenta_IAMEC_${safeId}.pdf`, content: pdfBuf }];
    }

    const htmlContent = esRec
      ? buildRecordatorioPagoHtml(destEnvio)
      : buildEstadoCuentaMasivoWordHtml(destEnvio);

    const sendRes = await resend.emails.send({
      from: fromEmail,
      to: [correoDestino],
      subject,
      html: htmlContent,
      ...(attachments ? { attachments } : {}),
    });

    if (sendRes.error) {
      return NextResponse.json(
        { ok: false, error: sendRes.error.message || 'No se pudo enviar el correo.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      correo: correoDestino,
      mensaje: `${esRec ? 'Recordatorio de Pago' : 'Estado de Cuenta'} reenviado exitosamente a ${correoDestino}.`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
