import { NextResponse } from 'next/server';

export async function GET() {
  // Script de fix deshabilitado en producción — solo usar vía Supabase Studio
  return NextResponse.json({ error: 'Fix endpoint disabled. Use Supabase Studio for manual corrections.' }, { status: 403 });
}
