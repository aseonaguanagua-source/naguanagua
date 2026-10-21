/**
 * formatters.ts
 * Utilidades centralizadas de formateo para la aplicación.
 */

/**
 * Convierte cualquier representación de monto (número, string con punto, string con coma)
 * a un número flotante válido.
 */
export function parseLocalFloat(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val && val !== 0) return 0;
  let str = String(val).trim();
  if (!str) return 0;

  // Si tiene tanto punto como coma:
  // Ej: "1.500,50" -> punto es miles, coma es decimal
  // Ej: "1,500.50" -> coma es miles, punto es decimal
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  }

  // Si solo tiene coma:
  if (str.includes(',')) {
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  }

  // Si solo tiene punto:
  if (str.includes('.')) {
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) {
      str = str.replace(/\./g, '');
      const n = parseFloat(str);
      return isNaN(n) ? 0 : n;
    }

    const parts = str.split('.');
    if (parts.length === 2) {
      const dec = parts[1];
      // Si tiene 1 o 2 dígitos después del punto (ej. 15.5 o 15.50), es decimal
      if (dec.length <= 2) {
        const n = parseFloat(str);
        return isNaN(n) ? 0 : n;
      }
      // Si tiene 3 dígitos (ej. 1.000), en montos enteros de miles sin coma:
      if (parts[0] !== '0' && dec.length === 3) {
        str = str.replace(/\./g, '');
        const n = parseFloat(str);
        return isNaN(n) ? 0 : n;
      }
    }
  }

  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

/**
 * Formatea en tiempo real lo que el usuario tipea en un input de montos.
 * Agrupa los miles con puntos y los decimales con coma.
 * Admite que el usuario presione tanto '.' como ',' para indicar decimales.
 */
export function formatLocalNumberInput(val: string): string {
  if (!val && val !== '0') return '';
  let s = String(val).trim();
  if (!s) return '';

  let decimalPart: string | null = null;
  let integerPart = '';

  if (s.includes('.') && s.includes(',')) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      // 1.500,50 -> la coma es decimal
      integerPart = s.substring(0, lastComma).replace(/[^0-9]/g, '');
      decimalPart = s.substring(lastComma + 1).replace(/[^0-9]/g, '').substring(0, 2);
    } else {
      // 1,500.50 -> el punto es decimal
      integerPart = s.substring(0, lastDot).replace(/[^0-9]/g, '');
      decimalPart = s.substring(lastDot + 1).replace(/[^0-9]/g, '').substring(0, 2);
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    integerPart = parts[0].replace(/[^0-9]/g, '');
    decimalPart = parts.slice(1).join('').replace(/[^0-9]/g, '').substring(0, 2);
  } else if (s.includes('.')) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount === 1) {
      const parts = s.split('.');
      if (s.endsWith('.')) {
        integerPart = parts[0].replace(/[^0-9]/g, '');
        decimalPart = '';
      } else if (parts[1].length <= 2) {
        integerPart = parts[0].replace(/[^0-9]/g, '');
        decimalPart = parts[1].replace(/[^0-9]/g, '').substring(0, 2);
      } else {
        integerPart = s.replace(/[^0-9]/g, '');
      }
    } else {
      integerPart = s.replace(/[^0-9]/g, '');
    }
  } else {
    integerPart = s.replace(/[^0-9]/g, '');
  }

  if (integerPart.length > 1 && integerPart.startsWith('0')) {
    integerPart = integerPart.replace(/^0+/, '') || '0';
  }

  const formattedInt = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (decimalPart !== null) {
    return formattedInt ? `${formattedInt},${decimalPart}` : `0,${decimalPart}`;
  }

  return formattedInt;
}

/**
 * Formatea montos numéricos al estándar venezolano (de-DE con coma decimal y punto de miles).
 * Es idemptotente: formatBs(formatBs(x)) === formatBs(x).
 */
