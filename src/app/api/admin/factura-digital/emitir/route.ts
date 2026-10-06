import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { isResidencialInm, cleanClasificacionActividad } from '@/lib/calculos';
import { enviarFacturaConCopiaInterna } from '@/lib/facturaMailer';
import { isFictitiousEmail } from '@/lib/formatters';

/** Siguiente N° de factura (correlativo propio, serie vacía). */
async function siguienteNumeroDocumento(sb: any): Promise<number> {
  const ultTfhka = await TheFactoryHKA.ultimoDocumento('', '01');
  let ultDb = 0;
  try {
    const { data } = await sb
      .from('pagos_reportados')
      .select('detalles')
      .not('detalles->factura_digital->tfhka_seq', 'is', null)
      .order('detalles->factura_digital->tfhka_seq', { ascending: false })
      .limit(1);
    const d = data?.[0]?.detalles;
    const fd = (typeof d === 'string' ? JSON.parse(d) : d)?.factura_digital;
    ultDb = parseInt(String(fd?.tfhka_seq ?? 0), 10) || 0;
  } catch { /* sin registros */ }
  return Math.max(ultTfhka ?? 0, ultDb) + 1;
}

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

function formatearFecha(isoString: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoString) ? `${isoString}T12:00:00` : isoString);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

