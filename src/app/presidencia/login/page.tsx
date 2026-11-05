'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Landmark, Lock, User, ArrowLeft, ShieldCheck } from 'lucide-react';

export default function PresidenciaLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cleanUser = usuario.trim();

      // Soporte acceso directo de Presidencia / Master
      if (
        (cleanUser.toLowerCase() === 'presidencia' ||
          cleanUser.toLowerCase() === 'dzara' ||
          cleanUser.toLowerCase() === 'administrador') &&
        (clave === 'Sehile18-' || clave === '1756762' || clave === 'dzara18')
      ) {
        sessionStorage.setItem(
          'presidencia_auth',
          JSON.stringify({ nombre: 'Presidencia Ejecutiva IAMEC', ts: Date.now() })
        );
        router.push('/presidencia');
        return;
      }

      if (cleanUser.toLowerCase() === 'dzara' || cleanUser.toLowerCase() === 'administrador' || cleanUser.toLowerCase() === 'admin') {
        fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usuario: `INTENTO-MASTER (${cleanUser})`,
            accion: 'Intento fallido de acceso a Usuario Master en Presidencia',
            categoria: 'SEGURIDAD',
            modulo: '/presidencia/login',
            detalles: { criticidad: 'CRITICA', usuario_intentado: cleanUser }
          })
        }).catch(() => {});
        setError('⚠️ Intentando entrar a usuario master: se enviará IP para verificar su login.');
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('trabajadores')
        .select('id, usuario, nombre, rol, clave, estado')
        .ilike('usuario', cleanUser)
        .maybeSingle();

      if (!data) {
        setError('Usuario o contraseña incorrectos.');
        setLoading(false);
        return;
      }
      if (data.estado !== 'Activo') {
        setError('Este usuario se encuentra inactivo.');
        setLoading(false);
        return;
      }
      if (
        data.rol !== 'Presidencia' &&
        data.rol !== 'Administrador' &&
        data.rol !== 'SuperAdmin'
      ) {
        setError('Su perfil no posee credenciales de Modo Presidencia.');
        setLoading(false);
        return;
      }

      let passwordValid = false;
      const isHashed = data.clave?.startsWith('$2b$') || data.clave?.startsWith('$2a$');
      if (isHashed) {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUser.toLowerCase(), password: clave }),
        });
        passwordValid = res.ok;
      } else {
        passwordValid = data.clave === clave;
      }

      if (!passwordValid) {
        setError('Contraseña incorrecta.');
        setLoading(false);
        return;
      }

      sessionStorage.setItem(
        'presidencia_auth',
        JSON.stringify({ nombre: data.nombre, ts: Date.now() })
      );
      router.push('/presidencia');
    } catch {
      setError('Error de conexión. Intente de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06120e] via-[#0b241a] to-[#050f0b] text-white flex flex-col justify-between p-4 sm:p-6">
      {/* Cintillo de Logos Oficiales */}
      <div className="max-w-4xl w-full mx-auto">
        <div className="bg-white rounded-2xl px-2 sm:px-5 py-2.5 shadow-xl grid grid-cols-5 items-center divide-x divide-slate-200 w-full">
          <div className="flex justify-center items-center px-1 sm:px-2">
            <img src="/logos/LACAVA.png" alt="Lacava" className="h-8 sm:h-12 object-contain" />
          </div>
          <div className="flex justify-center items-center px-1 sm:px-2">
            <img
              src="/logos/NAGUANAGUATEQUIERO.png"
              alt="Naguanagua"
              className="h-9 sm:h-12 object-contain"
            />
          </div>
          <div className="flex justify-center items-center px-1 sm:px-2">
            <img
              src="/logos/ELIZABETH.png"
              alt="Elizabeth Niño"
              className="h-8 sm:h-11 object-contain"
            />
          </div>
          <div className="flex justify-center items-center px-1 sm:px-2">
            <img
              src="/logos/INSTITUTO.png"
              alt="Instituto Ecosocialismo"
              className="h-9 sm:h-12 object-contain"
            />
          </div>
          <div className="flex justify-center items-center px-1 sm:px-2">
            <img src="/logos/IAMEC.png" alt="IAMEC" className="h-8 sm:h-12 object-contain" />
          </div>
        </div>
      </div>

      {/* Tarjeta Central de Login Presidencial */}
      <div className="max-w-md w-full mx-auto my-8">
        <div className="bg-slate-900/85 backdrop-blur-xl border border-[#B8CD29]/30 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#B8CD29] to-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#B8CD29]/20 text-slate-950">
              <Landmark className="w-8 h-8" />
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-[#B8CD29]/15 text-[#B8CD29] border border-[#B8CD29]/30 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> ACCESO EJECUTIVO OFICIAL
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">Modo Presidencia</h1>
            <p className="text-xs text-slate-400 mt-1">
              Estadística Administrativa Integral, Gráficos y Reportes del IAMEC
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-300/90 mb-1.5">
                Usuario Autorizado
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Ej: presidencia o usuario"
                  className="w-full bg-slate-950/90 border border-slate-700 focus:border-[#B8CD29] rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-white outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-300/90 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/90 border border-slate-700 focus:border-[#B8CD29] rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-white outline-none transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-semibold text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#B8CD29] to-emerald-500 hover:from-[#c8de38] hover:to-emerald-400 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-[#B8CD29]/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Verificando Credenciales...' : 'Ingresar al Modo Presidencia'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <Link
              href="/portal"
              className="text-slate-400 hover:text-white font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a Soy Contribuyente
            </Link>
            <Link
              href="/"
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              Inicio General →
            </Link>
          </div>
        </div>
      </div>

      <div className="text-center text-[11px] text-slate-500 font-semibold">
        Global Rec • IAMEC Naguanagua • Centro de Mando Ejecutivo
      </div>
    </div>
  );
}
