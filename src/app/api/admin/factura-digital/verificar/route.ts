import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { isResidencialInm } from '@/lib/calculos';

export const dynamic = 'force-dynamic';

function numeroALetras(monto: number): string {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const especiales: Record<number, string> = {
    11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
    16: 'DIECISEIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
    21: 'VEINTIUN', 22: 'VEINTIDOS', 23: 'VEINTITRES', 24: 'VEINTICUATRO', 25: 'VEINTICINCO',
    26: 'VEINTISEIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE'
  };
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function convertirGrupo(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    if (especiales[n]) return especiales[n];
    if (n < 10) return unidades[n];
    if (n < 100) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
    }
    const c = Math.floor(n / 100);
    const resto = n % 100;
    return resto === 0 ? centenas[c] : `${centenas[c]} ${convertirGrupo(resto)}`;
  }

  const entero = Math.floor(Math.abs(monto));
  const decimales = Math.round((Math.abs(monto) - entero) * 100);
  
  if (entero === 0) return `CERO BOLIVARES CON ${String(decimales).padStart(2, '0')}/100`;

  let resultado = '';
  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const resto = entero % 1000;

  if (millones > 0) {
    resultado += millones === 1 ? 'UN MILLON' : `${convertirGrupo(millones)} MILLONES`;
    if (miles > 0 || resto > 0) resultado += ' ';
  }
  if (miles > 0) {
    resultado += miles === 1 ? 'MIL' : `${convertirGrupo(miles)} MIL`;
    if (resto > 0) resultado += ' ';
  }
  if (resto > 0) {
    resultado += convertirGrupo(resto);
  }

  return `${resultado} BOLIVARES CON ${String(decimales).padStart(2, '0')}/100`;
}