export async function POST(request: Request) {
  try {
    const { 
      pagoId, recibos, montos, contribuyente, identidad, formasPago, 
      montoTotal, isCondominio, concepto, montoServicio, montoMulta, 
      correoDestino, enviarCorreo = true 
    } = await request.json();

    if (!pagoId) {
      return NextResponse.json({ error: 'Faltan datos obligatorios (pagoId requerido)' }, { status: 400 });
    }

    // --- BUSINESS RULE: Only emit invoices for Commercial properties ---
    const idNaked = identidad.replace(/^[VJGEP]-?/i, '');
    const idVariants = [identidad, idNaked, `V-${idNaked}`, `J-${idNaked}`, `E-${idNaked}`];
    const { data: userProps, error: propsErr } = await supabase
      .from('inmuebles')
      .select('inmueble, tipo, actividad_principal, direccion, correo_electronico, contribuyente, clasificacion, estado, mmv_mes')
      .in('identidad', idVariants);

    if (propsErr) {
      console.error("Props error:", propsErr);
      return NextResponse.json({ error: 'Error fetching user properties: ' + propsErr.message }, { status: 500 });
    }

    let isComercial = false;
    const activeProps = (userProps || []).filter((p: any) => p.estado !== 'Eliminado');
    const propRef = activeProps.length > 0 ? activeProps[0] : (userProps && userProps.length > 0 ? userProps[0] : null);

    if (activeProps.length > 0) {
      // Comercial = al menos un inmueble que NO sea residencial (misma regla usada para el IVA)
      isComercial = activeProps.some((p: any) => !isResidencialInm(p));
    }

    // Solo si NO hay inmuebles registrados se usa el RIF J/G o el nombre como indicio comercial.
    // Si hay inmuebles, manda la clasificación del inmueble (un condominio residencial con RIF J no se factura).
    if (
      !isComercial &&
      activeProps.length === 0 &&
      (isCondominio ||
        (contribuyente || '').toUpperCase().includes('CENTRO COMERCIAL') ||
        identidad.startsWith('J') ||
        identidad.startsWith('G'))
    ) {
      isComercial = true;
    }

    if (!isComercial) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Emisión omitida: el contribuyente es residencial.'
      });
    }
    // ------------------------------------------------------------------

    const fechaActual = new Date();
    const horaStr = fechaActual.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();

    const { data: facturasBD } = await supabase.from('facturas').select('*').in('referencia', recibos);

    // Para RECIB-HIST-*, buscar en inmuebles (no están en tabla facturas)
    const histRecibos = recibos.filter((r: string) => r.startsWith('RECIB-HIST-'));
    const histItems: any[] = [];
    let excluidosResidenciales = 0;
    if (histRecibos.length > 0) {
      // Extraer códigos de inmueble de referencias: RECIB-HIST-{COD}-M{N}
      const codigosInm = [...new Set(histRecibos.map((r: string) => r.split('-').slice(2, -1).join('-')))];
      const { data: inmsHist } = await supabase
        .from('inmuebles')
        .select('inmueble, meses_deuda, deuda_mmv, deuda_congelada_bs, multa_bs, tipo, actividad_principal')
        .in('inmueble', codigosInm);

      histRecibos.forEach((ref: string) => {
        const codInm = ref.split('-').slice(2, -1).join('-');
        const inm = (inmsHist || []).find((i: any) => i.inmueble === codInm);
        
        // Prioridad de montos:
        // 1. montos[ref] del payload de la caja (precalculado, más confiable)
        // 2. deuda_mmv del inmueble (si no se ha limpiado aún)
        // 3. montoTotal como fallback
        const montoCaja = montos && typeof montos === 'object' && montos[ref] ? parseFloat(String(montos[ref])) : 0;
        let montoBase = montoCaja > 0
          ? montoCaja
          : parseFloat(String(inm?.deuda_mmv || inm?.deuda_congelada_bs || '0'));

        // Fallback: si deuda ya fue limpiada y no hay monto de caja
        if (montoBase <= 0 && montoTotal && parseFloat(String(montoTotal)) > 0) {
          // Dividir montoTotal entre la cantidad de recibos HIST
          montoBase = parseFloat(String(montoTotal)) / histRecibos.length;
        }

        // MULTA: calcular como % del base (NO usar multa_bs que es el total histórico acumulado)
        // Residencial: 10%, Comercial/Industrial: 12%
        // REGLA OFICIAL: El último mes facturado (septiembre pagado en octubre) es SIN multa
        const esResidencial = isResidencialInm(inm);
        const pctMulta = esResidencial ? 0.10 : 0.12;
        const parts = ref.split('-');
        const mesNum = parseInt(parts[parts.length - 1]?.replace('M', '') || '1');
        const totalMeses = Math.max(1, parseInt(inm?.meses_deuda || '1'));
        const isUltimoMes = mesNum >= totalMeses;
        const montoMulta = (!isUltimoMes && totalMeses > 1) ? parseFloat((montoBase * pctMulta).toFixed(2)) : 0;

        // REGLA: nada residencial se factura (ni como exento)
        if (esResidencial) { excluidosResidenciales++; return; }
        if (montoBase > 0) histItems.push({ ref, montoBase, montoMulta, tipoInm: inm?.tipo || '', esRes: false });
      });
    }

    let totalGravado = 0;
    let totalExento  = 0;
    let totalIVA     = 0;
    let lineaNum     = 0;

    // Items de facturas normales: SOLO comerciales (16% IVA). Lo residencial no sale en la factura.
    const codigosResidenciales = (userProps || [])
      .filter((p: any) => p.inmueble && isResidencialInm(p))
      .map((p: any) => String(p.inmueble).toUpperCase());
    const facturasComerciales = (facturasBD || []).filter((fac: any) => {
      const ref = String(fac.referencia || '').toUpperCase();
      const esRes = isResidencialInm(fac) || codigosResidenciales.some((c: string) => ref.includes(c));
      if (esRes) excluidosResidenciales++;
      return !esRes;
    });
    // Contribuyente mixto (residencial + comercial): los recibos mensuales no indican el inmueble,
    // así que solo se factura la porción comercial (proporcional al mmv_mes de cada inmueble).
    const mmvRes = activeProps.filter((p: any) => isResidencialInm(p)).reduce((s: number, p: any) => s + (parseFloat(p.mmv_mes) || 0), 0);
    const mmvCom = activeProps.filter((p: any) => !isResidencialInm(p)).reduce((s: number, p: any) => s + (parseFloat(p.mmv_mes) || 0), 0);
    const esMixto = mmvRes > 0 && mmvCom > 0;
    const porcionComercial = esMixto ? mmvCom / (mmvCom + mmvRes) : 1;
    const itemsFacturas = facturasComerciales.map((fac: any) => {
      lineaNum++;
      const isRes = false;
      const montoRecibo = parseFloat(String(fac.monto || '0').replace(/[^0-9.]/g, ''));
      const montoItem = parseFloat((montoRecibo * porcionComercial).toFixed(2));
      const valorIVA  = isRes ? 0 : parseFloat((montoItem * 0.16).toFixed(2));
      if (isRes) {
        totalExento += montoItem;
      } else {
        totalGravado += montoItem;
        totalIVA     += valorIVA;
      }
      return {
        NumeroLinea:             String(lineaNum),
        CodigoCIIU:              "0198",
        CodigoPLU:               "ASEO001",
        IndicadorBienoServicio:  "2",
        Descripcion:             `Servicio de Aseo Urbano${esMixto ? ' (porción comercial)' : ''} - ${fac.referencia}`,
        Cantidad:                "1",
        UnidadMedida:            "NIU",
        PrecioUnitario:          montoItem.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          "0.00",
        RecargoMonto:            "0",
        PrecioItem:              montoItem.toFixed(2),
        PrecioAntesDescuento:    montoItem.toFixed(2),
        CodigoImpuesto:          isRes ? "E" : "G",
        TasaIVA:                 isRes ? "0" : "16",
        ValorIVA:                valorIVA.toFixed(2),
        ValorTotalItem:          String(parseFloat((montoItem + valorIVA).toFixed(2))),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      };
    });

    // Items de deuda histórica (Residencial Exento 0%, Comercial 16% IVA, Multas Exentas)
    const itemsHist = histItems.flatMap((h: any) => {
      const items = [];
      lineaNum++;
      const isRes = h.esRes;
      const valorIVAHist = isRes ? 0 : parseFloat((h.montoBase * 0.16).toFixed(2));
      if (isRes) {
        totalExento += h.montoBase;
      } else {
        totalGravado += h.montoBase;
        totalIVA     += valorIVAHist;
      }
      items.push({
        NumeroLinea:             String(lineaNum),
        CodigoCIIU:              "0198",
        CodigoPLU:               "ASEO001",
        IndicadorBienoServicio:  "2",
        Descripcion:             `Servicio de Aseo Urbano (Histórico) - ${h.ref}`,
        Cantidad:                "1",
        UnidadMedida:            "NIU",
        PrecioUnitario:          h.montoBase.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          "0.00",
        RecargoMonto:            "0",
        PrecioItem:              h.montoBase.toFixed(2),
        PrecioAntesDescuento:    h.montoBase.toFixed(2),
        CodigoImpuesto:          isRes ? "E" : "G",
        TasaIVA:                 isRes ? "0" : "16",
        ValorIVA:                valorIVAHist.toFixed(2),
        ValorTotalItem:          String(parseFloat((h.montoBase + valorIVAHist).toFixed(2))),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      });
      if (h.montoMulta > 0) {
        lineaNum++;
        totalExento += h.montoMulta;
        items.push({
          NumeroLinea:             String(lineaNum),
          CodigoCIIU:              "0198",
          CodigoPLU:               "MULT001",
          IndicadorBienoServicio:  "2",
          Descripcion:             `Multa por Mora - ${h.ref}`,
          Cantidad:                "1",
          UnidadMedida:            "NIU",
          PrecioUnitario:          h.montoMulta.toFixed(2),
          PrecioUnitarioDescuento: null,
          MontoBonificacion:       null,
          DescripcionBonificacion: null,
          DescuentoMonto:          "0.00",
          RecargoMonto:            "0",
          PrecioItem:              h.montoMulta.toFixed(2),
          PrecioAntesDescuento:    h.montoMulta.toFixed(2),
          CodigoImpuesto:          "E",
          TasaIVA:                 "0",
          ValorIVA:                "0.00",
          ValorTotalItem:          h.montoMulta.toFixed(2),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        });
      }
      return items;
    });

    const condoRecibos = (recibos || []).filter((r: string) => r.startsWith('CONDO-'));
    const itemsCondo: any[] = [];
    if ((isCondominio || condoRecibos.length > 0) && itemsFacturas.length === 0 && itemsHist.length === 0 && excluidosResidenciales === 0) {
      lineaNum++;
      const totalNum = parseFloat(String(montoTotal || 0));
      const base = parseFloat((totalNum / 1.16).toFixed(2));
      const iva = parseFloat((totalNum - base).toFixed(2));
      totalGravado += base;
      totalIVA += iva;

      itemsCondo.push({
        NumeroLinea:             String(lineaNum),
        CodigoCIIU:              "0198",
        CodigoPLU:               "ASEO001",
        IndicadorBienoServicio:  "2",
        Descripcion:             `Servicio de Aseo Urbano - Condominio ${contribuyente || 'General'}`,
        Cantidad:                "1",
        UnidadMedida:            "NIU",
        PrecioUnitario:          base.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          "0.00",
        RecargoMonto:            "0",
        PrecioItem:              base.toFixed(2),
        PrecioAntesDescuento:    base.toFixed(2),
        CodigoImpuesto:          "G",
        TasaIVA:                 "16.00",
        ValorIVA:                iva.toFixed(2),
        ValorTotalItem:          totalNum.toFixed(2),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      });
    }

    const itemsGeneral: any[] = [];
    if (itemsFacturas.length === 0 && itemsHist.length === 0 && itemsCondo.length === 0 && excluidosResidenciales === 0 && (parseFloat(String(montoTotal || 0)) > 0 || parseFloat(String(montoServicio || 0)) > 0)) {
      lineaNum++;
      const totalNum = parseFloat(String(montoTotal || 0));
      const multaNum = parseFloat(String(montoMulta || montos?.multa || 0));
      const baseServicio = montoServicio ? parseFloat(String(montoServicio)) : (totalNum - multaNum) / 1.16;
      const base = parseFloat(baseServicio.toFixed(2));
      const iva = parseFloat(((totalNum - multaNum) - base).toFixed(2));

      totalGravado += base;
      totalIVA += iva;

      itemsGeneral.push({
        NumeroLinea:             String(lineaNum),
        CodigoCIIU:              "0198",
        CodigoPLU:               "ASEO001",
        IndicadorBienoServicio:  "2",
        Descripcion:             concepto || `Servicio de Aseo Urbano Comercial - ${contribuyente || 'General'}`,
        Cantidad:                "1",
        UnidadMedida:            "NIU",
        PrecioUnitario:          base.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          "0.00",
        RecargoMonto:            "0",
        PrecioItem:              base.toFixed(2),
        PrecioAntesDescuento:    base.toFixed(2),
        CodigoImpuesto:          "G",
        TasaIVA:                 "16.00",
        ValorIVA:                iva.toFixed(2),
        ValorTotalItem:          (base + iva).toFixed(2),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      });

      if (multaNum > 0) {
        lineaNum++;
        totalExento += multaNum;
        itemsGeneral.push({
          NumeroLinea:             String(lineaNum),
          CodigoCIIU:              "0198",
          CodigoPLU:               "MULT001",
          IndicadorBienoServicio:  "2",
          Descripcion:             `Multa por Mora - Aseo Urbano`,
          Cantidad:                "1",
          UnidadMedida:            "NIU",
          PrecioUnitario:          multaNum.toFixed(2),
          PrecioUnitarioDescuento: null,
          MontoBonificacion:       null,
          DescripcionBonificacion: null,
          DescuentoMonto:          "0.00",
          RecargoMonto:            "0",
          PrecioItem:              multaNum.toFixed(2),
          PrecioAntesDescuento:    multaNum.toFixed(2),
          CodigoImpuesto:          "E",
          TasaIVA:                 "0",
          ValorIVA:                "0.00",
          ValorTotalItem:          multaNum.toFixed(2),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        });
      }
    }

    const detallesItems = [...itemsFacturas, ...itemsHist, ...itemsCondo, ...itemsGeneral];

    // Si no hay items, no emitir (nada que facturar)
    if (detallesItems.length === 0) {
      return NextResponse.json({ success: true, skipped: true, message: excluidosResidenciales > 0 ? 'Emisión omitida: los conceptos pagados son residenciales.' : 'Sin items para facturar.' });
    }

    // Datos reales del pago registrado en caja
    const { data: pagoRow } = await supabase
      .from('pagos_reportados')
      .select('monto, banco, referencia, tipo, detalles, created_at')
      .eq('id', pagoId)
      .maybeSingle();
    let detPago: any = pagoRow?.detalles || {};
    if (typeof detPago === 'string') { try { detPago = JSON.parse(detPago); } catch { detPago = {}; } }

    // CUADRE: la factura debe totalizar lo cobrado en caja (el monto cobrado ya incluye IVA).
    // Si los items se calcularon como base y no cuadran, se reescalan proporcionalmente.
    // No aplica a mixtos/residenciales excluidos (ahí el cobro incluye la parte residencial).
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const montoCobrado = (parseFloat(String(pagoRow?.monto || 0)) || 0) + (parseFloat(String(detPago.monto_retencion_iva || 0)) || 0);
    const totalCalculado = totalGravado + totalExento + totalIVA;
    if (!esMixto && excluidosResidenciales === 0 && montoCobrado > 0 && totalCalculado > 0 && Math.abs(totalCalculado - montoCobrado) > 0.05) {
      const f = montoCobrado / totalCalculado;
      console.warn(`[TFHKA] Cuadre: calculado ${totalCalculado.toFixed(2)} vs cobrado ${montoCobrado.toFixed(2)} (factor ${f.toFixed(4)})`);
      totalGravado = 0; totalExento = 0; totalIVA = 0;
      for (const it of detallesItems as any[]) {
        const base = r2(parseFloat(it.PrecioUnitario) * f);
        const iva = it.CodigoImpuesto === 'G' ? r2(base * 0.16) : 0;
        it.PrecioUnitario = base.toFixed(2);
        it.PrecioItem = base.toFixed(2);
        it.PrecioAntesDescuento = base.toFixed(2);
        it.ValorIVA = iva.toFixed(2);
        it.ValorTotalItem = (base + iva).toFixed(2);
        if (it.CodigoImpuesto === 'G') { totalGravado += base; totalIVA += iva; } else { totalExento += base; }
      }
      totalGravado = r2(totalGravado); totalExento = r2(totalExento); totalIVA = r2(totalIVA);
    }

    // Campos de la plantilla TFHKA (Guía de Mapeo §7): Campo/Valor en PascalCase
    const comRef: any = activeProps.find((p: any) => !isResidencialInm(p)) || propRef;
    const codHist = histRecibos.length > 0 ? histRecibos[0].split('-').slice(2, -1).join('-') : '';
    const codigoContribuyente = codHist || comRef?.inmueble || '';
    const licenciaAE = cleanClasificacionActividad(comRef?.actividad_principal || '') || '-';
    const cajaLabel = String(detPago.cajero || '').trim() || '-';
    const fp0: any = (formasPago && formasPago[0]) || {};
    const tipoPago = String(pagoRow?.tipo || fp0.descripcion || 'Transferencia').trim();
    const bancoRaw = String(pagoRow?.banco || fp0.banco || '').trim();
    const bancoPago = bancoRaw.toLowerCase() === tipoPago.toLowerCase() ? '' : bancoRaw;
    const refPago = String(pagoRow?.referencia || fp0.referencia || '').trim();
    const fechaPago = detPago.fecha_transaccion || pagoRow?.created_at || fechaActual.toISOString();

    const docIdentificacion = identidad.replace(/[^A-Z0-9-]/gi, '');
    const primeraLetra = docIdentificacion.charAt(0).toUpperCase();

    let tipoId: string;
    let numId: string;

    if (/^[VJGEP]$/.test(primeraLetra)) {
      // Identidad con prefijo explícito: V-12345678, J-12345678, etc.
      tipoId = primeraLetra;
      numId  = docIdentificacion.substring(1).replace(/^-/, '');
    } else {
      // Identidad sin prefijo (solo números) — detectar por nombre del contribuyente y tipo
      const nombreContrib = (contribuyente || '').toUpperCase();
      const tipoInmueble  = (propRef?.tipo || '').toUpperCase();

      // Indicadores de persona jurídica (empresa)
      const esJuridica = /\b(C\.A\.|S\.A\.|S\.R\.L\.|C\.P\.|C\.V\.|A\.C\.|COMPANIA|EMPRESA|INVERSIONES|INDUSTRIAS|CORPORACION|FUNDACION|ASOCIACION|COOPERATIVA|C\.A$|S\.A$)\b/.test(nombreContrib);
      // Indicadores de persona extranjera (nombre no venezolano o FONDO)
      const esExtranjero = /\b(FUND(O|ACION)?|INTERNATIONAL|AMERICAN|GLOBAL|LATIN|CORP\.|LLC|LTD|LIMITED)\b/.test(nombreContrib);

      tipoId = esJuridica ? 'J'
             : esExtranjero && !tipoInmueble.includes('RESIDENCIAL') ? 'E'
             : 'V';
      numId  = docIdentificacion; // número completo sin prefijo
    }

    const subtotal   = totalGravado + totalExento;
    const totalAPagar = subtotal + totalIVA;

    const jsonTFHKA = {
      documentoElectronico: {
        Encabezado: {
          IdentificacionDocumento: {
            TipoDocumento:                "01",
            NumeroDocumento:              String(Math.floor(Date.now() / 1000)).slice(-10),
            TipoProveedor:                null,
            TipoTransaccion:              null,
            NumeroPlanillaImportacion:    null,
            NumeroExpedienteImportacion:  null,
            SerieFacturaAfectada:         null,
            NumeroFacturaAfectada:        null,
            FechaFacturaAfectada:         null,
            MontoFacturaAfectada:         null,
            ComentarioFacturaAfectada:    null,
            RegimenEspTributacion:        null,
            FechaEmision:                 formatearFecha(fechaActual.toISOString()),
            FechaVencimiento:             formatearFecha(fechaActual.toISOString()),
            HoraEmision:                  horaStr,
            Moneda:                       "BSD",
            Anulado:                      false,
            TipoDePago:                   "Inmediato",
            // El rango asignado por TFHKA es serie "NO APLICA" → se envía vacía
            Serie:                        "",
            Sucursal:                     "",
            TipoDeVenta:                  "Interna",
          },
          Vendedor: null,
          Comprador: {
            TipoIdentificacion:   tipoId || "J",
            NumeroIdentificacion: numId,
            RazonSocial:          contribuyente || "CONTRIBUYENTE",
            Direccion:            propRef?.direccion || "NAGUANAGUA",
            Ubigeo:               null,
            Pais:                 "VE",
            Notificar:            null,
            Telefono:             [],
            Correo:               [(() => {
              const fallback = TheFactoryHKA.getFallbackEmail();
              const cand = (correoDestino || propRef?.correo_electronico || '').trim();
              return cand && !isFictitiousEmail(cand) ? cand : fallback;
            })()],
            OtrosEnvios:          null,
          },
          SujetoRetenido: null,
          Tercero:        null,
          Totales: {
            NroItems:               String(detallesItems.length),
            MontoGravadoTotal:      totalGravado.toFixed(2),
            MontoExentoTotal:       totalExento.toFixed(2),
            MontoPercibidoTotal:    "0.00",
            SubtotalAntesDescuento: subtotal.toFixed(2),
            TotalDescuento:         null,
            TotalRecargos:          null,
            Subtotal:               subtotal.toFixed(2),
            TotalIVA:               totalIVA.toFixed(2),
            MontoTotalConIVA:       totalAPagar.toFixed(2),
            TotalAPagar:            totalAPagar.toFixed(2),
            MontoEnLetras:          numeroALetras(totalAPagar),
            ListaRecargo:           null,
            ListaDescBonificacion:  null,
            ImpuestosSubtotal: [
              ...(totalExento > 0 ? [{
                CodigoTotalImp:   "E",
                AlicuotaImp:      "00.00",
                BaseImponibleImp: totalExento.toFixed(2),
                ValorTotalImp:    "00.00",
              }] : []),
              {
                CodigoTotalImp:   "G",
                AlicuotaImp:      "16.00",
                BaseImponibleImp: totalGravado.toFixed(2),
                ValorTotalImp:    totalIVA.toFixed(2),
              },
            ],
            OtrosImpuestosSubtotal: null,
            // Formas de pago: la plantilla lee Descripcion como "Forma|Banco|Referencia" (caso TFHKA 0154102)
            FormasPago: (() => {
              // Códigos fiscales TFHKA (mismos que SIGYR)
              const tabla: [string, string, string[]][] = [
                ['02', 'Pago Móvil',         ['pago movil', 'pagomovil', 'p2p', 'c2p']],
                ['06', 'Tarjeta de crédito', ['tarjeta de credito', 'tdc', 'credito']],
                ['05', 'Tarjeta de débito',  ['tarjeta de debito', 'tdd', 'debito', 'punto de venta', 'pos']],
                ['03', 'Transferencia',      ['transferencia', 'zelle']],
                ['01', 'Depósito en cuenta', ['deposito']],
                ['07', 'Cheque',             ['cheque']],
                ['09', 'Efectivo divisas',   ['divisa', 'dolar']],
                ['08', 'Efectivo',           ['efectivo']],
              ];
              const norm = tipoPago.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const hit = tabla.find(([, , keys]) => keys.some(k => norm.includes(k)));
              const codigo = hit ? hit[0] : '99';
              const casilla = (v: string, max: number) => v.replace(/\|/g, '/').trim().slice(0, max);
              const forma = casilla(hit ? hit[1] : tipoPago, 40);
              const ref = casilla(refPago, 25);
              const banco = casilla(bancoPago, Math.max(0, 100 - 2 - forma.length - ref.length));
              return [{
                Descripcion: [forma, banco, ref].join('|'),
                Fecha:       formatearFecha(fechaPago),
                Forma:       codigo,
                Monto:       totalAPagar.toFixed(2),  // DEBE coincidir con TotalAPagar exactamente
                Moneda:      'BSD',
                TipoCambio:  '0.0000',
              }];
            })(),
            TotalIGTF:         null,
            TotalIGTF_VES:     null,
            MontoTotalOTI:     null,
            MontoTotalIVAyOTI: null,
          },
          TotalesRetencion: null,
          TotalesOtraMoneda: null,
          Orden: null,
        },
        DetallesItems:    detallesItems,
        DetallesRetencion: null,
        Viajes:            null,
        // Nombres exactos de la plantilla (otros nombres TFHKA los ignora sin error)
        InfoAdicional: [
          ...(codigoContribuyente ? [{ Campo: 'CodigoContribuyente', Valor: String(codigoContribuyente).slice(0, 255) }] : []),
          { Campo: 'LicenciaAE', Valor: licenciaAE.slice(0, 255) },
          { Campo: 'Caja',       Valor: cajaLabel.slice(0, 255) },
          { Campo: 'Observaciones', Valor: `Pago ${String(pagoId).slice(0, 8).toUpperCase()}${refPago ? ' Ref. ' + refPago : ''}` },
        ],
        GuiaDespacho:      null,
        Transporte:        null,
        EsLote:            null,
        EsMinimo:          null,
      }
    };

    const isTfhkaEnabled = process.env.TFHKA_ENABLED === 'true';

    const { data: pagoData } = await supabase.from('pagos_reportados').select('detalles').eq('id', pagoId).single();
    let nuevosDetalles: any = pagoData?.detalles || {};
    if (typeof nuevosDetalles === 'string') {
      try { nuevosDetalles = JSON.parse(nuevosDetalles); } catch(e) { nuevosDetalles = {}; }
    }

    if (isTfhkaEnabled) {
      console.log(`[TFHKA] Enviando Factura Real para pago ${pagoId}`);
      try {
        // Evitar doble emisión real del mismo pago
        if (nuevosDetalles.factura_digital?.emitida && nuevosDetalles.factura_digital?.tfhka_seq && !nuevosDetalles.factura_digital?.simulated) {
          return NextResponse.json({ success: true, yaEmitida: true, url: nuevosDetalles.factura_digital.url, numeroControl: nuevosDetalles.factura_digital.numero_control });
        }

        let seq = await siguienteNumeroDocumento(supabase);
        let tfhkaResponse: any = null;
        for (let intento = 0; intento < 3; intento++) {
          jsonTFHKA.documentoElectronico.Encabezado.IdentificacionDocumento.NumeroDocumento = String(seq);
          tfhkaResponse = await TheFactoryHKA.emitirDocumento(jsonTFHKA.documentoElectronico);
          if (tfhkaResponse?.resultado?.numeroControl) break;
          const val = JSON.stringify(tfhkaResponse?.validaciones || tfhkaResponse?.mensaje || '').toLowerCase();
          // Número de documento repetido → probar el siguiente
          if (/(existe|duplic|registrad|utilizad)/.test(val) && /n[uú]mero/.test(val)) { seq++; continue; }
          break;
        }

        const finalUrl = tfhkaResponse?.resultado?.urlConsulta;
        const finalControl = tfhkaResponse?.resultado?.numeroControl;
        const finalDoc = tfhkaResponse?.resultado?.numeroDocumento || String(seq);

        // TFHKA rechazó el documento (p.ej. 203 sin rango): NO marcar como emitida
        if (!finalControl) {
          const msg = `TFHKA ${tfhkaResponse?.codigo || ''}: ${(tfhkaResponse?.validaciones || []).join('; ') || tfhkaResponse?.mensaje || 'respuesta sin número de control'}`;
          throw new Error(msg);
        }

        delete nuevosDetalles.factura_digital_error;
        nuevosDetalles.factura_digital = {
          emitida:          true,
          url:              finalUrl || null,
          numero_control:   finalControl,
          numero_documento: finalDoc,
          tfhka_seq:        parseInt(finalDoc, 10) || seq,
          fecha_emision:    new Date().toISOString(),
          raw_response:     tfhkaResponse,
        };
      } catch (err: any) {
        console.error("[TFHKA] Error en emisión real:", err.message);
        nuevosDetalles.factura_digital_error = err.message;
        if (nuevosDetalles.factura_digital && !nuevosDetalles.factura_digital.tfhka_seq) {
          delete nuevosDetalles.factura_digital; // quitar registros demo/falsos previos
        }
        await supabase.from('pagos_reportados').update({ detalles: nuevosDetalles }).eq('id', pagoId);
        return NextResponse.json({ error: 'Error en TFHKA: ' + err.message }, { status: 500 });
      }
    } else {
      console.log(`[SIMULACIÓN TFHKA] JSON generado:`, JSON.stringify(jsonTFHKA, null, 2));

      nuevosDetalles.factura_digital = {
        emitida:          true,
        url:              "https://democonsulta.thefactoryhka.com.ve/?doc=GhQVet4Fbe+vAHltz47VsoKrQ1NOzTmiOLp4jVe5oz4U01Z9FA/OdGcGnU9nU1co",
        numero_control:   `00-${(pagoId || '').replace(/-/g,'').slice(0,8).toUpperCase()}`,
        fecha_emision:    new Date().toISOString(),
        simulated:        true,
        payload_generado: jsonTFHKA,
      };
    }

    // Envío por correo: Cliente + Copia Interna de Respaldo Fiscal (Costo 0 en The Factory)
    const fallbackEmail = TheFactoryHKA.getFallbackEmail();
    const candEmail = (correoDestino || propRef?.correo_electronico || '').trim();
    const esComodin = !candEmail || isFictitiousEmail(candEmail) || candEmail.toLowerCase() === fallbackEmail.toLowerCase();
    const emailFinal = esComodin ? fallbackEmail : candEmail;

    if (enviarCorreo) {
      try {
        const envioInfo = await enviarFacturaConCopiaInterna({
          contribuyente: contribuyente || 'Contribuyente',
          identidad: identidad || 'N/A',
          numeroControl: nuevosDetalles.factura_digital.numero_control,
          numeroDocumento: nuevosDetalles.factura_digital.numero_documento,
          monto: totalAPagar,
          fecha: nuevosDetalles.factura_digital.fecha_emision,
          urlPdf: nuevosDetalles.factura_digital.url,
          correoContribuyente: emailFinal,
          esCorreoComodin: esComodin,
        });
        nuevosDetalles.factura_digital.envio_correo = envioInfo;
      } catch (mailErr: any) {
        console.warn('Aviso enviando correos de factura digital:', mailErr.message);
      }
    }

    nuevosDetalles.factura_digital.correo_utilizado = emailFinal;
    nuevosDetalles.factura_digital.es_correo_comodin = esComodin;
    nuevosDetalles.factura_digital.requiere_actualizacion_correo = esComodin;

    await supabase.from('pagos_reportados').update({ detalles: nuevosDetalles }).eq('id', pagoId);

    return NextResponse.json({
      success: true,
      simulated: !isTfhkaEnabled,
      url: nuevosDetalles.factura_digital.url,
      numeroControl: nuevosDetalles.factura_digital.numero_control,
      numeroDocumento: nuevosDetalles.factura_digital.numero_documento,
      correoUtilizado: emailFinal,
      esCorreoComodin: esComodin
    });

  } catch (err: any) {
    console.error("Error al emitir factura digital:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
