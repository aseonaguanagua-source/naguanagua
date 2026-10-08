const { Client } = require('pg');

async function checkOldSystem() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres'
  });
  
  try {
    await client.connect();
    
    // In SIGYR, it's usually public.sed_inmuebles_actividades_eco
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables:", res.rows.map(r => r.table_name));

    await client.end();
  } catch (err) {
    console.error('Connection error', err.stack);
  }
}
checkOldSystem();
