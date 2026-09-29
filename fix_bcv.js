const fs = require('fs');

let file = fs.readFileSync('src/app/api/bcv/route.ts', 'utf8');

file = file.replace(
  "export async function GET(request: Request) {",
  "export async function GET(request: Request) {\n  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';"
);

fs.writeFileSync('src/app/api/bcv/route.ts', file, 'utf8');
console.log("Fixed BCV route TLS");
