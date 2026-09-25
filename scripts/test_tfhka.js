const { TheFactoryHKA } = require('../src/lib/thefactoryhka.ts');
// We need to use ts-node or dynamically import in a node environment, 
// so I'll write a simple test script here without TS syntax just to fetch token.
async function test() {
  const baseUrl = 'https://demoemisionv2.thefactoryhka.com.ve';
  const user = 'sqovrqunrqjv_tfhka';
  const password = 'UB!yb7U/r*/?';

  try {
    const res = await fetch(`${baseUrl}/api/Autenticacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: user, clave: password })
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (e) {
    console.error(e);
  }
}

test();
