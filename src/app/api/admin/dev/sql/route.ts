import { NextResponse } from 'next/server';
import { Client } from 'pg';

const DEV_PASS = process.env.GOD_MODE_SECRET || '1756762';

export async function POST(req: Request) {
  let client: Client | null = null;
  try {
    const body = await req.json();
    const { query, pass } = body;

    if (!pass || pass !== DEV_PASS) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Query vacía' }, { status: 400 });
    }

    let connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      const dbPass = process.env.SUPABASE_DB_PASSWORD;
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      
      if (dbPass && supaUrl) {
        const host = supaUrl.replace('https://', 'db.');
        connectionString = `postgresql://postgres:${encodeURIComponent(dbPass)}@${host}:5432/postgres`;
      } else {
        return NextResponse.json({ error: 'DATABASE_URL o SUPABASE_DB_PASSWORD no configurados en .env' }, { status: 500 });
      }
    }

    client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
    });

    await client.connect();
    
    // Execute query
    const result = await client.query(query);

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
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }
  }
}
