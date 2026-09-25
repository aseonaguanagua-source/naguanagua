// ============================================
// TIPOS CENTRALES DEL SISTEMA NAGUANAGUA ZERO
// ============================================

// ── Contribuyente (vista unificada desde inmuebles + contribuyentes) ──
export interface Contribuyente {
  Identidad: string;
  Contribuyente: string;
  Telefono?: string;
  Correo?: string;
  CodCont?: string;
  cod_cont?: string;
  Direccion?: string;
  Clasificacion: 'Residencial' | 'Comercial' | 'Industrial' | string;
  Actividad?: string;
  SaldoFavor: number;
  DeudaTotal?: number;
  Estado: 'Activo' | 'Inactivo' | 'Eliminado';
  FechaRegistro?: string;
  Observaciones?: string;
}

// ── Inmueble (tabla inmuebles en Supabase) ──
export interface Inmueble {
  id: string;
  inmueble: string;
  identidad: string;
  tipo: string | null;
  actividad_principal: string;
  direccion: string | null;
  estado: string;
  cant_inmuebles: number;
  mmv_mes: number;
  saldo_favor_bs: number;
  deuda_mmv: number;
  deuda_congelada_bs?: number;
  created_at: string;
  actividad_economica_id?: string | null;
  // Campos computados en el frontend
  contribuyentes?: any;
  Saldo?: string;
  DeudaMMV?: number;
}

// ── Recibo / Factura (tabla facturas en Supabase) ──
export interface Recibo {
  id: string;
  referencia: string;
  identidad: string;
  contribuyente?: string;
  inmueble?: string;
  monto: string;
  emision: string;
  vencimiento?: string;
  estado: 'Pendiente' | 'Por Verificar' | 'Abonado' | 'Pagado' | 'Anulado' | 'Reversado';
  created_at?: string;
}

// ── Pago Reportado (tabla pagos_reportados en Supabase) ──
export interface PagoReportado {
  id: string;
  identidad: string;
  monto: number;
  banco: string;
  referencia: string;
  tipo: 'Debito' | 'Transferencia' | 'Saldo a Favor';
  estado: 'Aprobado' | 'Por Verificar' | 'Rechazado';
  detalles: string | PagoDetalles;
  created_at: string;
}

export interface PagoDetalles {
  recibos: string[];
  cuotas: CuotaSeleccion[];
  servicios: string[];
  tala_poda: string[];
  cajero: string;
  es_abono: boolean;
  monto_abonado?: number;
  tasa_bcv: number;
  deuda_total_sistema?: number;
  fecha_transaccion?: string;
  tasa_bcv_aplicada?: number;
  nota_cambio_tasa?: string;
  monto_retencion_iva?: number;
  iva_percent?: number;
  es_condominio?: boolean;
  condominio_modo?: 'Total' | 'Local' | 'Abono';
  condominio_hijos_pagados?: string[];
  comprobante_url?: string;
  comprobante_b64?: string;
  comprobante_nombre?: string;
  factura_digital?: FacturaDigital;
  factura_digital_error?: string;
}

export interface FacturaDigital {
  emitida: boolean;
  url: string;
  numero_control?: string;
  numero_documento?: string;
  fecha_emision: string;
  simulated?: boolean;
  payload_generado?: any;
  raw_response?: any;
}

// ── Cuota de Convenio ──
export interface CuotaSeleccion {
  convId: string;
  cuotaId: number;
}

export interface Convenio {
  id: string;
  identidad: string;
  numero: string;
  estado: 'Al Día' | 'Moroso' | 'Cerrado';
  detalle_cuotas: string; // JSON string
  created_at?: string;
}

export interface CuotaPendiente {
  convId: string;
  numeroConv: string;
  cuotaId: number;
  fecha: string;
  monto: number;
  rawConv: Convenio;
}

// ── Servicio Especial ──
export interface ServicioEspecial {
  id: string;
  referencia: string;
  identidad: string;
  tipo: string;
  monto: string;
  estado: 'Pendiente' | 'Por Verificar' | 'Pagado';
  descripcion?: string;
  fecha?: string;
}

// ── Documento (Notas de Crédito, etc.) ──
export interface Documento {
  id: string;
  identidad: string;
  contribuyente: string;
  tipo: 'Nota de Credito' | string;
  estado: 'Vigente' | 'Usado' | 'Anulado';
  detalles: string; // JSON string
  created_at: string;
}

// ── Configuración del sistema ──
export interface SistemaConfig {
  id: string;
  valor: any;
  tcmmv?: number;
}

// ── Sesión de pago (historial local de la sesión del cajero) ──
export interface PagoSesion {
  contribuyente: string;
  identidad: string;
  inmueble: string;
  monto: number;
  metodo: string;
  referencia: string;
  hora: string;
  esAbono: boolean;
  saldoFavor: number;
}

// ── Payload de confirmación de pago ──
export interface ConfirmPayload {
  montoReal: number;
  finalTotal: number;
  saldoAFavorNuevo: number;
  esAbono: boolean;
  descuentoSaldoFavor: number;
  reqRef: boolean;
  recibosSeleccionados: string[];
  cuotasSeleccionadas: CuotaSeleccion[];
  serviciosSeleccionados: string[];
  talaPodaSeleccionada: string[];
}

// ── Helpers ──
export function parsePagoDetalles(raw: string | PagoDetalles | undefined): PagoDetalles {
  if (!raw) return { recibos: [], cuotas: [], servicios: [], tala_poda: [], cajero: '', es_abono: false, tasa_bcv: 0 };
  if (typeof raw === 'object') return raw as PagoDetalles;
  try { return JSON.parse(raw); } catch { return { recibos: [], cuotas: [], servicios: [], tala_poda: [], cajero: '', es_abono: false, tasa_bcv: 0 }; }
}
