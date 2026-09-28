const fs = require('fs');

const file = 'src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/<img src=\{logos\.basura_cero\}.*\/>/g, '');
content = content.replace(/<img src=\{logos\.global_green\}.*\/>/g, '');

content = content.replace('<img src={logos.global_rec}   alt="Global Rec"   className="footer-logo" />', 
  '<img src={logos.global_rec} alt="Global Rec" className="footer-logo" />\n            <div className="footer-divider" />\n            <img src={logos.instituto} alt="Instituto" className="footer-logo" style={{borderRadius: "8px"}} />');
  
fs.writeFileSync(file, content, 'utf8');
console.log("Fixed landing logos");
