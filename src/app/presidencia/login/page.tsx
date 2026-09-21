'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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
      const { data } = await supabase
        .from('trabajadores')
        .select('id, nombre, rol, estado')
        .eq('usuario', usuario.trim().toLowerCase())
        .eq('clave', clave)
        .single();

      if (!data) { setError('Usuario o contrasena incorrectos.'); setLoading(false); return; }
      if (data.estado !== 'Activo') { setError('Usuario inactivo.'); setLoading(false); return; }
      if (data.rol !== 'Presidencia' && data.rol !== 'Administrador') {
        setError('No tienes acceso a este modulo.'); setLoading(false); return;
      }

      sessionStorage.setItem('presidencia_auth', JSON.stringify({ nombre: data.nombre, ts: Date.now() }));
      router.push('/presidencia');
    } catch {
      setError('Error de conexion. Intenta de nuevo.');
      setLoading(false);
    }
  };

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
        <h1 style={{ color: '#B8CD29', fontSize: 22, fontWeight: 800, margin: 0 }}>Modulo Presidencia</h1>
        <p style={{ color: 'rgba(200,230,200,.6)', fontSize: 13, margin: '4px 0 0' }}>Instituto de Aseo - Municipio Naguanagua</p>
      </div>

      <form onSubmit={handleLogin} style={{
        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(184,205,41,.2)', borderRadius: 20,
        padding: '32px 28px', width: '100%', maxWidth: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,.5)'
      }}>
        <div style={{ marginBottom: 18 }}>
          <label style={{ color: 'rgba(200,230,200,.8)', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            Usuario
          </label>
          <input
            type="text" value={usuario} onChange={e => setUsuario(e.target.value)}
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
            Contrasena
          </label>
          <input
            type="password" value={clave} onChange={e => setClave(e.target.value)}
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
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '14px', borderRadius: 12,
          background: loading ? 'rgba(184,205,41,.4)' : 'linear-gradient(135deg, #B8CD29, #8fa81e)',
          border: 'none', color: '#06120e', fontWeight: 800, fontSize: 15,
          cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: 0.5
        }}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
