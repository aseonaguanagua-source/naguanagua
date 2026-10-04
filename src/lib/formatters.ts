/**
 * formatters.ts
 * Utilidades centralizadas de formateo para la aplicación.
 */

/**
 * Formatea montos numéricos al estándar venezolano (de-DE con coma decimal y punto de miles)
 */
export function formatBs(amount: number | string): string {
  if (!amount) return '0,00';
  const num = typeof amount === 'string' ? parseFloat(amount.toString().replace(/[^\d.-]/g, '')) : amount;
  if (isNaN(num)) return '0,00';
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
    clean === '---'
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
  if (prefixMatch) {
    prefix = prefixMatch[1];
    raw = prefixMatch[2].trim();
  }

  // Quitar cualquier carácter no alfanumérico
  const clean = raw.replace(/[^0-9A-Z]/g, '');
  if (!clean) return [rawInput.trim().toUpperCase()];

  const digits = clean.replace(/\D/g, '');
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

