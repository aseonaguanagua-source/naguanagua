export interface BancoOficial {
  codigo: string;
  nombre: string;
  label: string;
}

export const LISTA_BANCOS_OFICIALES: BancoOficial[] = [
  { codigo: '0105', nombre: 'Banco Mercantil, C.a. S.a.c.a. Banco Universal.', label: '0105 - Banco Mercantil, C.a. S.a.c.a. Banco Universal.' },
  { codigo: '0102', nombre: 'Banco De Venezuela S.a.c.a. Banco Universal.', label: '0102 - Banco De Venezuela S.a.c.a. Banco Universal.' },
  { codigo: '0104', nombre: 'Venezolano De Crédito, S.a. Banco Universal.', label: '0104 - Venezolano De Crédito, S.a. Banco Universal.' },
  { codigo: '0108', nombre: 'Banco Provincial, S.a. Banco Universal.', label: '0108 - Banco Provincial, S.a. Banco Universal.' },
  { codigo: '0114', nombre: 'Banco Del Caribe, C.a. Banco Universal.', label: '0114 - Banco Del Caribe, C.a. Banco Universal.' },
  { codigo: '0115', nombre: 'Banco Exterior, C.a. Banco Universal.', label: '0115 - Banco Exterior, C.a. Banco Universal.' },
  { codigo: '0128', nombre: 'Banco Caroni, C.a. Banco Universal.', label: '0128 - Banco Caroni, C.a. Banco Universal.' },
  { codigo: '0134', nombre: 'Banesco Banco Universal S.a.c.a.', label: '0134 - Banesco Banco Universal S.a.c.a.' },
  { codigo: '0137', nombre: 'Banco Sofitasa Banco Universal, C.a.', label: '0137 - Banco Sofitasa Banco Universal, C.a.' },
  { codigo: '0138', nombre: 'Banco Plaza, C.a.', label: '0138 - Banco Plaza, C.a.' },
  { codigo: '0146', nombre: 'Banco De La Gente Emprendedora Bangente, C.a.', label: '0146 - Banco De La Gente Emprendedora Bangente, C.a.' },
  { codigo: '0151', nombre: 'Bfc Banco Fondo Comun C.a. Banco Universal.', label: '0151 - Bfc Banco Fondo Comun C.a. Banco Universal.' },
  { codigo: '0156', nombre: '100% Banco, Banco Comercial, C.a..', label: '0156 - 100% Banco, Banco Comercial, C.a..' },
  { codigo: '0157', nombre: 'Del Sur Banco Universal, C.a..', label: '0157 - Del Sur Banco Universal, C.a..' },
  { codigo: '0163', nombre: 'Banco Del Tesoro, C.a. Banco Universal.', label: '0163 - Banco Del Tesoro, C.a. Banco Universal.' },
  { codigo: '0166', nombre: 'Banco Agricola De Venezuela, C.a. Banco Universal.', label: '0166 - Banco Agricola De Venezuela, C.a. Banco Universal.' },
  { codigo: '0168', nombre: 'Bancrecer S.a. Banco De Desarrollo.', label: '0168 - Bancrecer S.a. Banco De Desarrollo.' },
  { codigo: '0169', nombre: 'R4, Banco Microfinanciero, C.a..', label: '0169 - R4, Banco Microfinanciero, C.a..' },
  { codigo: '0171', nombre: 'Banco Activo, C.a. Banco Comercial.', label: '0171 - Banco Activo, C.a. Banco Comercial.' },
  { codigo: '0174', nombre: 'Banplus Banco Comercial, C.a..', label: '0174 - Banplus Banco Comercial, C.a..' },
  { codigo: '0191', nombre: 'Banco Nacional Crédito, C.a. Banco Universal.', label: '0191 - Banco Nacional Crédito, C.a. Banco Universal.' },
  { codigo: '0172', nombre: 'Bancamiga, Banco Universal.', label: '0172 - Bancamiga, Banco Universal.' },
  { codigo: '0175', nombre: 'Banco Digital De Los Trabajadores.', label: '0175 - Banco Digital De Los Trabajadores.' },
  { codigo: '0177', nombre: 'Banco De La Fuerza Armada Nacional Bolivariana, banco Universal, C.a.', label: '0177 - Banco De La Fuerza Armada Nacional Bolivariana, banco Universal, C.a.' },
  { codigo: '0178', nombre: 'N58 Banco Digital.', label: '0178 - N58 Banco Digital.' }
];

