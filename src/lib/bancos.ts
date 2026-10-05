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
