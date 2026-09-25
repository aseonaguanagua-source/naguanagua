const fs = require('fs');

async function loginAndExtract() {
  const loginUrl = 'https://naguanagua.globalgreenrec.com/api/login'; // Guessed endpoint
  // Let's first try to hit the root or check if there's a specific auth endpoint.
  // Actually, standard Laravel/Sanctum APIs or Express APIs use /api/login or /api/auth/login.
  
  const payload = {
    username: 'saru0001',
    password: 'Luna.01',
    // also try email just in case
    email: 'saru0001'
  };

  try {
    const res = await fetch('https://naguanagua.globalgreenrec.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text.substring(0, 500));
  } catch(e) {
    console.error("Error:", e.message);
  }
}

loginAndExtract();
