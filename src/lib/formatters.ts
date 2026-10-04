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
