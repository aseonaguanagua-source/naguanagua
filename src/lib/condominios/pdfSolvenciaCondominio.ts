import { supabase } from '@/lib/supabase';
import { dibujarYDescargarPDF } from '@/lib/pdfGenerator';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Emite y descarga el Certificado de Solvencia Municipal para un Condominio completo (padre).
 * Valida que el condominio no posea deuda pendiente (deudaBs <= 0.01).
 * Registra el certificado en la tabla `certificados` para validación oficial con código QR.
 */
export async function emitirSolvenciaCondominio(condo: any, deudaBs: number) {
  try {
    const deuda = Number(deudaBs) || 0;
    if (deuda > 0.01) {
      alert(`BLOQUEO DE SOLVENCIA:\nEl condominio "${condo.nombre}" presenta una deuda pendiente de Bs ${fmtBs(deuda)}.\nDebe encontrarse al día para emitir la solvencia.`);
      return null;
    }

    const rawId = (condo.identidad || condo.codigo || 'J-000000000').trim();
    const cleanId = rawId.replace(/[^0-9A-Z]/gi, '');
    const codigoUnico = `SOL-${cleanId}-${Date.now().toString().slice(-6)}`;

    const fechaEmision = new Date();
    const anio = fechaEmision.getFullYear();
    const mes = fechaEmision.getMonth();
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    // Vence el último día del mes en curso a las 23:59:59
    const fechaVencimiento = new Date(anio, mes, ultimoDia, 23, 59, 59, 999);

    const dbRecord = {
      codigo: codigoUnico,
      contribuyente: (condo.nombre || 'Condominio').trim(),
      identidad: condo.identidad || 'N/A',
      inmueble: condo.codigo,
      tipo: 'Solvencia Municipal (Condominio)',
      emision: fechaEmision.toISOString(),
      vencimiento: fechaVencimiento.toISOString(),
      estado: 'Vigente'
    };

    try {
      await supabase.from('certificados').insert(dbRecord);
    } catch (dbErr) {
      console.warn('No se pudo registrar certificado en BD (se descargará de igual manera):', dbErr);
    }

    await dibujarYDescargarPDF({
      ...dbRecord,
      inmuebleSpec: condo.codigo,
      telefono: condo.telefono || '+58 412-9030238',
      codigoContribuyente: condo.codigo,
      direccion: condo.direccion || `${condo.nombre}, Municipio Naguanagua, Estado Carabobo`
    });

    return dbRecord;
  } catch (err: any) {
    console.error('Error al emitir solvencia del condominio:', err);
    alert('Error al generar la solvencia: ' + err.message);
    return null;
  }
}

/**
 * Emite y descarga el Certificado de Solvencia Municipal para un Hijo / Unidad de Condominio (local, oficina, apto).
 * Valida que la unidad específica no posea deuda pendiente (deudaUnidadBs <= 0.01).
 * Registra el certificado en la tabla `certificados` para validación oficial con código QR.
 */
export async function emitirSolvenciaUnidad(condo: any, unidad: any, deudaUnidadBs: number) {
  try {
    const deuda = Number(deudaUnidadBs) || 0;
    const descUnidad = unidad.inmueble || unidad.numero || 'Unidad seleccionada';
    if (deuda > 0.01) {
      alert(`BLOQUEO DE SOLVENCIA:\nLa unidad "${descUnidad}" presenta una deuda pendiente de Bs ${fmtBs(deuda)}.\nDebe encontrarse al día para emitir la solvencia.`);
      return null;
    }

    const idContribuyente = (unidad.identidad || condo.identidad || unidad.inmueble || 'V-00000000').trim();
    const cleanId = idContribuyente.replace(/[^0-9A-Z]/gi, '');
    const codigoUnico = `SOL-${cleanId}-${Date.now().toString().slice(-6)}`;

    const fechaEmision = new Date();
    const anio = fechaEmision.getFullYear();
    const mes = fechaEmision.getMonth();
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    // Vence el último día del mes en curso a las 23:59:59
    const fechaVencimiento = new Date(anio, mes, ultimoDia, 23, 59, 59, 999);

    const nombreTitular = unidad.propietario?.trim() || condo.nombre?.trim() || 'Contribuyente';
    const codigoInmueble = unidad.inmueble || unidad.numero || condo.codigo;

    const dbRecord = {
      codigo: codigoUnico,
      contribuyente: nombreTitular,
      identidad: unidad.identidad || condo.identidad || 'N/A',
      inmueble: codigoInmueble,
      tipo: 'Solvencia Municipal (Unidad de Condominio)',
      emision: fechaEmision.toISOString(),
      vencimiento: fechaVencimiento.toISOString(),
      estado: 'Vigente'
    };

    try {
      await supabase.from('certificados').insert(dbRecord);
    } catch (dbErr) {
      console.warn('No se pudo registrar certificado en BD (se descargará de igual manera):', dbErr);
    }

    await dibujarYDescargarPDF({
      ...dbRecord,
      inmuebleSpec: `${codigoInmueble} · ${condo.nombre}`.slice(0, 48),
      telefono: unidad.telefono || condo.telefono || '+58 412-9030238',
      codigoContribuyente: unidad.inmueble || condo.codigo,
      direccion: `${condo.nombre}${unidad.numero ? `, ${unidad.numero}` : ''}, Municipio Naguanagua, Estado Carabobo`
    });

    return dbRecord;
  } catch (err: any) {
    console.error('Error al emitir solvencia de la unidad:', err);
    alert('Error al generar la solvencia de la unidad: ' + err.message);
    return null;
  }
}
