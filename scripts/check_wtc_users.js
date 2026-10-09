require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

async function run() {
  const dump = fs.readFileSync('sql/2026-10-07_inmuebles_licencia_nrolocal.sql', 'utf8');
  const userLines = dump.split('\n').filter(l => l.startsWith('INSERT INTO `users`'));
  
  let wtcUsers = [];
  userLines.forEach(line => {
    const match = line.match(/\((.*?)\)/g);
    if (match) {
      match.forEach(m => {
        if (m.includes('J-312070412') || m.includes('WORLD TRADE CENTER')) {
           wtcUsers.push(m);
        }
      });
    }
  });
  
  console.log(`Encontrados ${wtcUsers.length} usuarios WTC en el dump:`);
  wtcUsers.forEach(u => console.log(u.substring(0, 150) + '...'));
}
run();
