import { logos } from './logosBase64';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const dibujarYDescargarPDF = async (data: any, isPreview = false) => {
  try {
    const doc = new jsPDF();
    
    // Header background (gray bar)
    doc.setFillColor(230, 230, 230); // light gray
    doc.rect(0, 0, 210, 40, 'F');
    
    // Instituto de Aseo logo only
    doc.addImage(logos.isma, 'JPEG', 15, 8, 45, 25);
    
    // Header Text
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("CERTIFICADO DE SOLVENCIA", 200, 20, { align: "right" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Nº Certificado: ${data.codigo}`, 200, 28, { align: "right" });
    
    const fechaEmision = new Date(data.emision);
    const fechaActualStr = fechaEmision.toLocaleDateString('es-VE');
    doc.text(`Fecha: ${fechaActualStr}`, 200, 34, { align: "right" });
    
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
    doc.setFont("helvetica", "bold");
    doc.text(data.contribuyente || '', 40, 62);
    
    doc.setFont("helvetica", "normal");
    doc.text("RIF / C.I.:", 15, 68);
    doc.text(data.identidad || '', 40, 68);
    
    doc.text("Teléfono:", 15, 74);
    doc.text(data.telefono || '+58 412-9030238', 40, 74);
    
    doc.text("Código:", 15, 80);
    doc.text(data.codigoContribuyente || '', 40, 80);
    
    // Inmueble data
    doc.setFont("helvetica", "normal");
    doc.text("Código:", 110, 62);
    doc.text(data.inmuebleSpec !== 'general' ? data.inmuebleSpec : 'N/A', 130, 62);
    
    doc.text("Patente:", 110, 68);
    doc.text(data.patente || 'S/N', 130, 68);
    
    doc.text("Dirección:", 110, 74);
    const dirSplit = doc.splitTextToSize(data.direccion || 'Naguanagua Municipio Naguanagua, Falcón', 70);
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
    
    const fechaVencimiento = new Date(data.vencimiento);
    const vencMesAnio = `${('0' + (fechaVencimiento.getMonth() + 1)).slice(-2)}-${fechaVencimiento.getFullYear()}`;
    
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 144, 255); // blue
    doc.text(`SOLVENTE HASTA: ${vencMesAnio}`, 105, 115, { align: "center" });
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    const vencStr = fechaVencimiento.toLocaleDateString('es-VE');
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
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://aseosilva.globalrecca.com';
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
    const fechaEmision = new Date();
    const fechaVencimiento = new Date(fechaEmision);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
    
    const codigoUnico = `SOL-${contribuyente.Identidad}-${Date.now().toString().slice(-6)}`;
    
    const dbRecord = {
      codigo: codigoUnico,
      contribuyente: contribuyente.Contribuyente,
      identidad: contribuyente.Identidad,
      tipo: 'Solvencia Municipal',
      emision: fechaEmision.toISOString(),
      vencimiento: fechaVencimiento.toISOString(),
      estado: 'Vigente'
    };

    const { error } = await supabase.from('certificados').insert(dbRecord);
    if (error) {
      console.error("No se pudo registrar el certificado en la BD", error);
    } else {
      if (addCertificadoToContext) addCertificadoToContext(dbRecord);
    }

    await dibujarYDescargarPDF({
      ...dbRecord,
      inmuebleSpec,
      telefono: '+58 412-9030238',
      codigoContribuyente: contribuyente.id || 'C-0000',
      direccion: contribuyente.Direccion || 'Naguanagua Municipio Naguanagua'
    });

    return dbRecord;
  } catch (e: any) {
    alert("Error al generar PDF de Solvencia: " + e.message);
    throw e;
  }
};

export const reimprimirSolvenciaPDF = async (certificadoRow: any) => {
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