export async function POST(request: Request) {
  try {
    const { pagoId, identidad, contribuyente, monto, recibos } = await request.json();

    // 1. Probar conectividad con The Factory HKA
    const estadoConexion = await TheFactoryHKA.verificarConexion();

    // 2. Si no se especificó pagoId, retornar estado general
    if (!pagoId && !identidad) {
      return NextResponse.json({
        ok: estadoConexion.ok,
        conexionTfhka: estadoConexion,
        message: estadoConexion.message
      });
    }

    // 3. Buscar datos del pago en BD si vino pagoId
    let pagoData: any = null;
    if (pagoId) {
      const { data } = await supabase.from('pagos_reportados').select('*').eq('id', pagoId).single();
      pagoData = data;
    }

    const docIdentidad = (identidad || pagoData?.identidad || '').trim();
    const nombreContrib = (contribuyente || pagoData?.detalles?.contribuyente || 'CONTRIBUYENTE').trim();
    const montoTotal = parseFloat(String(monto || pagoData?.monto || '0'));

    // 4. Buscar información de correo en inmuebles y contribuyentes
    const idNaked = docIdentidad.replace(/^[VJGEP]-?/i, '');
    const idVariants = [docIdentidad, idNaked, `V-${idNaked}`, `J-${idNaked}`, `E-${idNaked}`];

    const { data: contribuyenteDb } = await supabase
      .from('contribuyentes')
      .select('nombre, email, telefono, direccion')
      .in('identidad', idVariants)
      .maybeSingle();

    const { data: inmuebleDb } = await supabase
      .from('inmuebles')
      .select('tipo, actividad_principal, direccion, correo_electronico, telefono')
      .in('identidad', idVariants)
      .limit(1);

    const prop = inmuebleDb && inmuebleDb.length > 0 ? inmuebleDb[0] : null;

    const emailReal = contribuyenteDb?.email || prop?.correo_electronico || pagoData?.detalles?.correo || null;
    const fallbackEmail = TheFactoryHKA.getFallbackEmail();
    const backupEmail = TheFactoryHKA.getBackupEmail();

    const usaCorreoComodin = !emailReal || emailReal.trim() === '' || emailReal.toLowerCase() === fallbackEmail.toLowerCase();
    const emailFinal = usaCorreoComodin ? fallbackEmail : emailReal;

    // 5. Validar formato de RIF / Cédula
    const errores: string[] = [];
    const advertencias: string[] = [];

    const limpiaId = docIdentidad.replace(/[^A-Z0-9]/gi, '');
    let tipoId = 'V';
    let numId = limpiaId;

    if (/^[VJGEP]/i.test(limpiaId)) {
      tipoId = limpiaId.charAt(0).toUpperCase();
      numId = limpiaId.substring(1);
    } else {
      tipoId = 'V';
      numId = limpiaId;
      advertencias.push('Identificación sin prefijo fiscal explícito (se asumirá tipo ' + tipoId + ').');
    }

    if (numId.length < 5) {
      errores.push('El número de identificación fiscal (' + docIdentidad + ') es inválido o muy corto.');
    }

    if (montoTotal <= 0) {
      errores.push('El monto a facturar debe ser mayor a cero.');
    }

    if (usaCorreoComodin) {
      advertencias.push(`El contribuyente NO tiene correo personal registrado. Se asignará automáticamente el correo comodín (${fallbackEmail}). Requiere actualización de correo.`);
    }

    // 6. Totales: la MISMA simulación que usa la emisión (dryRun) → incluye retención de IVA, multas exentas
    //    y porción comercial. Si falla, se estima con cobrado / 1,16.
    let baseImponible = parseFloat((montoTotal / 1.16).toFixed(2));
    let ivaEstimado = parseFloat((montoTotal - baseImponible).toFixed(2));
    let exento = 0;
    let totalFactura = montoTotal;
    let retencionIva = 0;
    if (pagoData) {
      try {
        let det: any = pagoData.detalles || {};
        if (typeof det === 'string') { try { det = JSON.parse(det); } catch { det = {}; } }
        const origin = new URL(request.url).origin;
        const r = await fetch(`${origin}/api/admin/factura-digital/emitir`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pagoId, identidad: docIdentidad, contribuyente: nombreContrib,
            recibos: Array.isArray(det.recibos) ? det.recibos : (recibos || []), montos: det.montos,
            montoTotal: pagoData.monto, dryRun: true, enviarCorreo: false,
          }),
        });
        const sim = await r.json();
        const t = sim?.payload?.documentoElectronico?.Encabezado?.Totales;
        if (t && sim.totalAPagar > 0) {
          baseImponible = parseFloat(t.MontoGravadoTotal || '0') || 0;
          ivaEstimado = parseFloat(t.TotalIVA || '0') || 0;
          exento = parseFloat(t.MontoExentoTotal || '0') || 0;
          totalFactura = Math.round(sim.totalAPagar * 100) / 100;
          retencionIva = parseFloat(String(det.monto_retencion_iva || 0)) || 0;
          (sim.errores || []).forEach((e: string) => advertencias.push(e));
        } else if (sim?.skipped) {
          advertencias.push(sim.message || 'Este pago no genera factura fiscal.');
        }
      } catch (e: any) {
        advertencias.push('No se pudo simular la factura; se muestra una estimación: ' + e.message);
      }
    }
    const montoLetras = numeroALetras(totalFactura);

    const reporteValidacion = {
      ok: errores.length === 0,
      pagoId,
      identidad: `${tipoId}-${numId}`,
      contribuyente: nombreContrib,
      comprador: {
        tipo: tipoId,
        numero: numId,
        razonSocial: nombreContrib,
        direccion: prop?.direccion || contribuyenteDb?.direccion || 'NAGUANAGUA, EDO. CARABOBO',
        correo: emailFinal,
        usaCorreoComodin,
        requiereActualizacionCorreo: usaCorreoComodin,
      },
      totales: {
        montoTotal: totalFactura,
        montoCobrado: montoTotal,
        retencionIva,
        baseImponible,
        iva: ivaEstimado,
        exento,
        montoEnLetras: montoLetras,
        moneda: 'BSD'
      },
      conexionTheFactory: estadoConexion,
      copiaInternaFiscal: {
        correoDestino: backupEmail,
        costoAdicionalTheFactory: '0 (Gratuito vía servidor de correo interno)'
      },
      errores,
      advertencias,
      estadoFinal: errores.length === 0 ? 'LISTA_PARA_EMISION' : 'REQUIERE_CORRECCION'
    };

    return NextResponse.json(reporteValidacion);
  } catch (err: any) {
    console.error('Error verificando facturación digital:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
