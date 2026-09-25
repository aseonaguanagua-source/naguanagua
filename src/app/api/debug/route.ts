import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
  // Solo permitir en desarrollo
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Debug endpoint disabled in production' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || 'URB025805';

  const { data: inmuebles, error: err1 } = await supabase.from('inmuebles').select('*, contribuyentes(*)').ilike('inmueble', `%${q}%`);
  const { data: contrib, error: err2 } = await supabase.from('contribuyentes').select('*').ilike('identidad', `%${q}%`);

  return NextResponse.json({
    inmuebles,
    contribuyentes: contrib,
    errors: { err1, err2 }
  });
}
