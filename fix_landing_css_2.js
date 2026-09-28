const fs = require('fs');
const file = 'src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove invert class
content = content.replace('className="footer-logo invert"', 'className="footer-logo"');

// Fix spacing in footer-logos
const cssTarget = `        .footer-logos {
          flex: 1; background: transparent; padding: 20px 40px;
          display: flex; align-items: center; justify-content: center; gap: 40px; flex-wrap: wrap;
        }`;

const cssReplacement = `        .footer-logos {
          flex: 1; background: transparent; padding: 20px 40px;
          display: flex; align-items: center; justify-content: space-around; gap: 30px; flex-wrap: wrap;
        }`;

content = content.replace(cssTarget, cssReplacement);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed spacing and global_rec");
