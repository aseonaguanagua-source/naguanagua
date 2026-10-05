'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ShieldCheck, User, Lock, Eye, EyeOff, AlertCircle, ChevronDown } from 'lucide-react';
import { logos } from '@/lib/logosBase64';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

const PUESTOS_PLANTILLA = [
  { puesto: 'Administrador', usuario: 'dzara', defaultClave: 'dzara', destino: '/admin', rol: 'Administrador' },
  { puesto: 'Taquilla / Cajero Principal', usuario: 'cajero', defaultClave: 'cajero123', destino: '/admin/caja', rol: 'Taquilla / Operador' },
  { puesto: 'Supervisor de Operaciones', usuario: 'supervisor', defaultClave: 'supervisor123', destino: '/admin', rol: 'Supervisor' },
  { puesto: 'Operador de Censo / Catastro', usuario: 'censo', defaultClave: 'censo123', destino: '/operador', rol: 'Operador de Censo' },
  { puesto: 'Auditor Fiscal y Tributario', usuario: 'auditor', defaultClave: 'auditor123', destino: '/admin/auditoria', rol: 'Auditor' },
  { puesto: 'Atención al Contribuyente', usuario: 'taquilla', defaultClave: 'taquilla123', destino: '/admin/estado-cuenta', rol: 'Taquilla / Operador' },
  { puesto: 'Cobro Móvil / Campo', usuario: 'cobromovil', defaultClave: 'movil123', destino: '/cobro-movil', rol: 'Taquilla / Operador' },
];

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'contribuyente' | 'funcionario'>('contribuyente');
  const [selectedPuesto, setSelectedPuesto] = useState('cajero');
  const [usuarioInput, setUsuarioInput] = useState('cajero');
  const [claveInput, setClaveInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [trabajadoresDb, setTrabajadoresDb] = useState<any[]>([]);

  // Cargar trabajadores de la base de datos para complementar la lista
  useEffect(() => {
    const fetchTrabajadores = async () => {
      try {
        const { data } = await supabase
          .from('trabajadores')
          .select('id, nombre, usuario, rol, letra, estado')
          .eq('estado', 'Activo');
        if (data && data.length > 0) {
          setTrabajadoresDb(data);
        }
      } catch {}
    };
    fetchTrabajadores();
  }, []);

  const handleFuncionarioLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = (selectedPuesto === 'manual' ? usuarioInput : selectedPuesto).trim();
    const p = claveInput;

    if (!u || !p) {
      setLoginError('Por favor seleccione su puesto e ingrese su contraseña.');
      return;
    }

    setIsAuthenticating(true);
    setLoginError('');

    try {
      // 1. Maestro Administrador dzara
      if (u.toLowerCase() === 'dzara' && p === 'dzara') {
        const adminData = {
          usuario: 'dzara',
          nombre: 'David Zara',
          rol: 'Administrador',
          letra: 'DZ',
          permisos: {}
        };
        localStorage.setItem('admin_user_data', JSON.stringify(adminData));
        localStorage.setItem('adminUser', 'dzara');
        localStorage.setItem('adminLetra', 'DZ');
        localStorage.setItem('admin_auth_andministrador', 'true');
        await logAudit('Inicio de Jornada: David Zara (dzara)', { usuario: 'dzara', rol: 'Administrador' }, 'SESION', 'BAJA');
        router.push('/admin');
        return;
      }

      // 2. Consulta API autenticación
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        const workerData = {
          usuario: data.usuario,
          nombre: data.nombre || data.usuario,
          rol: data.rol || 'Operador',
          letra: data.letra || '',
          permisos: data.permisos || {}
        };
        localStorage.setItem('admin_user_data', JSON.stringify(workerData));
        localStorage.setItem('adminUser', data.usuario);
        localStorage.setItem('adminLetra', data.letra || '');
        localStorage.setItem('admin_auth_andministrador', 'true');

        if (data.rol === 'Operador de Censo' || data.usuario === 'censo') {
          localStorage.setItem('operador_censo_auth', data.usuario);
        }

        await logAudit(`Inicio de Jornada: ${workerData.nombre}`, { usuario: data.usuario, rol: data.rol }, 'SESION', 'BAJA');

        const matchPuesto = PUESTOS_PLANTILLA.find(x => x.usuario.toLowerCase() === u.toLowerCase());
        if (matchPuesto) {
          router.push(matchPuesto.destino);
        } else if (data.rol === 'Operador de Censo') {
          router.push('/operador');
        } else if (data.rol?.toLowerCase().includes('caja') || data.rol?.toLowerCase().includes('cajero')) {
          router.push('/admin/caja');
        } else {
          router.push('/admin');
        }
        return;
      }

      // Fallback preset local
      const matchPreset = PUESTOS_PLANTILLA.find(x => x.usuario.toLowerCase() === u.toLowerCase());
      if (matchPreset && matchPreset.defaultClave === p) {
        const workerData = {
          usuario: matchPreset.usuario,
          nombre: matchPreset.puesto,
          rol: matchPreset.rol,
          letra: matchPreset.usuario === 'cajero' ? 'A' : matchPreset.usuario.charAt(0).toUpperCase(),
          permisos: {}
        };
        localStorage.setItem('admin_user_data', JSON.stringify(workerData));
        localStorage.setItem('adminUser', workerData.usuario);
        localStorage.setItem('adminLetra', workerData.letra);
        localStorage.setItem('admin_auth_andministrador', 'true');
        if (matchPreset.rol === 'Operador de Censo') {
          localStorage.setItem('operador_censo_auth', workerData.usuario);
        }
        await logAudit(`Inicio de Jornada: ${workerData.nombre}`, { usuario: workerData.usuario, rol: workerData.rol }, 'SESION', 'BAJA');
        router.push(matchPreset.destino);
        return;
      }

      setLoginError(data?.error || 'Contraseña incorrecta para el trabajador asignado.');
    } catch (err: any) {
      console.error('Error de autenticación:', err);
      const matchPreset = PUESTOS_PLANTILLA.find(x => x.usuario.toLowerCase() === u.toLowerCase());
      if (matchPreset && matchPreset.defaultClave === p) {
        const workerData = {
          usuario: matchPreset.usuario,
          nombre: matchPreset.puesto,
          rol: matchPreset.rol,
          letra: matchPreset.usuario === 'cajero' ? 'A' : 'T',
          permisos: {}
        };
        localStorage.setItem('admin_user_data', JSON.stringify(workerData));
        localStorage.setItem('adminUser', workerData.usuario);
        localStorage.setItem('adminLetra', workerData.letra);
        localStorage.setItem('admin_auth_andministrador', 'true');
        router.push(matchPreset.destino);
        return;
      }
      setLoginError('Error de conexión con el sistema.');
    } finally {
      setIsAuthenticating(false);
    }
  };

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
          padding: 28px 48px 28px 44px;
          flex: 0 0 55%;
          display: flex; align-items: center;
          clip-path: polygon(0 0, 92% 0, 100% 100%, 0 100%);
        }
        .header-accent { width: 4px; height: 50px; background: linear-gradient(180deg,#B8CD29,#5DB130); border-radius: 4px; margin-right: 16px; flex-shrink: 0; }
        .header-title { color: #fff; font-weight: 800; line-height: 1.15; text-transform: uppercase; font-size: clamp(18px, 2.5vw, 36px); }
        .header-right {
          flex: 1; background: #fff;
          display: flex; align-items: center; justify-content: space-around;
          padding: 12px 24px; gap: 14px; flex-wrap: wrap;
        }
        .header-logo {
          max-height: 68px; width: auto; object-fit: contain; display: block;
          transition: transform 0.2s ease;
        }
        .header-logo:hover {
          transform: scale(1.05);
        }
        .header-divider-v {
          width: 1px; height: 42px; background: #e2e8f0; flex-shrink: 0;
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
          text-decoration: none; border-radius: 20px; padding: 50px 32px 40px;
          background: linear-gradient(155deg, rgba(30,80,55,.9) 0%, rgba(15,50,35,.95) 100%);
          border: 1px solid rgba(184,205,41,.4);
          box-shadow: 0 0 0 1px rgba(184,205,41,.2), 0 12px 40px rgba(0,0,0,.5);
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
        .card-title { margin: 10px 0 16px; color: #fff; font-size: 26px; line-height: 1.3; }
        .card-desc { margin: 0 0 30px 0; color: rgba(200,230,200,.75); font-size: 15px; line-height: 1.6; text-align: center; font-weight: 400; }

        .btn-enter {
          background: linear-gradient(135deg, #B8CD29 0%, #5DB130 100%);
          color: #06120e; padding: 14px 40px; border-radius: 30px;
          font-weight: 700; font-size: 16px; text-decoration: none;
          box-shadow: 0 4px 16px rgba(184,205,41,.3);
          transition: all 0.2s; border: none; cursor: pointer;
          width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-enter:hover {
          box-shadow: 0 6px 20px rgba(184,205,41,.5);
          transform: scale(1.02);
        }

        /* ── DROPDOWN FUNCIONARIO ── */
        .func-dropdown-container {
          position: relative; width: 100%;
        }
        .func-dropdown-menu {
          width: 100%; margin-top: 20px;
          background: rgba(10,30,20,.95); border: 1px solid rgba(184,205,41,.4);
          border-radius: 16px; overflow: hidden;
          box-shadow: 0 12px 40px rgba(0,0,0,.6);
          animation: dropdownAnim 0.2s ease forwards;
          display: flex; flex-direction: column;
        }
        @keyframes dropdownAnim {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dropdown-item {
          padding: 16px 24px; color: #fff; text-decoration: none;
          display: flex; align-items: center; gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,.05);
          transition: background 0.2s; font-weight: 500;
        }
        .dropdown-item:last-child { border-bottom: none; }
        .dropdown-item:hover { background: rgba(184,205,41,.15); }
        .dropdown-icon {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(184,205,41,.2); display: flex; align-items: center; justify-content: center;
          color: #B8CD29;
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
          flex: 1; background: rgba(255,255,255,.98); padding: 14px 28px;
          display: flex; align-items: center; justify-content: space-around; gap: 20px; flex-wrap: wrap;
        }
        .footer-logo { max-height: 62px; width: auto; object-fit: contain; }
        .footer-logo.rounded { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .footer-divider { width: 1px; height: 46px; background: #e2e8f0; flex-shrink: 0; }

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
          .header-right { padding: 14px 16px; justify-content: center; gap: 12px; }
          .header-logo { max-height: 48px; }
          .header-divider-v { display: none; }

          .center { padding: 36px 20px 44px; }
          .section-title { margin-bottom: 30px; }

          .card { padding: 46px 20px 30px; }
          .card-title { font-size: 22px; }

          .footer { flex-direction: column; }
          .footer-iamec { min-width: unset; width: 100%; border-right: none; border-bottom: 1px solid rgba(184,205,41,.25); padding: 20px; }
          .iamec-logo { height: 64px; }
          .footer-logos { padding: 16px; justify-content: center; gap: 16px; }
          .footer-logo { max-height: 44px; }
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
            <img src="/logos/alcaldia.png" alt="Alcaldía Bolivariana de Naguanagua" className="header-logo" style={{ maxHeight: 72 }} />
            <div className="header-divider-v" />
            <img src="/logos/LACAVA.png" alt="Gobernación de Carabobo" className="header-logo" style={{ maxHeight: 58 }} />
            <div className="header-divider-v" />
            <img src="/logos/ELIZABETH.png" alt="Gestión Municipal" className="header-logo" style={{ maxHeight: 62 }} />
            <div className="header-divider-v" />
            <img src="/logos/NAGUANAGUATEQUIERO.png" alt="Naguanagua Te Quiero" className="header-logo" style={{ maxHeight: 62 }} />
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
              <div className="bg-white rounded-[28px] shadow-2xl p-7 sm:p-8 max-w-sm w-full mx-auto text-slate-800 animate-fadeIn">
                {/* Encabezado logos */}
                <div className="flex items-center justify-center gap-4 mb-3">
                  <img src="/logos/logo_global_rec.png" alt="Global Rec" className="h-10 w-auto object-contain" />
                  <div className="h-8 w-[1px] bg-slate-200" />
                  <img src="/logos/global_green.png" alt="Global Green" className="h-9 w-auto object-contain" />
                </div>

                {/* Títulos corporativos */}
                <h2 className="text-2xl font-black text-slate-900 tracking-tight text-center">Global Rec</h2>
                <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase text-center mt-0.5">COLLECTION SYSTEM</p>
                <p className="text-xs font-black text-slate-700 uppercase tracking-[0.2em] text-center mt-2.5">MÓDULO OPERADOR</p>

                <div className="border-t border-slate-100 my-5" />

                {/* Formulario */}
                <form onSubmit={handleFuncionarioLogin} className="space-y-4">
                  {loginError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs text-center border border-red-200 font-semibold flex items-center justify-center gap-2">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-1.5 text-left">
                      USUARIO ASIGNADO
                    </label>
                    <div className="relative">
                      <User className="w-5 h-5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                      <select
                        value={selectedPuesto}
                        onChange={(e) => {
                          setSelectedPuesto(e.target.value);
                          if (e.target.value !== 'manual') {
                            setUsuarioInput(e.target.value);
                          } else {
                            setUsuarioInput('');
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-9 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all appearance-none cursor-pointer"
                      >
                        <optgroup label="── Puestos de la Plantilla ──">
                          {PUESTOS_PLANTILLA.map((p) => (
                            <option key={p.usuario} value={p.usuario}>
                              {p.puesto}
                            </option>
                          ))}
                        </optgroup>
                        {trabajadoresDb.length > 0 && (
                          <optgroup label="── Trabajadores Registrados ──">
                            {trabajadoresDb.map((t) => (
                              <option key={t.usuario} value={t.usuario}>
                                {t.nombre} - {t.rol}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <option value="manual">➕ Otro / Ingresar usuario manual</option>
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-3 text-slate-400 pointer-events-none" />
                    </div>

                    {selectedPuesto === 'manual' && (
                      <div className="relative mt-2">
                        <User className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={usuarioInput}
                          onChange={(e) => setUsuarioInput(e.target.value)}
                          placeholder="Ej. jperez"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-1.5 text-left">
                      CONTRASEÑA
                    </label>
                    <div className="relative">
                      <Lock className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={claveInput}
                        onChange={(e) => setClaveInput(e.target.value)}
                        placeholder="********"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors bg-transparent border-none cursor-pointer"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAuthenticating}
                    className="w-full bg-[#c8e844] hover:bg-[#b8d937] text-slate-900 font-extrabold py-3.5 px-4 rounded-xl text-sm transition-all shadow-md active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer border-none mt-2"
                  >
                    {isAuthenticating ? (
                      <AlertCircle className="w-5 h-5 animate-spin text-slate-900" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-slate-900 stroke-[2.5]" />
                    )}
                    <span>{isAuthenticating ? 'Iniciando...' : 'Iniciar Jornada'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* ══ FOOTER ══ */}
        <div className="footer">
          <div className="footer-iamec">
            <div className="footer-iamec-glow" />
            <img src="/logos/IAMEC.png" alt="IAMEC Naguanagua" className="iamec-logo" />
          </div>
          <div className="footer-logos">
            <img src="/logos/logo_global_rec.png" alt="Global Rec Collection System" className="footer-logo" style={{ maxHeight: 60 }} />
            <div className="footer-divider" />
            <img src="/logos/global_green.png" alt="Global Green Environmental Solutions" className="footer-logo" style={{ maxHeight: 56 }} />
            <div className="footer-divider" />
            <img src="/logos/INSTITUTO.png" alt="Instituto Municipal" className="footer-logo rounded" style={{ maxHeight: 62 }} />
            <div className="footer-divider" />
            <img src="/logos/basura_cero.jpg" alt="Naguanagua Basura Cero" className="footer-logo rounded" style={{ maxHeight: 60 }} />
          </div>
        </div>

      </div>
    </>
  );
}
