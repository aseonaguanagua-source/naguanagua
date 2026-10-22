export interface CuentaBancariaOficial {
  id: string;
  banco: string;
  codigoBanco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
  rif: string;
  alias: string;
  icono?: string;
  color?: string;
}

export const CUENTAS_BANCARIAS_OFICIALES: CuentaBancariaOficial[] = [
  {
    id: 'bancamiga',
    banco: 'Bancamiga',
    codigoBanco: '0172',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '01720110711101340717',
    titular: 'IAMEC BANCAMIGA',
    rif: 'G-200086149',
    alias: 'BANCAMIGA - 0172 - 0717',
    color: 'blue'
  },
  {
    id: 'banesco',
    banco: 'Banesco',
    codigoBanco: '0134',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '01341089590001008636',
    titular: 'IAMEC BANESCO',
    rif: 'G-200086149',
    alias: 'BANESCO - 0134 - 8636',
    color: 'emerald'
  }
];

export const BANCOS_DESTINO_LIST = [
  'Todos',
  'BANCAMIGA - 0172 - 0717',
  'BANESCO - 0134 - 8636',
  'BANCO DE VENEZUELA - 0102',
  'BANCO MERCANTIL - 0105',
  'BANCO PROVINCIAL - 0108',
];

export function getCuentaBancariaPorAlias(aliasOrName: string): CuentaBancariaOficial | undefined {
  if (!aliasOrName) return undefined;
  const upper = aliasOrName.toUpperCase();
  return CUENTAS_BANCARIAS_OFICIALES.find(c => 
    upper.includes(c.banco.toUpperCase()) || 
    upper.includes(c.codigoBanco) || 
    upper.includes(c.numeroCuenta) ||
    c.alias.toUpperCase() === upper
  );
}

export type BancoDestinoTipo = 'Banesco' | 'Bancamiga' | 'Otros';

/** Identifica si una transferencia fue recibida en Banesco, Bancamiga u otro banco oficial */
export function clasificarBancoDestino(p: any): BancoDestinoTipo {
  const det = typeof p?.detalles === 'object' ? p.detalles : (() => { try { return JSON.parse(p?.detalles || '{}'); } catch { return {}; } })();
  
  // 1. Revisar campos específicos de banco destino / receptor
  const strDest = String(
    det?.banco_destino || 
    det?.banco_receptor || 
    det?.bancoDestino || 
    det?.cuenta_receptora || 
    det?.cuentaDestino || 
    p?.banco_destino || 
    ''
  ).toUpperCase();
  
  if (strDest.includes('BANESCO') || strDest.includes('0134') || strDest.includes('8636') || strDest.includes('1715')) return 'Banesco';
  if (strDest.includes('BANCAMIGA') || strDest.includes('0172') || strDest.includes('0717')) return 'Bancamiga';

  // 2. Fallback si no tiene banco destino explícito: revisar banco / formaPago
  const strFallback = String(p?.banco || det?.banco || det?.formaPago || '').toUpperCase();
  if (strFallback.includes('BANESCO') || strFallback.includes('0134')) return 'Banesco';
  if (strFallback.includes('BANCAMIGA') || strFallback.includes('0172')) return 'Bancamiga';

  return 'Otros';
}