export const LISTA_BANCOS: string[] = LISTA_BANCOS_OFICIALES.map(b => b.label);

export const bancosVenezuela = LISTA_BANCOS_OFICIALES;

export const BANCO_DEFAULT_EMISOR = '0102 - Banco De Venezuela S.a.c.a. Banco Universal.';

/**
 * Normaliza cualquier nombre corto o código de banco al label oficial exacto de LISTA_BANCOS
 * para que el <select> de Conciliación Bancaria y Caja siempre lo reconozca y seleccione automáticamente.
 */
export function normalizarBancoOficial(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s || s === 'N/A' || /^punto|^d[eé]bito|^cr[eé]dito|^tmd|^tvd/i.test(s)) return '';
  if (LISTA_BANCOS.includes(s)) return s;

  const codeMatch = s.match(/\b(01\d{2})\b/);
  if (codeMatch) {
    const byCode = LISTA_BANCOS_OFICIALES.find(b => b.codigo === codeMatch[1]);
    if (byCode) return byCode.label;
  }

  const low = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (low.includes('venezuela') || low === 'bdv') return '0102 - Banco De Venezuela S.a.c.a. Banco Universal.';
  if (low.includes('mercantil')) return '0105 - Banco Mercantil, C.a. S.a.c.a. Banco Universal.';
  if (low.includes('provincial') || low.includes('bbva')) return '0108 - Banco Provincial, S.a. Banco Universal.';
  if (low.includes('banesco')) return '0134 - Banesco Banco Universal S.a.c.a.';
  if (low.includes('bancamiga')) return '0172 - Bancamiga, Banco Universal.';
  if (low.includes('nacional de credito') || low.includes('nacional credito') || low.includes('bnc')) return '0191 - Banco Nacional Crédito, C.a. Banco Universal.';
  if (low.includes('exterior')) return '0115 - Banco Exterior, C.a. Banco Universal.';
  if (low.includes('caribe') || low.includes('bancaribe')) return '0114 - Banco Del Caribe, C.a. Banco Universal.';
  if (low.includes('tesoro')) return '0163 - Banco Del Tesoro, C.a. Banco Universal.';
  if (low.includes('activo')) return '0171 - Banco Activo, C.a. Banco Comercial.';
  if (low.includes('banplus')) return '0174 - Banplus Banco Comercial, C.a..';
  if (low.includes('fondo comun') || low.includes('bfc')) return '0151 - Bfc Banco Fondo Comun C.a. Banco Universal.';
  if (low.includes('caroni')) return '0128 - Banco Caroni, C.a. Banco Universal.';
  if (low.includes('plaza')) return '0138 - Banco Plaza, C.a.';
  if (low.includes('sofitasa')) return '0137 - Banco Sofitasa Banco Universal, C.a.';
  if (low.includes('del sur') || low.includes('delsur')) return '0157 - Del Sur Banco Universal, C.a..';
  if (low.includes('100%')) return '0156 - 100% Banco, Banco Comercial, C.a..';
  if (low.includes('bancrecer')) return '0168 - Bancrecer S.a. Banco De Desarrollo.';
  if (low.includes('banfanb') || low.includes('fuerza armada')) return '0177 - Banco De La Fuerza Armada Nacional Bolivariana, banco Universal, C.a.';
  if (low.includes('trabajadores') || low.includes('bicentenario')) return '0175 - Banco Digital De Los Trabajadores.';
  if (low.includes('venezolano de credito') || low.includes('bvc')) return '0104 - Venezolano De Crédito, S.a. Banco Universal.';

  const partial = LISTA_BANCOS_OFICIALES.find(b =>
    b.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(low)
  );
  return partial ? partial.label : s;
}
