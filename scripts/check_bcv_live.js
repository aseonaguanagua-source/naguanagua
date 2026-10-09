require('dotenv').config({ path: '.env.local' });
const { getTasaBCV } = require('./src/services/bcv.ts');

async function run() {
  const t = await getTasaBCV(false);
  console.log(t);
}
run();
