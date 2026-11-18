import { logos } from './logosBase64';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { evaluarSolvencia } from '@/lib/solvencia';


export const dibujarYDescargarPDF = async (data: any, isPreview = false) => {
  try {
    const doc = new jsPDF();
    
    // Header background (subtle institutional bar)
    doc.setFillColor(245, 247, 250);
    doc.rect(0, 0, 210, 44, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(14, 44, 196, 44);

    // Logos institucionales (Alcaldía izquierda, IAMEC derecha — proporción exacta 652x233 -> 38x13.5)
    doc.addImage(logos.alcaldia, 'PNG', 14, 11, 38, 13.5);
    doc.addImage(logos.iamec, 'PNG', 158, 11, 38, 13.5);

    // Membrete institucional central
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("REPÚBLICA BOLIVARIANA DE VENEZUELA - ESTADO CARABOBO", 105, 11, { align: "center" });
    doc.setFontSize(8);
    doc.text("ALCALDÍA BOLIVARIANA DE NAGUANAGUA", 105, 15, { align: "center" });
    doc.text("INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO (IAMEC)", 105, 19, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("RIF: G-20008614-9", 105, 22.8, { align: "center" });

    // Título del Certificado
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("CERTIFICADO DE SOLVENCIA", 105, 30.5, { align: "center" });

    const fechaEmision = new Date(data.emision);
    const fechaActualStr = fechaEmision.toLocaleDateString('es-VE');
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(`Nº Certificado: ${data.codigo}   |   Fecha de Emisión: ${fechaActualStr}`, 105, 36.5, { align: "center" });
    
    // Section 1: DATOS DEL CONTRIBUYENTE & DETALLES DEL INMUEBLE
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("DATOS DEL CONTRIBUYENTE", 15, 55);
    doc.text("DETALLES DEL INMUEBLE", 110, 55);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    
    // Contribuyente data
    doc.text("Razón Social:", 15, 62);
    const contLines = doc.splitTextToSize(data.contribuyente || '', 65);
    doc.text(contLines, 40, 62);
    
    // Dynamic offset based on number of lines in Razón Social
    const extraOffset = Math.max(0, (contLines.length - 1) * 4);

    doc.setFont("helvetica", "normal");
    doc.text("RIF / C.I.:", 15, 68 + extraOffset);
    doc.text(data.identidad || '', 40, 68 + extraOffset);
    
    doc.text("Teléfono:", 15, 74 + extraOffset);
    doc.text(data.telefono || '+58 412-9030238', 40, 74 + extraOffset);
    
    doc.text("Código:", 15, 80 + extraOffset);
    doc.text(data.codigoContribuyente || '', 40, 80 + extraOffset);
    
    // Inmueble data
    doc.setFont("helvetica", "normal");
    doc.text("Código:", 110, 62);
    doc.text(data.inmuebleSpec !== 'general' ? data.inmuebleSpec : 'N/A', 130, 62);
    
    doc.text("Patente:", 110, 68);
    doc.text(data.patente || 'S/N', 130, 68);
    
    doc.text("Dirección:", 110, 74);
    const dirSplit = doc.splitTextToSize(data.direccion || 'Municipio Naguanagua, Estado Carabobo', 70);
    doc.text(dirSplit, 130, 74);
    
    // Section 2: PERÍODO DE SOLVENCIA
    doc.setFillColor(230, 230, 230);
    doc.rect(15, 95, 180, 8, 'F');
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("PERÍODO DE SOLVENCIA", 18, 100);
    
    doc.setDrawColor(230, 230, 230);
    doc.setFillColor(245, 245, 245);
    doc.rect(15, 103, 180, 25, 'FD');
    
    const anio = fechaEmision.getFullYear();
    const mes = fechaEmision.getMonth();
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    const mesStr = ('0' + (mes + 1)).slice(-2);
    const vencMesAnio = `${mesStr}-${anio}`;
    const vencStr = `${String(ultimoDia).padStart(2, '0')}/${mesStr}/${anio}`;
    
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 144, 255); // blue
    doc.text(`SOLVENTE HASTA: ${vencMesAnio}`, 105, 115, { align: "center" });
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`CERTIFICADO VÁLIDO HASTA: ${vencStr}`, 105, 123, { align: "center" });
    
    // Section 3: DECLARACIÓN
    doc.setFillColor(230, 230, 230);
    doc.rect(15, 135, 180, 8, 'F');
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("DECLARACIÓN", 18, 140);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const declText = "Hacemos constar que el inmueble referenciado ha cumplido con las obligaciones de pago señaladas en la Ordenanza Municipal por concepto de ASEO URBANO, encontrándose solvente hasta el período indicado.";
    const splitDecl = doc.splitTextToSize(declText, 175);
    doc.text(splitDecl, 15, 150);
    
    // QR Code
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://naguanagua.globalgreenrec.com';
    const qrData = `${baseUrl}/validar?codigo=${data.codigo}`;
    const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 100 });
    doc.addImage(qrDataUrl, 'PNG', 85, 180, 40, 40);
    
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("Escanee este código QR para validar la autenticidad de este certificado de", 105, 225, { align: 'center' });
    doc.text(`solvencia. La validación en línea estará disponible hasta: ${vencStr}`, 105, 229, { align: 'center' });
    
    // Footer Note
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const noteText = "Nota: Este documento es válido únicamente para los fines establecidos por la normativa municipal vigente y pierde su validez una vez vencida la fecha de expiración indicada. Cualquier alteración o modificación invalida el presente certificado.";
    const splitNote = doc.splitTextToSize(noteText, 180);
    doc.text(splitNote, 15, 240);

    // ── LOGOS INSTITUCIONALES DEL FOOTER (Lacava, Elizabeth, Naguanagua Te Quiero) ──
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, 266, 196, 266);
    const yFoot = 272;
    try {
      if ((logos as any).lacava) {
        doc.addImage((logos as any).lacava, 'PNG', 14, yFoot, 36, 9.3, undefined, 'FAST');
      }
    } catch {}
    try {
      if ((logos as any).elizabeth) {
        doc.addImage((logos as any).elizabeth, 'PNG', 84, yFoot + 0.5, 42, 8, undefined, 'FAST');
      }
    } catch {}
    try {
      if ((logos as any).naguanaguaTeQuiero) {
        doc.addImage((logos as any).naguanaguaTeQuiero, 'PNG', 161, yFoot - 2, 35, 13.5, undefined, 'FAST');
      }
    } catch {}

    doc.save(`Solvencia_${data.identidad}_${data.codigo}.pdf`);
  } catch (e: any) {
    alert("Error al generar PDF de Solvencia: " + e.message);
    throw e;
  }
};

