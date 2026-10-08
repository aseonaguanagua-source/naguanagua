const fs = require('fs');

async function extract() {
  const sql = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql', 'utf8');
  const activities = JSON.parse(fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/extracted/actividades_economicas.json', 'utf8'));

  const actMap = {};
  for (const a of activities) {
    actMap[a.id] = a.nombre;
  }
  
  const properties = [];
  const lines = sql.split('\n');
  for (const l of lines) {
    if (!l.startsWith("(")) continue;
    
    const match = l.match(/^\((\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+).*?'(URB\d+)'/);
    if (match) {
      const actId = parseInt(match[5], 10);
      const urb = match[6];
      if (urb === "URB016119" || urb === "URB016120" || urb === "URB016226") {
        properties.push({ urb, actId, name: actMap[actId] || 'UNKNOWN' });
      }
    }
  }
  
  for (let i = 0; i < properties.length; i++) {
    console.log(`${properties[i].urb} -> ID: ${properties[i].actId} -> Name: ${properties[i].name}`);
  }
}
extract();
