const fs = require('fs');
const path = require('path');

async function extractActivities() {
  const loginUrl = process.env.LEGACY_API_LOGIN_URL || 'https://api.naguanagua.globalgreenrec.com/api/auth/login';
  const username = process.env.LEGACY_API_USER;
  const password = process.env.LEGACY_API_PASS;

  if (!username || !password) {
    console.error('Error: Defina LEGACY_API_USER y LEGACY_API_PASS en las variables de entorno antes de ejecutar este script.');
    process.exitCode = 1;
    return;
  }

  try {
    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`Login fallido con estado HTTP ${res.status}`);
      process.exitCode = 1;
      return;
    }

    const data = await res.json();
    const token = data?.token || data?.access_token;
    if (!token) {
      console.error('Error: La respuesta de login no incluyó un token válido.');
      process.exitCode = 1;
      return;
    }

    const endpoints = [
      'https://api.naguanagua.globalgreenrec.com/api/economic-activities',
      'https://api.naguanagua.globalgreenrec.com/api/economic_activities',
      'https://api.naguanagua.globalgreenrec.com/api/admin/economic_activities',
      'https://api.naguanagua.globalgreenrec.com/api/parameters/economic_activities'
    ];

    for (const ep of endpoints) {
      console.log(`Fetching ${ep}...`);
      try {
        const epRes = await fetch(ep, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(15000),
        });

        if (epRes.ok) {
          const list = await epRes.json();
          const outPath = path.resolve(__dirname, 'economic_activities.json');
          fs.writeFileSync(outPath, JSON.stringify(list, null, 2), 'utf8');
          console.log(`SUCCESS! Saved activities from ${ep} to ${outPath}`);
          return;
        } else {
          console.log(`Failed ${epRes.status}`);
        }
      } catch (epErr) {
        console.warn(`Error consultando ${ep}:`, epErr.message);
      }
    }

    console.error('Could not find the correct economic activities endpoint.');
    process.exitCode = 1;
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  }
}

extractActivities();