export const generarSolvenciaPDF = async (
  contribuyente: any,
  inmuebleSpec: string,
  addCertificadoToContext?: (cert: any) => void
) => {
  try {
    const rawId = contribuyente.Identidad || contribuyente.identidad || '';
    const cleanId = rawId.trim();
    const idSinGuion = cleanId.replace(/-/g, '');

    // 1. Verificación en base de datos con la regla única (ignora eliminados; si se pide un inmueble, solo ese)
    if (cleanId) {
      const ev = await evaluarSolvencia(cleanId, inmuebleSpec);
      if (!ev.solvente) {
        alert(ev.mensaje);
        throw new Error(ev.mensaje);
      }
    }

    const fechaEmision = new Date();
    const anio = fechaEmision.getFullYear();
    const mes = fechaEmision.getMonth();
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    // Vence el último día del mes en curso a las 23:59:59
    const fechaVencimiento = new Date(anio, mes, ultimoDia, 23, 59, 59, 999);
    
    const codigoUnico = `SOL-${cleanId}-${Date.now().toString().slice(-6)}`;
    
    const dbRecord = {
      codigo: codigoUnico,
      contribuyente: contribuyente.Contribuyente || contribuyente.nombre || 'Contribuyente',
      identidad: cleanId,
      inmueble: inmuebleSpec && inmuebleSpec !== 'general' ? inmuebleSpec : null,
      tipo: 'Solvencia Municipal',
      emision: fechaEmision.toISOString(),
      vencimiento: fechaVencimiento.toISOString(),
      estado: 'Vigente'
    };

    try {
      await supabase.from('certificados').insert(dbRecord);
    } catch (_) {}
    if (addCertificadoToContext) addCertificadoToContext(dbRecord);

    await dibujarYDescargarPDF({
      ...dbRecord,
      inmuebleSpec,
      telefono: contribuyente.Telefono || contribuyente.telefono || '+58 412-9030238',
      codigoContribuyente: contribuyente.CodCont || contribuyente.id || 'C-0000',
      direccion: contribuyente.Direccion || contribuyente.direccion || 'Naguanagua Municipio Naguanagua'
    });

    return dbRecord;
  } catch (e: any) {
    console.error("Error al generar PDF de Solvencia:", e);
    throw e;
  }
};

export const reimprimirSolvenciaPDF = async (certificadoRow: any) => {
  const rawId = certificadoRow.identidad || '';
  const cleanId = rawId.trim();
  const idSinGuion = cleanId.replace(/-/g, '');

  if (cleanId) {
    const ev = await evaluarSolvencia(cleanId, certificadoRow.inmueble || 'general');
    if (!ev.solvente) {
      alert(`REIMPRESIÓN BLOQUEADA: ${ev.mensaje}`);
      return;
    }
  }

  await dibujarYDescargarPDF({
    codigo: certificadoRow.codigo,
    contribuyente: certificadoRow.contribuyente,
    identidad: certificadoRow.identidad || 'N/A',
    emision: certificadoRow.emision,
    vencimiento: certificadoRow.vencimiento,
    inmuebleSpec: 'general',
    telefono: '+58 412-9030238',
    codigoContribuyente: 'N/A',
    direccion: 'Naguanagua Municipio Naguanagua'
  });
};
