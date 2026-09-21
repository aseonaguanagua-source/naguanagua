'use client';
import { Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { logAudit } from '@/lib/audit';
export default function Header() {
  const router = useRouter();
  
  return (
    <header className="h-16 bg-[#1e293b] sticky top-0 left-0 right-0 flex items-center justify-between px-6 z-40 border-b border-slate-700 shadow-md">
      <div className="flex items-center gap-6">
        <div className="text-slate-400 text-sm font-medium">Panel Administrativo</div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="text-right">
          <div className="font-medium text-[#c8e64c]">Usuario Oficial</div>
          <div className="text-xs text-slate-300">Última Conexión: Hoy</div>
        </div>
        <button 
          onClick={() => {
            logAudit('Logout (Cierre Manual)', {}, 'SESION');
            // Eliminar TODOS los tokens - siempre pedirá contraseña al volver
            localStorage.removeItem('admin_auth_andministrador');
            localStorage.removeItem('admin_user_data');
            localStorage.removeItem('adminUser');
            localStorage.removeItem('adminLetra');
            localStorage.removeItem('adminToken');
            // Redirigir al login admin
            window.location.href = '/admin';
          }}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
          title="Cerrar sesión"
        >
          <Power className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

