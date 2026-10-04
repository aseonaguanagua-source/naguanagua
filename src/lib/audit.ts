import { supabase } from '@/lib/supabase';

export type AuditCategoria =
  | 'COBRO'
  | 'CAJA'
  | 'DEUDA'
  | 'CONTRIBUYENTE'
  | 'INMUEBLE'
  | 'TASA'
  | 'FACTURACION'
  | 'CONCILIACION'
  | 'CONVENIO'
  | 'SESION'
  | 'SEGURIDAD'
  | 'REPORTE'
  | 'CONFIGURACION'
  | 'TRANSFERENCIA'
  | 'RECIBO'
  | 'SISTEMA';


export type AuditCriticidad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export interface AuditLogEntry {
  id?: string;
  usuario: string;
  accion: string;
  categoria: AuditCategoria;
  modulo?: string;
  detalles: Record<string, any>;
  created_at?: string;
}

/**
 * Obtiene el identificador del usuario/trabajador activo actual en el cliente.
 * Detecta letra de caja, nombre de usuario y rol.
 */
export const getActiveAuditUser = (): { usuario: string; nombre?: string; letra?: string; rol?: string } => {
  if (typeof window === 'undefined') return { usuario: 'SISTEMA' };

  try {
    const rawUserData = localStorage.getItem('admin_user_data');
    if (rawUserData) {
      const uData = JSON.parse(rawUserData);
      if (uData.nombre || uData.usuario) {
        const uLabel = uData.letra ? `${uData.letra}-${uData.nombre || uData.usuario}` : (uData.nombre || uData.usuario);
        return {
          usuario: uLabel,
          nombre: uData.nombre || uData.usuario,
          letra: uData.letra || undefined,
          rol: uData.rol || 'Operador'
        };
      }
    }

    const u = localStorage.getItem('adminUser');
    const l = localStorage.getItem('adminLetra');
    if (u) {
      return {
        usuario: l ? `${l}-${u}` : u,
        nombre: u,
        letra: l || undefined,
        rol: u.toLowerCase().includes('admin') ? 'Administrador' : 'Cajero'
      };
    }

    const op = localStorage.getItem('operador_censo_auth');
    if (op) {
      return {
        usuario: `OP-${op}`,
        nombre: op,
        rol: 'Operador Censo'
      };
    }

    const portalDoc = localStorage.getItem('portal_doc');
    if (portalDoc) {
      return {
        usuario: `PORTAL-${portalDoc}`,
        nombre: localStorage.getItem('portal_user') || portalDoc,
        rol: 'Contribuyente Portal'
      };
    }
  } catch (e) {
    console.warn('Error reading audit user context:', e);
  }

  return { usuario: 'Administrador' };
};

/**
 * Registra una acción en la bitácora inmutable de auditoría (lado del cliente).
 */
export const logAudit = async (
  accion: string,
  detalles: Record<string, any> = {},
  categoria: AuditCategoria = 'SISTEMA',
  criticidad: AuditCriticidad = 'MEDIA'
): Promise<void> => {
  try {
    const userCtx = getActiveAuditUser();
    let modulo = '';
    if (typeof window !== 'undefined') {
      modulo = window.location.pathname;
    }

    // Auto-determinar criticidad si no fue especificada y la acción es sensible
    let finalCriticidad: AuditCriticidad = criticidad;
    const lowerAccion = accion.toLowerCase();
    if (
      lowerAccion.includes('tasa bcv') ||
      lowerAccion.includes('ajuste de deuda') ||
      lowerAccion.includes('congelar') ||
      lowerAccion.includes('exoner') ||
      lowerAccion.includes('anula') ||
      lowerAccion.includes('nota manual')
    ) {
      finalCriticidad = 'CRITICA';
    } else if (
      categoria === 'COBRO' ||
      categoria === 'CONCILIACION' ||
      categoria === 'CONVENIO' ||
      lowerAccion.includes('cobro') ||
      lowerAccion.includes('pago')
    ) {
      if (criticidad === 'MEDIA') finalCriticidad = 'ALTA';
    }

    const payload = {
      usuario: userCtx.usuario,
      accion,
      categoria,
      modulo,
      detalles: {
        ...detalles,
        criticidad: finalCriticidad,
        _usuario_nombre: userCtx.nombre,
        _usuario_rol: userCtx.rol,
        _usuario_letra: userCtx.letra,
        _categoria: categoria,
        _modulo: modulo,
        _hora: new Date().toLocaleTimeString('es-VE'),
        _fecha: new Date().toLocaleDateString('es-VE'),
        _ts: new Date().toISOString(),
      }
    };

    // Inserción no bloqueante
    await supabase.from('auditoria').insert([payload]);
  } catch (e) {
    console.error('Audit Log Error:', e);
  }
};

/**
 * Registra una acción de auditoría desde rutas de API o Server Actions.
 */
export const logAuditServer = async (
  accion: string,
  detalles: Record<string, any> = {},
  categoria: AuditCategoria = 'SISTEMA',
  criticidad: AuditCriticidad = 'MEDIA',
  usuario = 'SISTEMA',
  modulo = '/api'
): Promise<void> => {
  try {
    await supabase.from('auditoria').insert([{
      usuario,
      accion,
      categoria,
      modulo,
      detalles: {
        ...detalles,
        criticidad,
        _categoria: categoria,
        _modulo: modulo,
        _hora: new Date().toLocaleTimeString('es-VE'),
        _fecha: new Date().toLocaleDateString('es-VE'),
        _ts: new Date().toISOString(),
      }
    }]);
  } catch (e) {
    console.error('Server Audit Log Error:', e);
  }
};
