
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('facturas')
    .update({ estado: 'Pagado' })
    .eq('referencia', 'CM-C-000207-09-2026')
    .select();
  return NextResponse.json({ data, error });
}
