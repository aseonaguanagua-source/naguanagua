'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'contribuyente' | 'funcionario'>('contribuyente');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar menú desplegable al hacer clic fuera del contenedor
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Redirigir a la ventana de autenticación del rol seleccionado asegurando solicitud limpia de credenciales
  const handleSelectRole = (targetUrl: string) => {
    try {
      localStorage.removeItem('admin_user_data');
      localStorage.removeItem('adminUser');
      localStorage.removeItem('adminLetra');
      localStorage.removeItem('admin_auth_andministrador');
      localStorage.removeItem('operador_censo_auth');
      localStorage.removeItem('operador_user_data');
      sessionStorage.clear();
    } catch {}
    router.push(targetUrl);
  };

  const ROLES_FUNCIONARIO = [
    {
      id: 'admin',
      label: 'Administrador / Sistema',
      targetUrl: '/admin?puesto=dzara',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h20" />
          <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
          <path d="m7 21 5-5 5 5" />
        </svg>
      )
    },
    {
      id: 'cajero',
      label: 'Cajero',
      targetUrl: '/admin/caja?puesto=cajero',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="12" x="2" y="6" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      )
    },
    {
      id: 'presidencia',
      label: 'Presidencia Ejecutiva',
      targetUrl: '/presidencia/login',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" x2="18" y1="20" y2="10" />
          <line x1="12" x2="12" y1="20" y2="4" />
          <line x1="6" x2="6" y1="20" y2="14" />
        </svg>
      )
    },
    {
      id: 'cobromovil',
      label: 'Cobro Móvil',
      targetUrl: '/operador/login?modulo=cobromovil',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
          <path d="M12 18h.01" />
        </svg>
      )
    },
    {
      id: 'censo',
      label: 'Operador de Censo',
      targetUrl: '/operador/login?modulo=censo',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    }
  ];

  return (
    <>
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
          padding: 16px 44px 16px 40px;
          flex: 0 0 54%;
          display: flex; align-items: center;
          clip-path: polygon(0 0, 92% 0, 100% 100%, 0 100%);
        }
        .header-accent { width: 4px; height: 42px; background: linear-gradient(180deg,#B8CD29,#5DB130); border-radius: 4px; margin-right: 16px; flex-shrink: 0; }
        .header-title { color: #fff; font-weight: 800; line-height: 1.15; text-transform: uppercase; font-size: clamp(15px, 1.8vw, 24px); }
        .header-right {
          flex: 1; background: #fff;
          display: flex; align-items: center; justify-content: space-around;
          padding: 10px 32px; gap: 24px;
        }
        .header-logo {
          max-height: 52px; width: auto; object-fit: contain; display: block;
          transition: transform 0.2s ease;
        }
        .header-logo:hover {
          transform: scale(1.04);
        }
        .header-divider-v {
          width: 1px; height: 38px; background: #cbd5e1; flex-shrink: 0;
        }

        /* ── CENTER ── */
        .center {
          position: relative; z-index: 20;
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 52px 40px 60px;
        }
        .section-title {
          text-align: center; margin-bottom: 30px;
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

        /* ── TOGGLE ── */
        .toggle-container {
          display: flex; background: rgba(15,50,35,.6); border-radius: 40px; padding: 6px;
          border: 1px solid rgba(184,205,41,.3); margin-bottom: 40px;
          box-shadow: 0 8px 32px rgba(0,0,0,.4);
          backdrop-filter: blur(10px);
        }
        .toggle-btn {
          padding: 12px 32px; border-radius: 34px; font-weight: 600; font-size: 16px;
          cursor: pointer; transition: all 0.3s ease; border: none; background: transparent;
          color: rgba(255,255,255,.6); font-family: Poppins, sans-serif;
        }
        .toggle-btn.active {
          background: linear-gradient(135deg, #B8CD29 0%, #5DB130 100%);
          color: #06120e; box-shadow: 0 4px 16px rgba(184,205,41,.4);
        }

        /* ── MAIN CARD ── */
        .main-card-container {
          width: 100%; max-width: 480px;
        }
        
        .card {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          text-decoration: none; border-radius: 24px; padding: 50px 32px 38px;
          background: linear-gradient(155deg, rgba(22, 60, 42, 0.95) 0%, rgba(12, 42, 28, 0.98) 100%);
          border: 1px solid rgba(184, 205, 41, 0.38);
          box-shadow: 0 0 0 1px rgba(184, 205, 41, 0.15), 0 16px 45px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(20px);
          transition: all .3s ease;
          position: relative; width: 100%;
        }
        .card.clickable:hover {
          transform: translateY(-4px);
          box-shadow: 0 0 0 1px rgba(184,205,41,.65), 0 20px 50px rgba(0,0,0,.6), 0 0 40px rgba(184,205,41,.15);
        }
        .icon-bubble {
          position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
          width: 80px; height: 80px; border-radius: 50%;
          background: linear-gradient(135deg, rgba(184,205,41,.28) 0%, rgba(93,177,48,.22) 100%);
          border: 2px solid rgba(184,205,41,.7);
          box-shadow: 0 0 24px rgba(184,205,41,.35), inset 0 1px 0 rgba(255,255,255,.1);
          display: flex; align-items: center; justify-content: center;
        }
        .card-title { margin: 10px 0 14px; color: #fff; font-size: 26px; line-height: 1.3; }
        .card-desc { margin: 0 0 28px 0; color: rgba(200,230,200,.75); font-size: 15px; line-height: 1.6; text-align: center; font-weight: 400; }

        .btn-enter {
          background: linear-gradient(135deg, #B8CD29 0%, #84cc16 100%);
          color: #06120e; padding: 14px 32px; border-radius: 30px;
          font-weight: 700; font-size: 16px; text-decoration: none;
          box-shadow: 0 4px 16px rgba(184,205,41,.3);
          transition: all 0.2s ease; border: none; cursor: pointer;
          width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: Poppins, sans-serif;
        }
        .btn-enter:hover {
          box-shadow: 0 6px 22px rgba(184,205,41,.5);
          transform: scale(1.02);
        }

        /* ── DROPDOWN FUNCIONARIO (IMAGE 1 FAITHFUL REPLICA) ── */
        .func-dropdown-container {
          position: relative; width: 100%;
        }
        .func-dropdown-menu {
          width: 100%; margin-top: 18px;
          background: rgba(8, 26, 17, 0.98);
          border: 1px solid rgba(184, 205, 41, 0.32);
          border-radius: 18px; overflow: hidden;
          box-shadow: 0 16px 40px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05);
          animation: dropdownAnim 0.22s ease forwards;
          display: flex; flex-direction: column;
        }
        @keyframes dropdownAnim {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dropdown-item {
          padding: 15px 22px; color: #f1f5f9; text-decoration: none;
          display: flex; align-items: center; gap: 14px;
          border: none; background: transparent; cursor: pointer;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          transition: all 0.2s ease; font-weight: 500; font-size: 15px;
          text-align: left; width: 100%; font-family: Poppins, sans-serif;
        }
        .dropdown-item:last-child { border-bottom: none; }
        .dropdown-item:hover { 
          background: rgba(184,205,41,0.12);
          color: #B8CD29;
          padding-left: 26px;
        }
        .dropdown-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(184,205,41,0.15); display: flex; align-items: center; justify-content: center;
          color: #B8CD29; flex-shrink: 0; border: 1px solid rgba(184,205,41,0.25);
          transition: transform 0.2s ease;
        }
        .dropdown-item:hover .dropdown-icon {
          transform: scale(1.08);
          background: rgba(184,205,41,0.25);
        }

        /* ── FOOTER ── */
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
          flex: 1; background: rgba(255,255,255,.98); padding: 14px 36px;
          display: flex; align-items: center; justify-content: space-around; gap: 24px; flex-wrap: wrap;
        }
        .footer-logo { max-height: 64px; width: auto; object-fit: contain; }
        .footer-logo.rounded { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .footer-divider { width: 1px; height: 46px; background: #e2e8f0; flex-shrink: 0; }

        /* ── RESPONSIVE MOBILE ── */
        @media (max-width: 768px) {
          .header { flex-direction: column; }
          .header-left {
            flex: none; width: 100%;
            clip-path: none;
            padding: 18px 20px;
            justify-content: center; text-align: center;
          }
          .header-accent { display: none; }
          .header-title { font-size: clamp(16px, 5vw, 22px); text-align: center; }
          .header-right { padding: 12px 16px; justify-content: center; gap: 16px; }
          .header-logo { max-height: 40px; }
          .header-divider-v { display: block; height: 28px; }

          .center { padding: 36px 20px 44px; }
          .section-title { margin-bottom: 30px; }

          .card { padding: 46px 20px 30px; }
          .card-title { font-size: 22px; }

          .footer { flex-direction: column; }
          .footer-iamec { min-width: unset; width: 100%; border-right: none; border-bottom: 1px solid rgba(184,205,41,.25); padding: 20px; }
          .iamec-logo { height: 64px; }
          .footer-logos { padding: 16px; justify-content: center; gap: 16px; }
          .footer-logo { max-height: 48px; }
          .footer-divider { display: none; }
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
            <img 
              src="/logos/ELIZABETH.png" 
              alt="Elizabeth Niño - Alcaldesa de Naguanagua" 
              className="header-logo" 
              style={{ maxHeight: 52 }} 
            />
            <div className="header-divider-v" />
            <img 
              src="/logos/LACAVA.png" 
              alt="Lacava Gobernador" 
              className="header-logo" 
              style={{ maxHeight: 50 }} 
            />
          </div>
        </div>

        {/* ══ CENTER ══ */}
        <div className="center">
          <div className="section-title">
            <h2 className="glowing-title">Bienvenido</h2>
            <p className="section-subtitle">Seleccione su perfil para acceder al sistema.</p>
            <div className="title-line" />
          </div>

          <div className="toggle-container">
            <button 
              className={`toggle-btn ${activeTab === 'contribuyente' ? 'active' : ''}`}
              onClick={() => setActiveTab('contribuyente')}
            >
              Soy Contribuyente
            </button>
            <button 
              className={`toggle-btn ${activeTab === 'funcionario' ? 'active' : ''}`}
              onClick={() => setActiveTab('funcionario')}
            >
              Soy Funcionario
            </button>
          </div>

          <div className="main-card-container">
            {activeTab === 'contribuyente' && (
              <Link href="/portal" className="card clickable">
                <div className="icon-bubble">
                  <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#B8CD29" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </div>
                <h3 className="card-title"><b style={{ fontWeight:800 }}>Soy</b>{' '}<span style={{ fontWeight:400 }}>Contribuyente</span></h3>
                <p className="card-desc">Paga tus servicios, tramita solvencias y reporta incidencias de manera rápida y segura en Naguanagua.</p>
                <div className="btn-enter">
                  Ingresar al Portal
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </Link>
            )}

            {activeTab === 'funcionario' && (
              <div className="card func-dropdown-container" ref={dropdownRef}>
                <div className="icon-bubble">
                  {/* Icono Templo Cívico Municipal exactamente como la primera imagen */}
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#B8CD29" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" x2="21" y1="22" y2="22" />
                    <line x1="6" x2="6" y1="18" y2="11" />
                    <line x1="10" x2="10" y1="18" y2="11" />
                    <line x1="14" x2="14" y1="18" y2="11" />
                    <line x1="18" x2="18" y1="18" y2="11" />
                    <polygon points="12 2 20 7 4 7" />
                    <line x1="2" x2="22" y1="7" y2="7" />
                    <line x1="2" x2="22" y1="18" y2="18" />
                  </svg>
                </div>
                <h3 className="card-title">
                  <b style={{ fontWeight: 800 }}>Soy</b>{' '}<span style={{ fontWeight: 400 }}>Funcionario</span>
                </h3>
                <p className="card-desc">
                  Acceso al sistema administrativo interno. Por favor, seleccione su rol operativo.
                </p>

                <button
                  type="button"
                  className="btn-enter"
                  onClick={() => setShowDropdown(!showDropdown)}
                >
                  <span style={{ flex: 1, textAlign: 'center' }}>Seleccionar Tipo de Funcionario</span>
                  {showDropdown ? <ChevronUp size={22} strokeWidth={2.5} /> : <ChevronDown size={22} strokeWidth={2.5} />}
                </button>

                {showDropdown && (
                  <div className="func-dropdown-menu">
                    {ROLES_FUNCIONARIO.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleSelectRole(role.targetUrl)}
                        className="dropdown-item"
                      >
                        <div className="dropdown-icon">
                          {role.icon}
                        </div>
                        <span>{role.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ FOOTER (IAMEC, Global Rec y Naguanagua Te Quiero) ══ */}
        <div className="footer">
          <div className="footer-iamec">
            <div className="footer-iamec-glow" />
            <img src="/logos/IAMEC.png" alt="IAMEC Naguanagua" className="iamec-logo" />
          </div>
          <div className="footer-logos">
            <img src="/logos/logo_global_rec.png" alt="Global Rec Collection System" className="footer-logo" style={{ maxHeight: 62 }} />
            <div className="footer-divider" />
            <img src="/logos/NAGUANAGUATEQUIERO.png" alt="Naguanagua Te Quiero" className="footer-logo" style={{ maxHeight: 60 }} />
          </div>
        </div>

      </div>
    </>
  );
}
