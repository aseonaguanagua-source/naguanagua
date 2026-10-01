import { supabase } from '@/lib/supabase';

export type AuditCategoria =
  | 'SESION'
  | 'COBRO'
  | 'TRANSFERENCIA'
  | 'TASA'
  | 'CONTRIBUYENTE'
  | 'RECIBO'
  | 'REPORTE'
  | 'CONFIGURACION'
  | 'CONVENIO'
  | 'SISTEMA';

export const logAudit = async (
  accion: string,
  detalles: Record<string, any> = {},
  categoria: AuditCategoria = 'SISTEMA'
) => {
  try {
    let usuario = 'SISTEMA';
    let modulo = '';
    if (typeof window !== 'undefined') {
      const u = localStorage.getItem('adminUser');
      const l = localStorage.getItem('adminLetra');
      if (u) usuario = l ? `${l}-${u}` : u;
      modulo = window.location.pathname;
    }
    // Escribe categoria y modulo como columnas directas en la BD.
    // También los guarda en detalles para compatibilidad con registros anteriores.
    await supabase.from('auditoria').insert([{
      usuario,
      accion,
      categoria,
      modulo,
      detalles: {
        ...detalles,
        _categoria: categoria,
        _modulo: modulo,
        _hora: new Date().toLocaleTimeString('es-VE'),
        _fecha: new Date().toLocaleDateString('es-VE'),
        _ts: new Date().toISOString(),
      }
    }]);
  } catch (e) {
    console.error('Audit Log Error:', e);
  }
};
