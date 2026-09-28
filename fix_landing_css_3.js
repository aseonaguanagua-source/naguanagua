const fs = require('fs');
const file = 'src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix the CSS classes
const cssTarget = `        /* ── FOOTER ── */
        .footer { 
          position: relative; z-index: 10; flex-shrink: 0; display: flex; 
          border-top: 3px solid rgba(184,205,41,.5); 
          background: linear-gradient(135deg, #081a10 0%, #0f2d1e 100%); 
        }
        .footer-iamec {
          padding: 24px 48px;
          flex: 0 0 auto; min-width: 240px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          
          position: relative; overflow: hidden;
        }
        .footer-iamec-glow {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, rgba(184,205,41,.12) 0%, transparent 70%);
        }
        .iamec-logo {
          height: 80px; width: auto; object-fit: contain; position: relative; z-index: 1;
          filter: drop-shadow(0 0 14px rgba(184,205,41,.5)) brightness(1.15);
        }
        .footer-logos {
          flex: 1; background: transparent; padding: 20px 40px;
          display: flex; align-items: center; justify-content: space-around; gap: 30px; flex-wrap: wrap;
        }
        .footer-logo { height: 60px; width: auto; object-fit: contain; }
        .footer-logo.screen { mix-blend-mode: screen; filter: drop-shadow(0 0 10px rgba(255,255,255,0.1)); }
        .footer-divider { width: 1px; height: 48px; background: rgba(255,255,255,0.15); flex-shrink: 0; }`;

const cssReplacement = `        /* ── FOOTER ── */
        .footer { 
          position: relative; z-index: 10; flex-shrink: 0; display: flex; 
          border-top: 3px solid rgba(184,205,41,.5); 
        }
        .footer-iamec {
          background: linear-gradient(135deg, #081a10 0%, #0f2d1e 100%);
          padding: 24px 48px;
          flex: 0 0 auto; min-width: 240px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border-right: 1px solid rgba(184,205,41,.25);
          position: relative; overflow: hidden;
        }
        .footer-iamec-glow {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, rgba(184,205,41,.12) 0%, transparent 70%);
        }
        .iamec-logo {
          height: 80px; width: auto; object-fit: contain; position: relative; z-index: 1;
          filter: drop-shadow(0 0 14px rgba(184,205,41,.5)) brightness(1.15);
        }
        .footer-logos {
          flex: 1; background: rgba(255,255,255,.97); padding: 20px 40px;
          display: flex; align-items: center; justify-content: center; gap: 60px; flex-wrap: wrap;
        }
        .footer-logo { height: 85px; width: auto; object-fit: contain; }
        .footer-logo.rounded { border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .footer-divider { width: 1px; height: 60px; background: #dde; flex-shrink: 0; }`;

content = content.replace(cssTarget, cssReplacement);

const htmlTarget = `<div className="footer-logos">
            <img src={logos.global_rec} alt="Global Rec" className="footer-logo" />
            <div className="footer-divider" />
            <img src={logos.instituto} alt="Instituto" className="footer-logo screen" />
          </div>`;

const htmlReplacement = `<div className="footer-logos">
            <img src={logos.global_rec} alt="Global Rec" className="footer-logo" />
            <div className="footer-divider" />
            <img src={logos.instituto} alt="Instituto" className="footer-logo rounded" />
          </div>`;

content = content.replace(htmlTarget, htmlReplacement);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed landing css 3");
