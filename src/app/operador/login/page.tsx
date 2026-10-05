'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Lock, AlertCircle, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const PUESTOS_OPERADOR = [
  { puesto: 'Operador de Censo / Catastro', usuario: 'censo', defaultClave: 'censo123' },
  { puesto: 'Catastro Especial', usuario: 'CATASTRO', defaultClave: '1042700' },
  { puesto: 'Hacienda Especial', usuario: 'HACIENDA', defaultClave: '1042700' },
  { puesto: 'Cobro Móvil / Campo', usuario: 'cobromovil', defaultClave: 'movil123' },
  { puesto: 'Taquilla / Cajero', usuario: 'cajero', defaultClave: 'cajero123' },
  { puesto: 'Administrador', usuario: 'dzara', defaultClave: 'dzara' },
];

export default function OperadorLogin() {
  const router = useRouter();
  const [selectedPuesto, setSelectedPuesto] = useState('censo');
  const [usuario, setUsuario] = useState('censo');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [trabajadoresDb, setTrabajadoresDb] = useState<any[]>([]);

  useEffect(() => {
    const fetchTrabajadores = async () => {
      try {
        const { data } = await supabase
          .from('trabajadores')
          .select('id, nombre, usuario, rol, letra, estado')
          .eq('estado', 'Activo');
        if (data && data.length > 0) setTrabajadoresDb(data);
      } catch {}
    };
    fetchTrabajadores();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = (selectedPuesto === 'manual' ? usuario : selectedPuesto).trim();
    const userUpper = u.toUpperCase();

    // Mantener bypass para CATASTRO e HACIENDA temporalmente si es necesario
    if (userUpper === 'CATASTRO' || userUpper === 'HACIENDA') {
      if (clave !== '1042700') {
        setError('Clave incorrecta para este usuario especial');
        return;
      }
      localStorage.setItem('operador_censo_auth', userUpper);
      router.push('/operador');
      return;
    }

    if (u.length === 0 || clave.length === 0) {
      setError('Credenciales incompletas');
      return;
    }

    setIsAuthenticating(true);
    setError('');

    try {
      // Fallback directo a presets locales si coincide la clave
      const matchPreset = PUESTOS_OPERADOR.find(x => x.usuario.toLowerCase() === u.toLowerCase());
      if (matchPreset && matchPreset.defaultClave === clave) {
        localStorage.setItem('operador_censo_auth', u);
        localStorage.setItem('operador_user_data', JSON.stringify({ usuario: u, rol: 'Operador de Censo' }));
        router.push('/operador');
        return;
      }

      const { data, error: dbError } = await supabase
        .from('trabajadores')
        .select('id, usuario, clave, rol, estado')
        .eq('usuario', u)
        .eq('estado', 'Activo')
        .single();

      if (dbError || !data) {
        setError('Usuario no encontrado o inactivo');
        setIsAuthenticating(false);
        return;
      }

      // Soporte dual: bcrypt o texto plano
      const isHashed = data.clave?.startsWith('$2b$') || data.clave?.startsWith('$2a$');
      let passwordValid = false;
      if (isHashed) {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: clave }),
        });
        passwordValid = res.ok;
      } else {
        passwordValid = data.clave === clave;
      }

      if (passwordValid) {
        localStorage.setItem('operador_censo_auth', u);
        localStorage.setItem('operador_user_data', JSON.stringify(data));
        router.push('/operador');
      } else {
        setError('Contraseña incorrecta');
      }
    } catch (err) {
      console.error(err);
      setError('Error al conectar con la base de datos');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none"></div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white rounded-[28px] shadow-2xl p-7 sm:p-8 text-slate-800">
          {/* Encabezado logos */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <img src="/logos/logo_global_rec.png" alt="Global Rec" className="h-10 w-auto object-contain" />
            <div className="h-8 w-[1px] bg-slate-200" />
            <img src="/logos/global_green.png" alt="Global Green" className="h-9 w-auto object-contain" />
          </div>

          <h1 className="text-2xl font-black text-slate-900 tracking-tight text-center">Global Rec</h1>
          <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase text-center mt-0.5">COLLECTION SYSTEM</p>
          <p className="text-xs font-black text-slate-700 uppercase tracking-[0.2em] text-center mt-2.5">MÓDULO OPERADOR</p>

          <div className="border-t border-slate-100 my-5" />

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs text-center border border-red-200 font-semibold flex items-center justify-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
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
                      setUsuario(e.target.value);
                    } else {
                      setUsuario('');
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-9 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all appearance-none cursor-pointer"
                >
                  <optgroup label="── Puestos de Campo y Censo ──">
                    {PUESTOS_OPERADOR.map((p) => (
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
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
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
                  value={clave}
                  onChange={e => setClave(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all tracking-wider"
                  placeholder="********"
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
              <span>{isAuthenticating ? 'Verificando...' : 'Iniciar Jornada'}</span>
            </button>
          </form>

          <div className="text-center pt-4 mt-4 border-t border-slate-100">
            <a href="/" className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
              ← Volver al Portal de la Alcaldía
            </a>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6 font-medium">
          Sistema Exclusivo de Empadronamiento de Calle
        </p>
      </div>
    </div>
  );
}
