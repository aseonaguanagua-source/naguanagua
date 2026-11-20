import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getResendClient } from '@/lib/emailClient';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { calcularMensualidad, isResidencialInm, isTerrenoInm } from '@/lib/calculos';
import { tasaVigente } from '@/lib/condominios/servicio';

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
  esCondominio: boolean;
  esComercial: boolean;
  esResidencial: boolean;
  agenteRetencion: boolean;
  hasDebt: boolean;
  totalDeudaBs: number;
  items: InmuebleDeudaItem[];
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

function buildEstadoCuentaMasivoHtml(_dest: DestinatarioCampana): string {
  const BASE = 'https://naguanagua.globalgreenrec.com';
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESTADO DE CUENTA ASEO NAGUANAGUA</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Calibri,Arial,Helvetica,sans-serif;color:#222222;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px 12px;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;max-width:640px;text-align:left;font-size:14.5px;line-height:1.55;color:#222222;">

  <!-- ENCABEZADO DEL DOCUMENTO: LOGO IAMEC CENTRADO -->
  <tr>
    <td align="center" style="padding:10px 0 18px;">
      <img src="${BASE}/logos/IAMEC.png" alt="IAMEC - Instituto Autónomo Municipal de Ecosocialismo" width="210" style="display:block;margin:0 auto;height:auto;" />
    </td>
  </tr>

  <!-- TÍTULO Y SUBTÍTULO CENTRADOS -->
  <tr>
    <td align="center" style="padding:0 0 6px;font-weight:bold;font-size:16px;color:#222222;">
      ESTADO DE CUENTA ASEO NAGUANAGUA
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 0 18px;font-weight:bold;font-size:15px;color:#222222;">
      FAVOR LEER TEXTO COMPLETO
    </td>
  </tr>

  <!-- CUERPO EXACTO DEL DOCUMENTO WORD -->
  <tr>
    <td style="padding:0 16px;color:#222222;font-size:14.5px;line-height:1.55;">
      <p style="margin:0 0 14px;">
        Nos dirigimos a Ud., en la oportunidad de remitir estado de cuenta contentivo de su deuda (total o parcial) de la tasa de Aseo Urbano del Municipio Naguanagua.
      </p>

      <p style="margin:0 0 12px;">
        Por favor tenga en consideración las siguientes pautas:
      </p>

      <ul style="margin:0 0 14px;padding-left:24px;color:#222222;">
        <li style="margin-bottom:14px;">
          <strong>Los datos para realizar el pago son los siguientes:</strong><br/>
          - BANCO: <strong>BANESCO</strong><br/>
          NÚMERO DE CUENTA: <strong>0134-1089-59-0001008636</strong><br/>
          TIPO DE CUENTA: <strong>CORRIENTE</strong><br/>
          TITULAR: <strong>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC)</strong><br/>
          RIF: <strong>G-20008614-9</strong>
          <div style="margin-top:12px;">
            -BANCO: <strong>BANCAMIGA</strong><br/>
            NÚMERO DE CUENTA: 0172-0110-71-1101340717<br/>
            TIPO DE CUENTA: <strong>CORRIENTE</strong><br/>
            TITULAR: <strong>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC)</strong><br/>
            RIF: <strong>G-20008614-9</strong>
          </div>
        </li>

        <li style="margin-bottom:10px;">
          Los pagos deben hacerse por MES O MESES COMPLETOS.
        </li>

        <li style="margin-bottom:10px;">
          La factura es emitida por el Instituto Autónomo Municipal De Ecosocialismo Naguanagua (IAMEC) RIF G-20008614-9
        </li>

        <li style="margin-bottom:10px;">
          El comprobante de pago por transferencia, favor remitirlo a través del presente correo, indicando en el texto del correo: usuario aseo urbano, razón social o nombre, RIF o CI, correo electrónico y número de teléfono, periodo pagado.
        </li>

        <li style="margin-bottom:8px;">
          En caso de ser contribuyente especial, además de las pautas antes mencionadas, deberá considerar las siguientes:
          <ul style="list-style-type:circle;margin:8px 0 4px;padding-left:22px;">
            <li style="margin-bottom:6px;">El porcentaje de retención que corresponde a IAMEC es el 75%</li>
            <li style="margin-bottom:6px;">Estamos exentos del I.S.L.R.</li>
            <li style="margin-bottom:6px;">El número de factura es diferente al número de control.</li>
          </ul>
        </li>

        <li style="margin-bottom:10px;">
          La factura debe ser pagada como máximo el día 28 del mes si es de otra entidad bancaria distinta a Banesco / Bancamiga o el día 30 del mes si es de Banesco a Banesco / Bancamiga a Bancamiga, debido a que debemos realizar el cierre fiscal del mes junto a la conciliación bancaria.
        </li>
      </ul>

      <p style="margin:0 0 14px;">
        En caso de que la factura, no sea pagada en el período de tiempo, antes señalado se procederá a la anulación de la misma.
      </p>

      <p style="margin:0 0 22px;text-align:justify;">
        Si usted ya ejecutó su pago, hacer caso omiso de este correo. Agradeciendo su pronto pago, quedamos a sus órdenes.
      </p>

      <p style="margin:0 0 6px;text-align:center;">
        <strong>Whatsapp Comercial:</strong> 0424-4282365 &ndash; <strong>Correo:</strong> <a href="mailto:aseoresnaguanagua@globalgreenca.com" style="color:#222222;text-decoration:none;">aseoresnaguanagua@globalgreenca.com</a>
      </p>
      <p style="margin:0 0 10px;text-align:center;">
        <strong>WhatsApp Residencial:</strong> 0424-4282364 &ndash; <strong>Correo:</strong> <a href="mailto:aseocomnaguanagua@globalgreenca.com" style="color:#222222;text-decoration:none;">aseocomnaguanagua@globalgreenca.com</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function cargarPadronDestinatarios(tasaBcv: number): Promise<DestinatarioCampana[]> {
  const allInm: any[] = [];
  let from = 0;
  const STEP = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select(
        'id, inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, direccion, telefono, correo_electronico, estado, cant_inmuebles, mmv_mes, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, es_condominio, condominio_padre_id, padre_id, agente_retencion'
      )
      .neq('estado', 'Eliminado')
      .neq('estado', 'Inactivo')
      .order('id', { ascending: true })
      .range(from, from + STEP - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allInm.push(...data);
    if (data.length < STEP) break;
    from += STEP;
  }

  const allCont: any[] = [];
  from = 0;
  while (true) {
    const { data } = await supabase
      .from('contribuyentes')
      .select('identidad, nombre, email, telefono, direccion')
      .range(from, from + STEP - 1);
    if (!data || data.length === 0) break;
    allCont.push(...data);
    if (data.length < STEP) break;
    from += STEP;
  }

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
    if (inm.agente_retencion) g.agenteRetencion = true;
    if (inm.es_condominio || inm.clasificacion === 'Condominio') g.esCondominio = true;
    else if (String(inm.tipo || '').toUpperCase().includes('COMERCIAL')) g.esComercial = true;
    else g.esResidencial = true;

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

  return Array.from(byContributor.values());
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

export async function GET() {
  try {
    const tasa = await tasaVigente().catch(() => 1008.31);
    const padron = await cargarPadronDestinatarios(tasa);
    const conDeuda = padron.filter(x => x.hasDebt);
    const solventes = padron.filter(x => !x.hasDebt);

    return NextResponse.json({
      ok: true,
      tasaBcv: tasa,
      resumen: {
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
      },
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
    const tipoFiltro: string = body.tipoFiltro || 'Todos los Sectores';
    const estatusFiltro: string = body.estatusFiltro || 'Solo Morosos (Con deuda > 1 mes)';
    const asuntoPersonalizado: string =
      body.asunto || 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO';
    const adjuntarPdf: boolean = Boolean(body.adjuntarPdf);
    const customTestEmail = String(body.testEmail || '').trim();
    const testEmail =
      (isValidEmail(customTestEmail) ? customTestEmail : '') ||
      TheFactoryHKA.getBackupEmail() ||
      process.env.TFHKA_BACKUP_EMAIL ||
      'facturacion.comercial@globalgreenca.com';

    const tasa = await tasaVigente().catch(() => 1008.31);
    let destinatarios: DestinatarioCampana[] = [];

    if (testMode) {
      destinatarios = [
        {
          identidad: 'J-000000000',
          nombre: 'CONTRIBUYENTE DE PRUEBA IAMEC NAGUANAGUA',
          correo: testEmail,
          telefono: '0424-4282365',
          direccion: 'Av. Universidad, Municipio Naguanagua, Edo. Carabobo',
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
    } else {
      const padron = await cargarPadronDestinatarios(tasa);
      destinatarios = filtrarDestinatarios(padron, tipoFiltro, estatusFiltro);
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

    for (let i = 0; i < destinatarios.length; i += 10) {
      const lote = destinatarios.slice(i, i + 10);
      await Promise.all(
        lote.map(async dest => {
          try {
            const destinoComun = testMode || modoTestComun ? testEmail : dest.correo;
            const subjectComun =
              testMode || modoTestComun
                ? `[PRUEBA | Para: ${dest.correo}] ${asuntoPersonalizado}`
                : asuntoPersonalizado;

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

            let sendRes = await resend.emails.send({
              from: fromEmail,
              to: [destinoComun],
              subject: subjectComun,
              html: buildEstadoCuentaMasivoHtml(dest),
              attachments,
            });

            if (sendRes.error && sendRes.error.message.includes('only send testing emails')) {
              sendRes = await resend.emails.send({
                from: fromEmail,
                to: ['aseonaguanagua@globalgreenca.com'],
                subject: subjectComun + ` (Destino original: ${destinoComun})`,
                html: buildEstadoCuentaMasivoHtml(dest),
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
        await new Promise(r => setTimeout(r, 500));
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

    return NextResponse.json({
      success: true,
      modo: testMode ? 'PRUEBA' : 'PRODUCCION',
      enviados,
      errores,
      totalDestinatarios: destinatarios.length,
      erroresList: erroresList.slice(0, 10),
      mensaje: testMode
        ? `Correo de prueba enviado exitosamente a ${testEmail}`
        : `Campaña completada: ${enviados} recordatorios de pago enviados exitosamente.`,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
