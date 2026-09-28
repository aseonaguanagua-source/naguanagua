const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      if (content.includes("logos.iamec, 'JPEG'")) {
        content = content.replace(/logos\.iamec,\s*'JPEG'/g, "logos.iamec, 'PNG'");
        changed = true;
      }
      if (content.includes("logos.alcaldia, 'JPEG'")) {
        content = content.replace(/logos\.alcaldia,\s*'JPEG'/g, "logos.alcaldia, 'PNG'");
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed JPEG to PNG in', fullPath);
      }
    }
  }
}

processDir('./src');
