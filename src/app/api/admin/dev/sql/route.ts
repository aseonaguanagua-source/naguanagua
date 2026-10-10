import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, pass } = body;

    if (pass !== '1756762') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!query) {
      return NextResponse.json({ error: 'Query vacía' }, { status: 400 });
    }

    // Attempt to get database URL from Supabase envs or a standard DATABASE_URL
    // En Vercel con Supabase, si no existe DATABASE_URL, podemos inferirla de NEXT_PUBLIC_SUPABASE_URL
    let connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
       // If no direct DB URL is provided, we can't connect directly via pg,
       // unless we construct the URI from Supabase credentials if available.
       // Supabase REST API does NOT support raw SQL via JS client without RPC.
       // So we MUST have a postgres connection string.
       // Most Next.js deployments with Supabase will have it if requested.
       
       // Fallback for this specific project: the user might not have DATABASE_URL set.
       // Let's try to parse from SUPABASE_URL just in case, but usually password is in SUPABASE_DB_PASSWORD.
       const dbPass = process.env.SUPABASE_DB_PASSWORD;
       const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
       
       if (dbPass && supaUrl) {
          const host = supaUrl.replace('https://', 'db.').replace('.supabase.co', '.supabase.co');
          connectionString = `postgresql://postgres:${dbPass}@${host}:5432/postgres`;
       } else {
          return NextResponse.json({ error: 'DATABASE_URL o SUPABASE_DB_PASSWORD no configurados en .env' }, { status: 500 });
       }
    }

    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    
    // Execute query
    const result = await client.query(query);
    
    await client.end();

    return NextResponse.json({
      success: true,
      command: result.command,
      rowCount: result.rowCount,
      rows: result.rows,
      fields: result.fields?.map((f: any) => f.name) || []
    });
  } catch (error: any) {
    console.error('SQL Error:', error);
    return NextResponse.json({ error: error.message || 'Error ejecutando query' }, { status: 500 });
  }
}
