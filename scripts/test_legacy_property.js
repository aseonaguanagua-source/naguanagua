const fs = require('fs');

async function testProperty() {
  const loginUrl = 'https://api.naguanagua.globalgreenrec.com/api/auth/login';
  
  try {
    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({username: 'saru0001', password: 'Luna.01'})
    });
    
    if (res.ok) {
      const data = await res.json();
      const token = data.token;
      
      const ep = 'https://api.naguanagua.globalgreenrec.com/api/properties/view';
      console.log(`Fetching ${ep} for property_id 21107...`);
      
      const epRes = await fetch(ep, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ property_id: 21107 })
      });
      
      if (epRes.ok) {
        const propData = await epRes.json();
        fs.writeFileSync('scratch/legacy_property_21107.json', JSON.stringify(propData, null, 2));
        console.log(`SUCCESS! Saved property to scratch/legacy_property_21107.json`);
      } else {
        const text = await epRes.text();
        console.log(`Failed ${epRes.status}: ${text}`);
      }
    } else {
      console.log("Login failed", res.status);
    }
  } catch(e) {
    console.error(e);
  }
}
testProperty();
