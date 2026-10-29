import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request) {
  // SEGURIDAD FISCAL: No se permite emitir automáticamente facturas electrónicas en lote ante The Factory HKA / SENIAT.
  // Cada factura electrónica debe ser revisada y emitida de forma individual por el operador.
  return NextResponse.json({
    error: 'La emisión automática en lote de facturas electrónicas ha sido deshabilitada por seguridad fiscal. Cada factura comercial debe ser revisada y emitida de forma individual con confirmación expresa del operador.',
    success: false
  }, { status: 403 });
}
