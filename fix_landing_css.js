const fs = require('fs');
const file = 'src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const cssTarget = `        /* ── FOOTER ── */
        .footer { position: relative; z-index: 10; flex-shrink: 0; display: flex; border-top: 3px solid rgba(184,205,41,.5); }
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
          display: flex; align-items: center; justify-content: space-evenly; gap: 20px; flex-wrap: wrap;
        }
        .footer-logo { height: 60px; width: auto; object-fit: contain; }
        .footer-divider { width: 1px; height: 48px; background: #dde; flex-shrink: 0; }`;

const cssReplacement = `        /* ── FOOTER ── */
        .footer { 
          position: relative; z-index: 10; flex-shrink: 0; display: flex; 
          border-top: 3px solid rgba(184,205,41,.5); 
          background: linear-gradient(135deg, #081a10 0%, #0f2d1e 100%); 
        }
        .footer-iamec {
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
          flex: 1; background: transparent; padding: 20px 40px;
          display: flex; align-items: center; justify-content: center; gap: 40px; flex-wrap: wrap;
        }
        .footer-logo { height: 60px; width: auto; object-fit: contain; }
        .footer-logo.invert { filter: brightness(0) invert(1); opacity: 0.9; }
        .footer-logo.screen { mix-blend-mode: screen; filter: drop-shadow(0 0 10px rgba(255,255,255,0.1)); }
        .footer-divider { width: 1px; height: 48px; background: rgba(255,255,255,0.15); flex-shrink: 0; }`;

content = content.replace(cssTarget, cssReplacement);

const htmlTarget = `<div className="footer-logos">
            <img src={logos.global_rec} alt="Global Rec" className="footer-logo" />
            <div className="footer-divider" />
            <img src={logos.instituto} alt="Instituto" className="footer-logo" style={{borderRadius: "8px"}} />
            <div className="footer-divider" />
            
            <div className="footer-divider" />
            
          </div>`;

const htmlReplacement = `<div className="footer-logos">
            <img src={logos.global_rec} alt="Global Rec" className="footer-logo invert" />
            <div className="footer-divider" />
            <img src={logos.instituto} alt="Instituto" className="footer-logo screen" />
          </div>`;

content = content.replace(htmlTarget, htmlReplacement);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed footer styling");
