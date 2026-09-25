const fs = require('fs');

async function extractActivities() {
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
      
      const endpoints = [
        'https://api.naguanagua.globalgreenrec.com/api/economic-activities',
        'https://api.naguanagua.globalgreenrec.com/api/economic_activities',
        'https://api.naguanagua.globalgreenrec.com/api/admin/economic_activities',
        'https://api.naguanagua.globalgreenrec.com/api/parameters/economic_activities'
      ];
      
      for (const ep of endpoints) {
        console.log(`Fetching ${ep}...`);
        const epRes = await fetch(ep, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        
        if (epRes.ok) {
          const list = await epRes.json();
          fs.writeFileSync('economic_activities.json', JSON.stringify(list, null, 2));
          console.log(`SUCCESS! Saved activities from ${ep}`);
          return;
        } else {
          console.log(`Failed ${epRes.status}`);
        }
      }
      
      // If we didn't find the exact endpoint, maybe it's paginated or something else
      console.log("Could not find the correct economic activities endpoint.");
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

extractActivities();
