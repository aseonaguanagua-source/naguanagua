const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('ordenanza.pdf');

pdf(dataBuffer).then(function(data) {
    const text = data.text;
    const lines = text.split('\n');
    let output = [];
    let capture = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('agencia de festejos')) {
            capture = true;
        }
        if (capture) {
            output.push(lines[i]);
        }
    }
    fs.writeFileSync('extracted_activities.txt', output.join('\n'));
    console.log("Extracted!");
}).catch(console.error);
