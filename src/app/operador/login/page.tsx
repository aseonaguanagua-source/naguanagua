'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PUESTOS_OPERADOR = [
  { puesto: 'Operador de Censo / Catastro', usuario: 'censo', defaultClave: 'censo123', redirect: '/operador' },
  { puesto: 'Cobro Móvil / Campo', usuario: 'cobromovil', defaultClave: 'movil123', redirect: '/cobro-movil' },
  { puesto: 'Catastro Especial', usuario: 'CATASTRO', defaultClave: '1042700', redirect: '/operador' },
  { puesto: 'Hacienda Especial', usuario: 'HACIENDA', defaultClave: '1042700', redirect: '/operador' },
  { puesto: 'Taquilla / Cajero', usuario: 'cajero', defaultClave: 'cajero123', redirect: '/admin/caja' },
  { puesto: 'Administrador', usuario: 'dzara', defaultClave: 'dzara', redirect: '/admin' },
];

export default function OperadorLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [targetModulo, setTargetModulo] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const modulo = params.get('modulo') || params.get('puesto');
        if (modulo) {
          setTargetModulo(modulo);
        }
      } catch {}
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = usuario.trim();

    if (!u || !clave) {
      setError('Por favor ingresa tu usuario y contraseña');
      return;
    }

    setIsAuthenticating(true);
    setError('');

    const userUpper = u.toUpperCase();

    // Bypass especial para CATASTRO e HACIENDA
    if (userUpper === 'CATASTRO' || userUpper === 'HACIENDA') {
      if (clave !== '1042700') {
        setError('Contraseña incorrecta para este usuario especial');
        setIsAuthenticating(false);
        return;
      }
      localStorage.setItem('operador_censo_auth', userUpper);
      localStorage.setItem('adminUser', userUpper);
      router.push('/operador');
      return;
    }

    try {
      // 1. Verificar presets del sistema
      const matchPreset = PUESTOS_OPERADOR.find(x => x.usuario.toLowerCase() === u.toLowerCase());
      if (matchPreset && matchPreset.defaultClave === clave) {
        localStorage.setItem('operador_censo_auth', matchPreset.usuario);
        localStorage.setItem('adminUser', matchPreset.usuario);
        localStorage.setItem('operador_user_data', JSON.stringify({ 
          usuario: matchPreset.usuario, 
          rol: matchPreset.puesto 
        }));

        if (targetModulo === 'cobromovil' || matchPreset.usuario === 'cobromovil') {
          router.push('/cobro-movil');
        } else {
          router.push(matchPreset.redirect || '/operador');
        }
        return;
      }

      // 2. Verificar trabajadores registrados en base de datos Supabase
      const { data, error: dbError } = await supabase
        .from('trabajadores')
        .select('id, nombre, usuario, clave, rol, estado')
        .ilike('usuario', u.trim())
        .ilike('estado', 'Activo')
        .maybeSingle();

      if (dbError || !data) {
        setError('Usuario o contraseña incorrectos');
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
        localStorage.setItem('operador_censo_auth', data.usuario);
        localStorage.setItem('adminUser', data.usuario);
        localStorage.setItem('operador_user_data', JSON.stringify(data));

        if (targetModulo === 'cobromovil' || data.rol === 'Cobro Móvil') {
          router.push('/cobro-movil');
        } else {
          router.push('/operador');
        }
      } else {
        setError('Contraseña incorrecta');
      }
    } catch (err) {
      console.error(err);
      setError('Error al conectar con el servidor. Intenta de nuevo.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const isCobroMovil = targetModulo === 'cobromovil';
  const titleText = isCobroMovil ? 'Modulo Cobro Móvil' : 'Modulo Operador de Censo';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #06120e 0%, #0d2a1e 50%, #081810 100%)',
      fontFamily: 'Poppins, sans-serif', padding: '24px'
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a5c2e, #2d8c4e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', boxShadow: '0 0 24px rgba(93,177,48,.4)'
        }}>
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#B8CD29" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        </div>
        <h1 style={{ color: '#B8CD29', fontSize: 22, fontWeight: 800, margin: 0 }}>{titleText}</h1>
        <p style={{ color: 'rgba(200,230,200,.6)', fontSize: 13, margin: '4px 0 0' }}>IAMEC Naguanagua - Municipio Naguanagua</p>
      </div>

      <form onSubmit={handleLogin} style={{
        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(184,205,41,.2)', borderRadius: 20,
        padding: '32px 28px', width: '100%', maxWidth: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,.5)'
      }}>
        <div style={{ marginBottom: 18 }}>
          <label style={{ color: 'rgba(200,230,200,.8)', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            USUARIO
          </label>
          <input
            type="text"
            required
            autoFocus
            value={usuario}
            onChange={e => setUsuario(e.target.value)}
            placeholder="Ingresa tu usuario"
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(184,205,41,.25)',
              color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ color: 'rgba(200,230,200,.8)', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            CONTRASENA
          </label>
          <input
            type="password"
            required
            value={clave}
            onChange={e => setClave(e.target.value)}
            placeholder="••••••"
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(184,205,41,.25)',
              color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.4)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 18,
            color: '#fca5a5', fontSize: 13, textAlign: 'center'
          }}>{error}</div>
        )}

        <button type="submit" disabled={isAuthenticating} style={{
          width: '100%', padding: '14px', borderRadius: 12,
          background: isAuthenticating ? 'rgba(184,205,41,.4)' : 'linear-gradient(135deg, #B8CD29, #8fa81e)',
          border: 'none', color: '#06120e', fontWeight: 800, fontSize: 15,
          cursor: isAuthenticating ? 'not-allowed' : 'pointer', letterSpacing: 0.5
        }}>
          {isAuthenticating ? 'Ingresando...' : 'Ingresar'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <a href="/" style={{ color: 'rgba(200,230,200,.5)', fontSize: 12, textDecoration: 'none' }}>
            ← Volver al Inicio
          </a>
        </div>
      </form>
    </div>
  );
}
