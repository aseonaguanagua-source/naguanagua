const fs = require('fs');

async function extract() {
  const sql = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql', 'utf8');
  
  const properties = [];
  const lines = sql.split('\n');
  
  let parentId = 21001; // ID of URB016120
  let children = 0;
  
  for (const l of lines) {
    if (!l.startsWith("(")) continue;
    
    // Naive split by comma, works enough for integers at least
    const parts = l.split(',');
    if (parts.length > 25) {
      // "id" is index 0
      // "property_id" is index 22
      const propId = parts[22].trim();
      if (propId === String(parentId)) {
        const actId = parseInt(parts[4], 10);
        // Find URB code which is somewhere in the tuple (e.g. index 10)
        const match = l.match(/'(URB\d+)'/);
        const urb = match ? match[1] : 'UNKNOWN';
        console.log(`CHILD: ${urb} -> actId: ${actId}`);
        children++;
      }
    }
  }
  console.log(`Found ${children} children for URB016120 (ID: ${parentId})`);
}
extract();
