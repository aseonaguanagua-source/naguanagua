const fs = require('fs');
const files = fs.readdirSync('scratch');
for (const f of files) {
  if (f.includes('sambil') || f.includes('URB016119')) {
    console.log("Found backup file:", f);
  }
}
