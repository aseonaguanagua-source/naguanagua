'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Phone, Key } from 'lucide-react';

export default function PortalLogin() {
  const router = useRouter();
  const [docType, setDocType] = useState('V');
  const [docNum, setDocNum] = useState('');
  const [clave, setClave] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Setup state
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [confirmClave, setConfirmClave] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const doc = localStorage.getItem('portal_doc');
    if (doc) {
      router.replace('/portal/dashboard');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (docNum.length < 5) {
      setError('Por favor ingrese un número de documento válido.');
      setIsLoading(false);
      return;
    }

    if (!clave) {
      setError('Por favor ingrese su contraseña.');
      setIsLoading(false);
      return;
    }

    try {
      const fullDoc = `${docType}${docNum}`;
      const res = await fetch(`/api/contribuyente/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identidad: fullDoc, clave })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.status === 'setup_required') {
          setIsSetupMode(true);
          setIsLoading(false);
          return;
        }
        localStorage.setItem('portal_user', data.nombre);
        localStorage.setItem('portal_doc', fullDoc);
        localStorage.setItem('portal_codigo', data.codigo);
        router.push('/portal/dashboard');
      } else {
        setError(data.error || 'Error al iniciar sesión.');
        setIsLoading(false);
      }
    } catch {
      setError('Error de conexión.');
      setIsLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (clave !== confirmClave) {
      setError('Las contraseñas no coinciden.');
      setIsLoading(false);
      return;
    }

    if (!correo) {
      setError('El correo electrónico es obligatorio.');
      setIsLoading(false);
      return;
    }

    try {
      const fullDoc = `${docType}${docNum}`;
      const res = await fetch(`/api/contribuyente/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identidad: fullDoc, correo, telefono, clave })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('portal_user', data.nombre);
        localStorage.setItem('portal_doc', fullDoc);
        localStorage.setItem('portal_codigo', data.codigo);
        router.push('/portal/dashboard');
      } else {
        setError(data.error || 'Error al configurar cuenta.');
        setIsLoading(false);
      }
    } catch {
      setError('Error de conexión.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-slate-100 overflow-hidden">
          
          {/* Header */}
          <div className="pt-10 pb-6 px-8 text-center">
            {/* Logo SVG — mismo logo que en la imagen */}
            <div className="flex justify-center mb-3">
              <svg viewBox="0 0 80 60" width="72" height="54" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="40" cy="30" r="28" fill="#111827"/>
                <text x="40" y="37" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="Arial">GR</text>
              </svg>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Global Rec</h1>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase mt-0.5">Collection System</p>
            <p className="text-sm font-bold text-slate-700 mt-3 uppercase tracking-widest">
              {isSetupMode ? 'Configurar Cuenta' : 'Portal Contribuyente'}
            </p>
          </div>

          {/* Body */}
          <div className="px-8 pb-8">
            <p className="text-sm text-slate-500 text-center mb-6 leading-snug">
              {isSetupMode
                ? 'Primer ingreso. Asigne su contraseña y datos de contacto para continuar.'
                : 'Ingrese su cédula o RIF y contraseña para acceder a su cuenta.'}
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm text-center font-medium">
                {error}
              </div>
            )}

            <form onSubmit={isSetupMode ? handleSetup : handleLogin} className="space-y-4">
              {!isSetupMode && (
                <>
                  {/* Documento */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Cédula o RIF
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className="w-[64px] border border-slate-200 rounded-xl px-2 py-3 text-sm font-bold text-slate-700 outline-none focus:border-slate-400 bg-slate-50 text-center appearance-none cursor-pointer"
                      >
                        <option value="V">V</option>
                        <option value="J">J</option>
                        <option value="G">G</option>
                        <option value="E">E</option>
                        <option value="P">P</option>
                      </select>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        placeholder="Número de documento"
                        value={docNum}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setDocNum(val);
                        }}
                        className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 placeholder:font-normal placeholder:text-slate-400"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Seleccione el prefijo y luego ingrese los dígitos</p>
                  </div>

                  {/* Contraseña */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={clave}
                        onChange={(e) => setClave(e.target.value)}
                        placeholder="Contraseña"
                        className="w-full border border-slate-200 rounded-xl px-4 pr-11 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 placeholder:font-normal placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Olvidó contraseña */}
                  <div className="text-right">
                    <Link href="/portal/recuperar" className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors">
                      ¿Ha olvidado su contraseña? →
                    </Link>
                  </div>
                </>
              )}

              {isSetupMode && (
                <div className="space-y-4">
                  <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-xs font-medium border border-blue-100 text-center">
                    Documento: <strong>{docType}-{docNum}</strong>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Correo Electrónico</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={correo}
                        onChange={(e) => setCorreo(e.target.value)}
                        placeholder="ejemplo@correo.com"
                        className="w-full border border-slate-200 rounded-xl pl-10 px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Teléfono</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="04141234567"
                        className="w-full border border-slate-200 rounded-xl pl-10 px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Contraseña Nueva</label>
                    <div className="relative">
                      <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={clave}
                        onChange={(e) => setClave(e.target.value)}
                        placeholder="Cree su contraseña"
                        className="w-full border border-slate-200 rounded-xl pl-10 px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Confirmar Contraseña</label>
                    <div className="relative">
                      <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmClave}
                        onChange={(e) => setConfirmClave(e.target.value)}
                        placeholder="Repita la contraseña"
                        className="w-full border border-slate-200 rounded-xl pl-10 px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Botón Entrar */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#c8e64c] hover:bg-[#b8d93c] text-slate-900 font-bold py-3.5 px-4 rounded-xl text-sm transition-colors disabled:opacity-70 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                ) : (
                  isSetupMode ? 'Guardar y Continuar' : 'Entrar'
                )}
              </button>

              {/* Registrarse */}
              {!isSetupMode && (
                <p className="text-center text-sm text-slate-500 mt-2">
                  ¿No tienes una cuenta?{' '}
                  <Link href="/portal/registro" className="text-slate-800 font-bold hover:underline">
                    Regístrarse
                  </Link>
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
