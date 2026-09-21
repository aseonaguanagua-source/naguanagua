const fs = require('fs');
const xml = fs.readFileSync('C:\\Users\\david\\Desktop\\tucacasdoc\\AJUSTES2_unzipped\\word\\document.xml', 'utf8');
const text = xml.replace(/<w:p [^>]*>/g, '\n').replace(/<[^>]+>/g, '');
console.log(text);
