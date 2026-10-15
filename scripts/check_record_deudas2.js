const fs = require('fs');

async function run() {
    // try to find URB001833 in any JSON file in documentos
    const dir = '/Users/davidzara/Documents/naguanagua_zero/documentos';
    const files = fs.readdirSync(dir);
    for (let f of files) {
        if (f.endsWith('.json')) {
            const data = fs.readFileSync(`${dir}/${f}`, 'utf8');
            if (data.includes('URB001833') || data.includes('URB005955')) {
                console.log(`Found in ${f}`);
            }
        }
    }
}
run();
