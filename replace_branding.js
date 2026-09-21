const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    content = content.replace(/Global Green/g, 'Alcaldía de Naguanagua');
    content = content.replace(/Tucacas/g, 'Naguanagua');
    content = content.replace(/Municipio Silva/g, 'Municipio Naguanagua');
    content = content.replace(/ISMA/g, 'Instituto de Aseo');
    content = content.replace(/J-29786006-1/g, 'J-29628647-7');
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated', filePath);
    }
}

function walkDir(dir) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath);
        } else if (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.json')) {
            replaceInFile(dirPath);
        }
    });
}

walkDir('./src');
walkDir('./public');
