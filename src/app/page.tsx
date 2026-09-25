'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { logos } from '@/lib/logosBase64';

type Mode = 'all' | 'contribuyente-only' | 'workers-only';

export default function Home() {
  const [mode, setMode] = useState<Mode>('all');

  useEffect(() => {
    const host = window.location.hostname;
    if (host === 'aseonaguanaguaad.globalrecca.com') setMode('workers-only');
    else if (host === 'aseonaguanagua.globalrecca.com') setMode('contribuyente-only');
  }, []);

  const showContribuyente = mode === 'all' || mode === 'contribuyente-only';
  const showWorkers       = mode === 'all' || mode === 'workers-only';

  const DotRow = ({ label }: { label: string }) => (
    <div style={{ display:'flex', alignItems:'center', gap:6, color:'#c8dc3a', fontWeight:600, fontSize:14, marginTop:'auto', paddingTop:20 }}>
      {label}
      <span style={{ display:'flex', alignItems:'center', gap:3, marginLeft:4 }}>
        {[1,.75,.5,.3].map((o,i) => <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#c8dc3a', opacity:o, display:'inline-block' }} />)}
        <span style={{ fontSize:16, lineHeight:1, color:'#c8dc3a', marginLeft:2, fontWeight:900 }}>✦</span>
      </span>
    </div>
  );

  return (
    <>
      {/* ── Responsive styles ─────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }

        .landing-wrap {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          font-family: Poppins, sans-serif;
          overflow-x: hidden;
        }

        /* ── BG grid ── */
        .bg-fixed {
          position: fixed; inset: 0; z-index: 0;
          background: linear-gradient(135deg, #06120e 0%, #0d2a1e 35%, #0a1f16 65%, #081810 100%);
        }
        .bg-grid {
          position: absolute; inset: 0; opacity: 0.07;
          background-image: linear-gradient(rgba(184,205,41,.8) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(184,205,41,.8) 1px, transparent 1px);
          background-size: 60px 60px;
        }
        .bg-blob1 {
          position: absolute; top: -10%; left: 5%;
          width: 500px; height: 500px; border-radius: 50%;
          background: radial-gradient(circle, rgba(93,177,48,.12) 0%, transparent 70%);
          filter: blur(40px);
        }
        .bg-blob2 {
          position: absolute; bottom: -5%; right: 10%;
          width: 400px; height: 400px; border-radius: 50%;
          background: radial-gradient(circle, rgba(184,205,41,.1) 0%, transparent 70%);
          filter: blur(50px);
        }

        /* ── HEADER ── */
        .header {
          position: relative; z-index: 10; flex-shrink: 0;
          display: flex; align-items: stretch;
          border-bottom: 2px solid rgba(184,205,41,.5);
        }
        .header-left {
          background: linear-gradient(110deg, rgba(10,30,20,.97) 0%, rgba(15,55,35,.95) 100%);
          padding: 28px 48px 28px 44px;
          flex: 0 0 55%;
          display: flex; align-items: center;
          clip-path: polygon(0 0, 92% 0, 100% 100%, 0 100%);
        }
        .header-accent { width: 4px; height: 50px; background: linear-gradient(180deg,#B8CD29,#5DB130); border-radius: 4px; margin-right: 16px; flex-shrink: 0; }
        .header-title { color: #fff; font-weight: 800; line-height: 1.15; text-transform: uppercase; font-size: clamp(18px, 2.5vw, 36px); }
        .header-right {
          flex: 1; background: #fff;
          display: flex; align-items: center; justify-content: center;
          padding: 20px 32px;
        }
        .alcaldia-logo { height: 130px; width: auto; object-fit: contain; display: block; }

        /* ── CENTER ── */
        .center {
          position: relative; z-index: 5;
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 52px 40px 60px;
        }
        .section-title {
          text-align: center; margin-bottom: 52px;
        }
        .glowing-title {
          margin: 0; font-size: clamp(32px, 5vw, 56px); font-weight: 800;
          background: linear-gradient(135deg, #B8CD29 0%, #5DB130 50%, #B8CD29 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 0 22px rgba(184,205,41,.45));
          letter-spacing: -0.5px;
        }
        .section-subtitle { margin: 10px 0 0; color: rgba(200,220,180,.7); font-size: 15px; font-weight: 400; letter-spacing: .4px; }
        .title-line { width: 60px; height: 2px; background: linear-gradient(90deg,transparent,#B8CD29,transparent); margin: 14px auto 0; }

        /* ── CARDS ── */
        .cards-grid {
          display: grid;
          gap: 28px;
          width: 100%; max-width: 1080px; justify-content: center;
        }
        .cards-grid-4 { grid-template-columns: repeat(4, minmax(200px, 280px)); }
        .cards-grid-3 { grid-template-columns: repeat(3, minmax(240px, 340px)); }
        .cards-grid-2 { grid-template-columns: repeat(2, minmax(260px, 380px)); }
        .cards-grid-1 { grid-template-columns: minmax(300px, 420px); }

        .card {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          text-decoration: none; border-radius: 20px; padding: 60px 28px 32px;
          background: linear-gradient(155deg, rgba(30,80,55,.9) 0%, rgba(15,50,35,.95) 100%);
          border: 1px solid rgba(184,205,41,.2);
          box-shadow: 0 0 0 1px rgba(184,205,41,.2), 0 8px 32px rgba(0,0,0,.4);
          backdrop-filter: blur(20px);
          transition: all .3s ease;
          position: relative;
        }
        .card:hover {
          transform: translateY(-8px);
          box-shadow: 0 0 0 1px rgba(184,205,41,.65), 0 24px 60px rgba(0,0,0,.5), 0 0 40px rgba(184,205,41,.15);
          border-color: rgba(184,205,41,.7);
        }
        .icon-bubble {
          position: absolute; top: -36px;
          width: 72px; height: 72px; border-radius: 50%;
          background: linear-gradient(135deg, rgba(184,205,41,.28) 0%, rgba(93,177,48,.22) 100%);
          border: 2px solid rgba(184,205,41,.7);
          box-shadow: 0 0 24px rgba(184,205,41,.35), inset 0 1px 0 rgba(255,255,255,.1);
          display: flex; align-items: center; justify-content: center;
        }
        .card-title { margin: 0 0 12px; color: #fff; font-size: 19px; line-height: 1.3; }
        .card-desc { margin: 0; color: rgba(200,230,200,.65); font-size: 13px; line-height: 1.85; text-align: justify; font-weight: 400; }

        /* ── FOOTER ── */
        .footer { position: relative; z-index: 10; flex-shrink: 0; display: flex; border-top: 3px solid rgba(184,205,41,.5); }
        .footer-isma {
          background: linear-gradient(135deg, #081a10 0%, #0f2d1e 100%);
          padding: 24px 48px;
          flex: 0 0 auto; min-width: 240px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border-right: 1px solid rgba(184,205,41,.25);
          position: relative; overflow: hidden;
        }
        .footer-isma-glow {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, rgba(184,205,41,.12) 0%, transparent 70%);
        }
        .isma-logo {
          height: 80px; width: auto; object-fit: contain; position: relative; z-index: 1;
          filter: drop-shadow(0 0 14px rgba(184,205,41,.5)) brightness(1.15);
        }
        .footer-logos {
          flex: 1; background: rgba(255,255,255,.97); padding: 20px 40px;
          display: flex; align-items: center; justify-content: space-evenly; gap: 20px; flex-wrap: wrap;
        }
        .footer-logo { height: 60px; width: auto; object-fit: contain; }
        .footer-divider { width: 1px; height: 48px; background: #dde; flex-shrink: 0; }

        /* ── RESPONSIVE MOBILE ── */
        @media (max-width: 768px) {
          .header { flex-direction: column; }
          .header-left {
            flex: none; width: 100%;
            clip-path: none;
            padding: 24px 24px 20px;
            justify-content: center; text-align: center;
          }
          .header-accent { display: none; }
          .header-title { font-size: clamp(20px, 6vw, 28px); text-align: center; }
          .header-right { padding: 16px 24px; }
          .alcaldia-logo { height: 90px; }

          .center { padding: 36px 20px 44px; }
          .section-title { margin-bottom: 40px; }

          .cards-grid-4,
          .cards-grid-3,
          .cards-grid-2 { grid-template-columns: 1fr; max-width: 420px; }
          .cards-grid-1 { grid-template-columns: 1fr; max-width: 420px; }

          .card { padding: 56px 20px 28px; }

          .footer { flex-direction: column; }
          .footer-isma { min-width: unset; width: 100%; border-right: none; border-bottom: 1px solid rgba(184,205,41,.25); padding: 20px; }
          .isma-logo { height: 64px; }
          .footer-logos { padding: 16px 24px; justify-content: center; gap: 16px; }
          .footer-logo { height: 46px; }
          .footer-divider { display: none; }
        }

        @media (max-width: 480px) {
          .glowing-title { font-size: 30px; }
          .header-title { font-size: 18px; }
        }
      `}</style>

      <div className="landing-wrap">

        {/* BG */}
        <div className="bg-fixed">
          <div className="bg-grid" />
          <div className="bg-blob1" />
          <div className="bg-blob2" />
        </div>

        {/* ══ HEADER ══ */}
        <div className="header">
          <div className="header-left">
            <div className="header-accent" />
            <div>
              {['SISTEMA INTEGRAL','DE RECAUDACIÓN','TRIBUTARIA MUNICIPAL'].map((line,i) => (
                <div key={i} className="header-title">{line}</div>
              ))}
            </div>
          </div>
          <div className="header-right">
            <img src={logos.alcaldia} alt="Alcaldía del Municipio Naguanagua" className="alcaldia-logo" />
          </div>
        </div>

        {/* ══ CENTER ══ */}
        <div className="center">
          <div className="section-title">
            <h2 className="glowing-title">Global Rec</h2>
            <p className="section-subtitle">Seleccione su módulo para acceder al sistema.</p>
            <div className="title-line" />
          </div>

          <div className={`cards-grid ${showContribuyente && showWorkers ? 'cards-grid-4' : showWorkers ? 'cards-grid-3' : 'cards-grid-1'}`}>

            {showContribuyente && (
              <Link href="/portal" className="card">
                <div className="icon-bubble">
                  <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="#B8CD29" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </div>
                <h3 className="card-title"><b style={{ fontWeight:800 }}>Soy</b>{' '}<span style={{ fontWeight:400 }}>Contribuyente</span></h3>
                <p className="card-desc">Paga tus servicios, tramita solvencias y reporta incidencias de manera rápida y segura.</p>
                <DotRow label="Ingresar al portal" />
              </Link>
            )}

            {showWorkers && (
              <Link href="/admin" className="card">
                <div className="icon-bubble">
                  <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="#B8CD29" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                  </svg>
                </div>
                <h3 className="card-title"><b style={{ fontWeight:800 }}>Soy</b>{' '}<span style={{ fontWeight:400 }}>Funcionario</span></h3>
                <p className="card-desc">Acceso el sistema administrativo para gestión de recaudación y reportes de aseo.</p>
                <DotRow label="Acceder al Sistema" />
              </Link>
            )}

            {showWorkers && (
              <Link href="/cobro-movil" className="card">
                <div className="icon-bubble">
                  <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="#B8CD29" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3h3" />
                  </svg>
                </div>
                <h3 className="card-title"><b style={{ fontWeight:800 }}>Cobrador</b>{' '}<span style={{ fontWeight:400 }}>Móvil</span></h3>
                <p className="card-desc">Módulo móvil para cobro en campo. Busca contribuyentes, revisa deudas y procesa pagos.</p>
                <DotRow label="Ingresar Móvil" />
              </Link>
            )}

            {showWorkers && (
              <Link href="/operador/login" className="card">
                <div className="icon-bubble">
                  <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="#B8CD29" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <h3 className="card-title"><b style={{ fontWeight:800 }}>Operador</b>{' '}<span style={{ fontWeight:400 }}>de Censo</span></h3>
                <p className="card-desc">Módulo móvil exclusivo para trabajadores en jornada de empadronamiento de calle.</p>
                <DotRow label="Ingresar Móvil" />
              </Link>
            )}

            {showWorkers && (
              <Link href="/presidencia/login" className="card">
                <div className="icon-bubble">
                  <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="#B8CD29" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <h3 className="card-title"><b style={{ fontWeight:800 }}>Presidencia</b>{' '}<span style={{ fontWeight:400 }}>Ejecutiva</span></h3>
                <p className="card-desc">Panel ejecutivo en tiempo real. Consulta la recaudación del instituto desde cualquier dispositivo.</p>
                <DotRow label="Ingresar" />
              </Link>
            )}

          </div>
        </div>

        {/* ══ FOOTER ══ */}
        <div className="footer">
          <div className="footer-isma">
            <div className="footer-isma-glow" />
            <img src={logos.isma} alt="ISMA Naguanagua" className="isma-logo" />
          </div>
          <div className="footer-logos">
            <img src={logos.global_rec}   alt="Global Rec"   className="footer-logo" />
            <div className="footer-divider" />
            <img src={logos.global_green} alt="Alcaldía de Naguanagua" className="footer-logo" />
            <div className="footer-divider" />
            <img src={logos.basura_cero}  alt="Basura Cero"  className="footer-logo" />
          </div>
        </div>

      </div>
    </>
  );
}
