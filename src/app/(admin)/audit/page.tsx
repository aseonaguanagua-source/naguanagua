'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Activity, Search } from 'lucide-react';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (data) {
      setLogs(data);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
        <Activity className="w-6 h-6 text-slate-700" />
        <h1 className="text-2xl font-semibold text-slate-800 uppercase tracking-wide">Auditoría del Sistema</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar por usuario o IP..." 
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>
          <span className="text-sm text-slate-500">Últimos 50 registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-3 font-semibold">Fecha y Hora</th>
                <th scope="col" className="px-6 py-3 font-semibold">Usuario</th>
                <th scope="col" className="px-6 py-3 font-semibold">Acción</th>
                <th scope="col" className="px-6 py-3 font-semibold">Dirección IP</th>
                <th scope="col" className="px-6 py-3 font-semibold">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-500">Cargando registros...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-500">No hay registros de auditoría</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="bg-white border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {log.user_id}
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded border border-blue-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {log.ip_address}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {log.details || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
