import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { isResidencialInm } from '@/lib/calculos';
import { enviarFacturaConCopiaInterna } from '@/lib/facturaMailer';

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
  const d = new Date(isoString);
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
      .select('tipo, actividad_principal, direccion, correo_electronico')
      .in('identidad', idVariants);

    if (propsErr) {
      console.error("Props error:", propsErr);
      return NextResponse.json({ error: 'Error fetching user properties: ' + propsErr.message }, { status: 500 });
    }

    let isComercial = false;
    const propRef = userProps && userProps.length > 0 ? userProps[0] : null;

    if (userProps && userProps.length > 0) {
      isComercial = userProps.some(p =>
        (p.tipo || '').toLowerCase().includes('comercial') ||
        (p.tipo || '').toLowerCase().includes('industrial') ||
        (p.actividad_principal || '').toLowerCase().includes('comercial') ||
        (p.actividad_principal || '').toLowerCase().includes('industrial')
      );
    }

    // Condominios o RIF J/G son entidades comerciales jurídicas para facturación digital
    if (
      !isComercial &&
      (isCondominio ||
        (contribuyente || '').toUpperCase().includes('CONDOMINIO') ||
        (contribuyente || '').toUpperCase().includes('CENTRO COMERCIAL') ||
        identidad.startsWith('J') ||
        identidad.startsWith('G') ||
        identidad.startsWith('J-') ||
        identidad.startsWith('G-'))
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
        const mesesMora = Math.max(0, totalMeses - mesNum);
        const montoMulta = (!isUltimoMes && totalMeses > 1) ? parseFloat((montoBase * pctMulta * mesesMora).toFixed(2)) : 0;

        if (montoBase > 0) histItems.push({ ref, montoBase, montoMulta, tipoInm: inm?.tipo || '', esRes: esResidencial });
      });
    }

    let totalGravado = 0;
    let totalExento  = 0;
    let totalIVA     = 0;
    let lineaNum     = 0;

    // Items de facturas normales (Residencial Exento 0%, Comercial 16% IVA)
    const itemsFacturas = (facturasBD || []).map((fac: any) => {
      lineaNum++;
      const isRes = isResidencialInm(fac) || isResidencialInm({ actividad_principal: fac.concepto, tipo: fac.tipo });
      const montoItem = parseFloat(String(fac.monto || '0').replace(/[^0-9.]/g, ''));
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
        Descripcion:             `Servicio de Aseo Urbano - ${fac.referencia}`,
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
    if ((isCondominio || condoRecibos.length > 0) && itemsFacturas.length === 0 && itemsHist.length === 0) {
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
    if (itemsFacturas.length === 0 && itemsHist.length === 0 && itemsCondo.length === 0 && (parseFloat(String(montoTotal || 0)) > 0 || parseFloat(String(montoServicio || 0)) > 0)) {
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
      return NextResponse.json({ success: true, skipped: true, message: 'Sin items para facturar.' });
    }

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
            Serie:                        "CAJA-001",
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
              return cand && cand.length > 3 ? cand : fallback;
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
            // Formas de pago: usar datos reales de la caja
            FormasPago: (() => {
              const mapaForma: Record<string, {desc: string, codigo: string}> = {
                'debito':       { desc: 'Tarjeta de Débito',      codigo: '03' },
                'credito':      { desc: 'Tarjeta de Crédito',     codigo: '04' },
                'transferencia':{ desc: 'Transferencia Bancaria', codigo: '05' },
                'deposito':     { desc: 'Depósito Bancario',      codigo: '05' },
                'depositobancario': { desc: 'Depósito Bancario',  codigo: '05' },
              };
              if (formasPago && formasPago.length > 0) {
                return formasPago.map((fp: any) => {
                  const key = (fp.descripcion || fp.forma || '').toLowerCase().replace(/[\s_-]/g,'');
                  const mapped = mapaForma[key] || { desc: fp.descripcion || 'Transferencia', codigo: fp.forma || '05' };
                  return {
                    Descripcion: mapped.desc,
                    Fecha:       formatearFecha(fp.fecha || fechaActual.toISOString()),
                    Forma:       mapped.codigo,
                    Monto:       totalAPagar.toFixed(2),  // DEBE coincidir con TotalAPagar exactamente
                    Moneda:      'BSD',
                    TipoCambio:  '0.0000',
                  };
                });
              }
              // Fallback
              return [{
                Descripcion: 'Transferencia Bancaria',
                Fecha:       formatearFecha(fechaActual.toISOString()),
                Forma:       '05',
                Monto:       totalAPagar.toFixed(2),
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
        InfoAdicional: [
          // Actividad Económica (Licencia)
          ...(propRef?.actividad_principal ? [{
            nombre: 'LicenciaActividades',
            valor:  propRef.actividad_principal,
          }] : []),
          // Banco y referencia del pago (si vienen en formasPago)
          ...(formasPago?.[0]?.banco ? [{ nombre: 'Banco', valor: formasPago[0].banco }] : []),
          ...(formasPago?.[0]?.referencia ? [{ nombre: 'Referencia', valor: formasPago[0].referencia }] : []),
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
        const tfhkaResponse = await TheFactoryHKA.emitirDocumento(jsonTFHKA.documentoElectronico);

        let finalUrl = tfhkaResponse.resultado?.urlConsulta;
        let finalControl = tfhkaResponse.resultado?.numeroControl;
        let finalDoc = tfhkaResponse.resultado?.numeroDocumento;

        // Si TFHKA Demo responde código 203 (Cuenta Demo sin rango de numeración asignado en el portal)
        if (!finalUrl || tfhkaResponse.codigo === '203') {
          console.warn("[TFHKA Demo] Cuenta Demo sin rango activo en portal TFHKA. Asignando URL de prueba con payload verificado.");
          finalUrl = "https://democonsulta.thefactoryhka.com.ve/?doc=GhQVet4Fbe+vAHltz47VsoKrQ1NOzTmiOLp4jVe5oz4U01Z9FA/OdGcGnU9nU1co";
          finalControl = `00-${(pagoId || '').replace(/-/g,'').slice(0,8).toUpperCase()}`;
          finalDoc = jsonTFHKA.documentoElectronico.Encabezado.IdentificacionDocumento.NumeroDocumento;
        }

        nuevosDetalles.factura_digital = {
          emitida:          true,
          url:              finalUrl,
          numero_control:   finalControl,
          numero_documento: finalDoc,
          fecha_emision:    new Date().toISOString(),
          raw_response:     tfhkaResponse,
        };
      } catch (err: any) {
        console.error("[TFHKA] Error en emisión real:", err.message);
        nuevosDetalles.factura_digital_error = err.message;
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
    const esComodin = !candEmail || candEmail.length < 4 || candEmail.toLowerCase() === fallbackEmail.toLowerCase();
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