export function formatBs(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '0,00';
  const num = parseLocalFloat(amount);
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formatea números telefónicos venezolanos eliminando paréntesis,
 * máscaras de entrada residuales como "(    )    -" y espacios extra.
 * E.g.: "(0241) 842-61-90 (    )    -" -> "0241-8426190"
 * E.g.: "(0414) 123-4567" -> "0414-1234567"
 * E.g.: "024104120338296" -> "0412-0338296"
 */
export function formatPhoneNumber(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  const lower = s.toLowerCase();
  if (
    lower === 'no registrado' ||
    lower === 'n/a' ||
    lower === 'sin telf.' ||
    lower === 'sin telefono' ||
    lower === '---' ||
    s === '0' ||
    s === '-'
  ) {
    return '';
  }

  // Eliminar máscaras residuales vacías con paréntesis como "(    )    -" o "(   )"
  s = s.replace(/\(\s*\)\s*-?/g, '').trim();

  // Extraer todos los dígitos numéricos
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';

  // 1. Priorizar número celular venezolano 04XX (0412, 0414, 0424, 0416, 0426)
  const mobileMatch = digits.match(/(04(?:12|14|24|16|26)\d{7})/);
  if (mobileMatch) {
    return `${mobileMatch[1].slice(0, 4)}-${mobileMatch[1].slice(4)}`;
  }

  // 2. Fijo local venezolano 02XX (0241, 0212, 0243, 0245, etc.) con 7 dígitos
  const landlineMatch = digits.match(/(02\d{2}\d{7})/);
  if (landlineMatch) {
    return `${landlineMatch[1].slice(0, 4)}-${landlineMatch[1].slice(4)}`;
  }

  // 3. Si tiene exactamente 11 dígitos
  if (digits.length === 11) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  // 4. Si tiene 10 dígitos sin el cero inicial (ej. 4141234567)
  if (digits.length === 10 && /^[124]/.test(digits)) {
    return `0${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  // 5. Si tiene 7 dígitos (número directo)
  if (digits.length === 7) {
    return digits;
  }

  // Fallback: remover paréntesis, dobles espacios y guiones sobrantes
  return s
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

/**
 * Correos institucionales usados como comodín / copia de facturación. Si un contribuyente
 * los tiene como correo principal se consideran "sin correo real" y la caja pide actualizarlo.
 */
export const CORREOS_INSTITUCIONALES = [
  'facturacion.comercial@globalgreenca.com',
  'facturacion.naguanagua@gmail.com',
];

/**
 * Detecta si un correo electrónico es ficticio o un placeholder de migraciones pasadas (ej. 1058@test.com)
 */
export function isFictitiousEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return true;
  const clean = email.trim().toLowerCase();
  if (
    !clean ||
    clean === 'no registrado' ||
    clean === 'sin correo' ||
    clean === 's/c' ||
    clean === 'n/a' ||
    clean === '---' ||
    CORREOS_INSTITUCIONALES.includes(clean)
  ) {
    return true;
  }

  if (
    clean.includes('@test.com') ||
    clean.includes('@ejemplo.com') ||
    clean.includes('@example.com') ||
    clean.includes('@fake.com') ||
    clean.includes('@correo.com') ||
    clean.startsWith('sin@') ||
    clean.startsWith('no@')
  ) {
    return true;
  }

  if (!clean.includes('@') || !clean.includes('.')) return true;
  return false;
}

/**
 * Formatea fechas ISO a mes y año en español legible.
 * E.g.: "2025-10-04T00:44:30.448Z" -> "OCTUBRE 2025"
 */
export function formatMonthYear(dateStr?: string | null): string {
  if (!dateStr) return 'Sin fecha';
  const MESES = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      // Intento parsing YYYY-MM
      const p = String(dateStr).split('-');
      if (p.length >= 2) {
        const mIdx = parseInt(p[1]) - 1;
        return `${MESES[mIdx] || p[1]} ${p[0]}`;
      }
      return dateStr;
    }
    return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return String(dateStr);
  }
}

/**
 * Genera todas las variantes posibles de un documento/cédula/RIF
 * para hacer búsquedas tolerantes a prefijos (V <-> J <-> G <-> E),
 * guiones y ceros a la izquierda.
 *
 * Ej: "075477308" con prefijo "V" ->
 *     V-075477308, V075477308, V-75477308, V75477308,
 *     J-075477308, J075477308, J-75477308, J75477308,
 *     G-075477308, G075477308, E-075477308, E075477308,
 *     075477308, 75477308
 */
export function getIdentidadVariants(rawInput: string, defaultPrefix = 'V'): string[] {
  if (!rawInput || !rawInput.trim()) return [];

  let prefix = defaultPrefix.toUpperCase().trim();
  let raw = rawInput.trim().toUpperCase();

  // Si el usuario incluyó el prefijo dentro del texto escrito (ej: "J-075477308" o "J075477308")
  const prefixMatch = raw.match(/^([VEJPG])[-_\s]?(.*)$/);
  let remainder = raw;
  if (prefixMatch) {
    prefix = prefixMatch[1];
    remainder = prefixMatch[2].trim();
  }

  // Quitar cualquier carácter no alfanumérico
  const clean = raw.replace(/[^0-9A-Z]/g, '');
  if (!clean) return [rawInput.trim().toUpperCase()];

  // CRÍTICO: Si el resto contiene letras (ej: "AURI000012", "URB035277", "INMUEBLE"),
  // NO es un documento de identidad personal/jurídico (C.I./RIF).
  // No se deben extraer dígitos ni generar variantes numéricas (como "V-12") para evitar colisiones.
  const cleanRemainder = remainder.replace(/[^0-9A-Z]/g, '');
  const isPureDigits = /^\d+$/.test(cleanRemainder);
  if (!isPureDigits) {
    const directVariants = new Set<string>();
    directVariants.add(rawInput.trim().toUpperCase());
    directVariants.add(clean);
    return Array.from(directVariants);
  }

  const digits = cleanRemainder;
  const noLeadingZeros = digits.replace(/^0+/, '');
  const padded9 = digits ? digits.padStart(9, '0') : '';

  const variants = new Set<string>();

  // 1. Entradas directas
  variants.add(rawInput.trim().toUpperCase());
  variants.add(clean);

  // 2. Prefijos a considerar: el prefijo principal primero, luego alternativas
  const allPrefixes = [prefix];
  if (prefix === 'V') allPrefixes.push('J', 'G', 'E');
  else if (prefix === 'J') allPrefixes.push('V', 'G', 'E');
  else if (prefix === 'G') allPrefixes.push('J', 'V');
  else allPrefixes.push('V', 'J');

  const numberForms = new Set<string>();
  numberForms.add(clean);
  if (digits) {
    numberForms.add(digits);
    if (noLeadingZeros) numberForms.add(noLeadingZeros);
    if (padded9) numberForms.add(padded9);
  }

  for (const p of allPrefixes) {
    for (const num of numberForms) {
      variants.add(`${p}-${num}`);
      variants.add(`${p}${num}`);
    }
  }

  for (const num of numberForms) {
    variants.add(num);
  }

  return Array.from(variants);
}

/**
 * Variantes de una identidad YA CONOCIDA (ej. la de un contribuyente seleccionado).
 * Solo tolera guion y ceros a la izquierda; NUNCA cambia el prefijo.
 * Usar para cargar inmuebles/facturas/pagos de un contribuyente, de modo que
 * V-12345678, E-12345678 y J-123456789 (personas distintas) no se mezclen.
 *
 * Ej: "V-07092587" -> V-07092587, V07092587, V-7092587, V7092587, V-007092587, V007092587
 */
export function getIdentidadVariantsExact(identidad: string): string[] {
  if (!identidad || !identidad.trim()) return [];
  const raw = identidad.trim().toUpperCase();
  const m = raw.match(/^([VEJPG])[-_\s]?0*(\d+)$/);
  if (!m) return [raw];
  const [, p, n] = m;
  const forms = new Set<string>([n, n.padStart(8, '0'), n.padStart(9, '0')]);
  const out = new Set<string>([raw]);
  forms.forEach(f => { out.add(`${p}-${f}`); out.add(`${p}${f}`); });
  return Array.from(out);
}

/**
 * Limpia sufijos de categoría tarifaria (zona o nivel) y etiquetas internas del nombre de actividad.
 * - Zonas: (ZONA A), (ZONA B), (ZONA C), (ZONA D), (A), (B), ZONA A, etc.
 * - Niveles: (ALTA), (MEDIA), (BAJA), (ESPECIAL), - ALTA, etc.
 * - Sufijos residenciales: QUINTA A -> QUINTA, CASA B -> CASA, etc.
 * - Etiquetas internas: [hijo_de:...], [condominio], [hijo], Padre en SIGYR, etc.
 *
 * Ej: "QUINTA (ZONA A)" -> "QUINTA"
 *     "CAFETERIAS (ALTA)" -> "CAFETERIAS"
 *     "RESTAURANTES (MEDIA)" -> "RESTAURANTES"
 *     "APARTAMENTO (ZONA B)" -> "APARTAMENTO"
 */
export function formatActividad(act?: string | null): string {
  if (!act) return '';
  return String(act)
    .replace(/\[[^\]]+\]/g, '')
    .replace(/Padre en SIGYR:\s*[A-Z0-9_-]+/gi, '')
    .replace(/\s*\((ZONA\s+[A-Z0-9]+|[A-D])\)/gi, '')
    .replace(/\s*\((ALTA|MEDIA|BAJA|ESPECIAL|RESIDENCIAL|COMERCIAL)\)/gi, '')
    .replace(/\s*-\s*(ALTA|MEDIA|BAJA|ESPECIAL)\b/gi, '')
    .replace(/\b(ALTA|MEDIA|BAJA)\b/gi, '')
    .replace(/\bZONA\s+[A-D]\b/gi, '')
    .replace(/\b(CASA|QUINTA|APARTAMENTO|TOWNHOUSE)\s+([A-D])\b/gi, '$1')
    .replace(/\s+-\s+[A-D]\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-\s,./]+|[-\s,./]+$/g, '')
    .trim();
}

/**
 * Sanitiza y formatea una dirección fiscal para que cumpla con los estándares
 * de facturación electrónica SENIAT (TFHKA máx 100 caracteres) y elimine
 * prefijos catastrales residuales (ej: '0 0 .', '1 020 11', '0 4', 'NRO. .').
 */
export function sanitizarDireccionFiscal(
  raw: string | null | undefined,
  opts: {
    unidadNumero?: string | null;
    nombreCondo?: string | null;
    parentDir?: string | null;
  } = {}
): string {
  let s = String(raw || '').trim();

  // Si está vacía o es solo ceros/puntos, intentar construir desde la dirección del padre o nombre del condominio
  const esVaciaOInvalida = !s || /^[0\s.-]+$/i.test(s) || s.toUpperCase() === 'N/A';
  if (esVaciaOInvalida) {
    if (opts.parentDir && typeof opts.parentDir === 'string' && opts.parentDir.trim().length > 3) {
      s = opts.parentDir.trim();
    } else if (opts.nombreCondo && typeof opts.nombreCondo === 'string') {
      s = `${opts.nombreCondo}, NAGUANAGUA, EDO. CARABOBO`;
    } else {
      return 'NAGUANAGUA, EDO. CARABOBO';
    }
  }

  // 1. Eliminar prefijos catastrales numéricos iniciales antes de palabras de dirección
  const match = s.match(/\b(URB|AV|AVENIDA|CALLE|CARRERA|SECTOR|CARRETERA|ZONA|AUTOPISTA|PARCELAMIENTO|CONJ|EDIF|C\.C|CENTRO|RESD|RESIDENCIAS?|CASA|LOCAL|QUINTA|GALPON)\b/i);
  if (match && match.index !== undefined && match.index > 0) {
    s = s.slice(match.index);
  } else {
    s = s.replace(/^[0-9\s.-]+(\bS\/N\b\s*)?/i, '');
  }

  // 2. Limpiar secuencias defectuosas como 'NRO. .', 'NRO .', 'APTO NRO. .', 'LOCAL .'
  s = s.replace(/\b(NRO|APTO|LOCAL|OFICINA)\.?\s*\./gi, '');
  s = s.replace(/\s+/g, ' ').trim();

  // 3. Integrar el número de unidad si fue provisto y no está ya presente
  const uNum = (opts.unidadNumero || '').trim();
  if (uNum) {
    const cleanUNum = uNum.replace(/^(LOCAL|APTO|NRO\.?|OFICINA)\s*/i, '');
    const regexUnit = new RegExp(`\\b(LOCAL|APTO|OFICINA|NRO\\.?)\\s*${cleanUNum.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (!regexUnit.test(s)) {
      if (/C\.C\.|CENTRO COMERCIAL|CONJ\.|EDIF\./i.test(s)) {
        s = s.replace(/(C\.C\.[^,]+|CENTRO COMERCIAL[^,]+|CONJ\.[^,]+|EDIF\.[^,]+)/i, `$1 LOCAL ${cleanUNum}`);
      } else {
        s = `LOCAL ${cleanUNum}, ${s}`;
      }
    }
  }

  // 4. Asegurar mención de Naguanagua y Carabobo
  if (!/NAGUANAGUA/i.test(s)) {
    s += ', NAGUANAGUA';
  }
  if (!/CARABOBO/i.test(s)) {
    s += ', EDO. CARABOBO';
  }

  s = s.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  s = s.replace(/^,\s*|,\s*$/g, '');

  // 5. Ajustar a límite SENIAT (100 caracteres)
  if (s.length > 100) {
    s = s
      .replace(/CENTRO COMERCIAL/gi, 'C.C.')
      .replace(/CONJUNTO RESIDENCIAL/gi, 'CONJ. RESD.')
      .replace(/URBANIZACION/gi, 'URB.')
      .replace(/AVENIDA/gi, 'AV.')
      .replace(/ESTADO CARABOBO/gi, 'EDO. CARABOBO');
  }

  return s.slice(0, 100).trim();
}


