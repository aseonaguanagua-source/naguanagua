const fs = require('fs');
const txt = fs.readFileSync('c:/Users/david/Desktop/tucacasdoc/convenio.txt', 'utf8');
const match = txt.match(/data:image\/([a-zA-Z]*);base64,([^"]+)/);
if(match) {
  const buffer = Buffer.from(match[2], 'base64');
  fs.writeFileSync('c:/Users/david/.gemini/antigravity-ide/brain/ed95f456-9b4f-4d09-8a5e-223180cbecfb/convenio_img.' + match[1], buffer);
  console.log('Image saved');
} else {
  console.log('No image found');
}
