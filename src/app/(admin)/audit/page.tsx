'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

/**
 * Página legacy /audit — redirige automáticamente a /admin/auditoria
 * Esta ruta ya no está en uso activo; la tabla audit_logs fue reemplazada
 * por la tabla 'auditoria' con soporte de categorías y módulos.
 */
export default function AuditLegacyPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/admin/auditoria');
    }, 1500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-indigo-500 mx-auto animate-pulse" />
        <p className="text-slate-600 font-medium">Redirigiendo a Auditoría del Sistema...</p>
        <p className="text-slate-400 text-sm">Esta página fue migrada a <code className="bg-slate-100 px-1 rounded">/admin/auditoria</code></p>
      </div>
    </div>
  );
}
