'use client';
import { useState, useEffect } from 'react';
import { Terminal, Database, Save, Search, AlertOctagon, Code, ShieldAlert, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DevGodMode() {
  const router = useRouter();
  const [pass, setPass] = useState('1756762');
  const [activeTab, setActiveTab] = useState<'sql' | 'table' | 'toggles'>('toggles');
  
  // Toggles State
  const [toggles, setToggles] = useState<any[]>([]);
  const [isTogglesLoading, setIsTogglesLoading] = useState(false);
  const [togglesError, setTogglesError] = useState('');
  
  // SQL State
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlError, setSqlError] = useState('');
  const [isSqlLoading, setIsSqlLoading] = useState(false);

  // Table State
  const [tableName, setTableName] = useState('');
  const [searchMatch, setSearchMatch] = useState('{"id": 1}');
  const [tableResult, setTableResult] = useState<any[]>([]);
  const [tableError, setTableError] = useState('');
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [editRowData, setEditRowData] = useState<string>('');
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const devMode = localStorage.getItem('dev_mode_active');
      if (devMode !== '1') {
        router.push('/admin');
      } else {
        if (activeTab === 'toggles') {
          loadToggles();
        }
      }
    }
  }, [router, activeTab]);

  const loadToggles = async () => {
    setIsTogglesLoading(true);
    setTogglesError('');
    try {
      const res = await fetch('/api/admin/dev/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', table: 'system_config', pass: '1756762' })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error && data.error.includes('Could not find the table')) {
          throw new Error('La tabla system_config no existe. Debes crearla en Supabase (Ver instrucciones abajo).');
        }
        throw new Error(data.error || 'Error al cargar interruptores');
      }
      setToggles(data.data || []);
    } catch (e: any) {
      setTogglesError(e.message);
    } finally {
      setIsTogglesLoading(false);
    }
  };

  const toggleConfig = async (key: string, currentValue: string) => {
    try {
      setIsTogglesLoading(true);
      const newValue = currentValue === 'true' ? 'false' : 'true';
      const res = await fetch('/api/admin/dev/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'update', 
          table: 'system_config', 
          data: { value: newValue },
          match: { key }, 
          pass: '1756762' 
        })
      });
      if (!res.ok) throw new Error('Error al actualizar');
      await loadToggles();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsTogglesLoading(false);
    }
  };

  const runSql = async () => {
    setIsSqlLoading(true);
    setSqlError('');
    setSqlResult(null);
    try {
      const res = await fetch('/api/admin/dev/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery, pass })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error SQL');
      setSqlResult(data);
    } catch (e: any) {
      setSqlError(e.message);
    } finally {
      setIsSqlLoading(false);
    }
  };

  const loadTable = async () => {
    setIsTableLoading(true);
    setTableError('');
    setTableResult([]);
    setActiveRowIndex(null);
    try {
      let matchObj = null;
      if (searchMatch.trim()) {
        matchObj = JSON.parse(searchMatch);
      }
      
      const res = await fetch('/api/admin/dev/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', table: tableName, match: matchObj, pass })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error Table');
      setTableResult(data.data || []);
    } catch (e: any) {
      setTableError(e.message);
    } finally {
      setIsTableLoading(false);
    }
  };

  const saveRow = async (index: number) => {
    try {
      const parsedData = JSON.parse(editRowData);
      const originalRow = tableResult[index];
      
      // Asumimos que id es pk
      const pkFields = ['id', 'cedula', 'usuario']; // Possible primary keys
      const matchObj: any = {};
      let hasPk = false;
      
      for (const pk of pkFields) {
        if (originalRow[pk] !== undefined) {
          matchObj[pk] = originalRow[pk];
          hasPk = true;
          break;
        }
      }
      
      if (!hasPk) {
        alert("No se pudo detectar clave primaria (id, cedula, usuario). Actualización puede fallar.");
      }

      setIsTableLoading(true);
      const res = await fetch('/api/admin/dev/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'update', 
          table: tableName, 
          data: parsedData,
          match: matchObj, 
          pass 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error Update');
      
      alert("Fila actualizada (Sin auditoría)");
      setActiveRowIndex(null);
      await loadTable();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsTableLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <ShieldAlert className="text-fuchsia-600 w-8 h-8" />
            Modo Dios (Dev)
          </h1>
          <p className="text-slate-500 font-semibold text-sm mt-1">
            Módulo oculto. Modificación directa a Base de Datos sin pasar por logs de auditoría.
          </p>
        </div>
      </div>

      <div className="bg-fuchsia-50 border-l-4 border-fuchsia-500 p-4 rounded text-fuchsia-900 text-sm font-semibold flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          ADVERTENCIA: Estás utilizando herramientas que bypassean (saltan) la seguridad RLS de Supabase y no generan registros en la tabla de auditoría. Cualquier cambio de montos, tarifas o deudas aquí será permanente e indetectable por el sistema de logs. Úsalo bajo tu propio riesgo.
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('toggles')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'toggles' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <AlertOctagon className="w-4 h-4" /> Interruptores del Sistema
        </button>
        <button 
          onClick={() => setActiveTab('table')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'table' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Database className="w-4 h-4" /> Gestor de Tablas (Fácil)
        </button>
        <button 
          onClick={() => setActiveTab('sql')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'sql' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Code className="w-4 h-4" /> SQL Raw
        </button>
      </div>

      {activeTab === 'toggles' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Interruptores Globales</h2>
            
            {togglesError ? (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-red-700 font-bold mb-2">{togglesError}</p>
                {togglesError.includes('no existe') && (
                  <div className="bg-slate-900 text-emerald-400 p-4 rounded text-xs font-mono mt-2 overflow-x-auto">
                    <p className="text-slate-400 mb-2">/* Ejecuta esto en el SQL Editor de Supabase para activar esta función */</p>
                    CREATE TABLE system_config (<br/>
                    &nbsp;&nbsp;key TEXT PRIMARY KEY,<br/>
                    &nbsp;&nbsp;value TEXT NOT NULL,<br/>
                    &nbsp;&nbsp;description TEXT<br/>
                    );<br/><br/>
                    INSERT INTO system_config (key, value, description) VALUES <br/>
                    ('PORTAL_EN_MANTENIMIENTO', 'true', 'Activa o desactiva el cartel de mantenimiento en Soy Contribuyente');
                  </div>
                )}
                <button onClick={loadToggles} className="mt-4 bg-red-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-red-700">Reintentar</button>
              </div>
            ) : (
              <div className="space-y-4">
                {isTogglesLoading && <p className="text-slate-500 font-bold text-sm">Cargando interruptores...</p>}
                {!isTogglesLoading && toggles.length === 0 && (
                  <p className="text-slate-500 italic">No hay interruptores configurados en la tabla system_config.</p>
                )}
                
                {toggles.map((t) => (
                  <div key={t.key} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg bg-slate-50">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">{t.key}</h3>
                      <p className="text-sm text-slate-500">{t.description}</p>
                    </div>
                    <button
                      onClick={() => toggleConfig(t.key, t.value)}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${t.value === 'true' ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${t.value === 'true' ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'table' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-600 mb-1">Nombre de Tabla</label>
              <input 
                type="text" 
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                placeholder="Ej. inmuebles_tasas_bcv, contribuyentes..."
                className="w-full border border-slate-300 rounded px-3 py-2 outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 font-mono text-sm"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-600 mb-1">Filtro Match (JSON Opcional)</label>
              <input 
                type="text" 
                value={searchMatch}
                onChange={e => setSearchMatch(e.target.value)}
                placeholder='{"id": 1} o déjalo vacío para todos'
                className="w-full border border-slate-300 rounded px-3 py-2 outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 font-mono text-sm"
              />
            </div>
            <button 
              onClick={loadTable}
              disabled={isTableLoading}
              className="bg-slate-800 text-white px-6 py-2 rounded font-bold flex items-center gap-2 hover:bg-slate-700 disabled:opacity-50"
            >
              <Search className="w-4 h-4" /> Buscar
            </button>
          </div>

          {tableError && <div className="text-red-500 font-bold bg-red-50 p-3 rounded">{tableError}</div>}

          {tableResult.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-bold text-slate-600">Acción</th>
                      {Object.keys(tableResult[0]).map(k => (
                        <th key={k} className="px-4 py-3 font-bold text-slate-600">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableResult.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          {activeRowIndex === idx ? (
                            <div className="flex gap-2">
                              <button onClick={() => saveRow(idx)} className="text-emerald-600 font-bold flex items-center gap-1 hover:underline">
                                <Save className="w-4 h-4" /> Guardar
                              </button>
                              <button onClick={() => setActiveRowIndex(null)} className="text-slate-500 font-bold hover:underline">
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditRowData(JSON.stringify(row, null, 2));
                                setActiveRowIndex(idx);
                              }}
                              className="text-fuchsia-600 font-bold hover:underline flex items-center gap-1"
                            >
                              <Zap className="w-4 h-4" /> Editar
                            </button>
                          )}
                        </td>
                        {activeRowIndex === idx ? (
                          <td colSpan={Object.keys(row).length} className="px-4 py-2">
                            <textarea 
                              value={editRowData}
                              onChange={e => setEditRowData(e.target.value)}
                              className="w-full h-40 font-mono text-xs border border-fuchsia-300 rounded p-2 focus:ring-2 focus:ring-fuchsia-500 outline-none"
                            />
                          </td>
                        ) : (
                          Object.values(row).map((v: any, i) => (
                            <td key={i} className="px-4 py-2 max-w-xs truncate text-slate-700">
                              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </td>
                          ))
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sql' && (
        <div className="space-y-4">
          <div className="bg-slate-900 p-1 rounded-xl shadow-xl">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700 text-slate-400">
              <Terminal className="w-4 h-4" />
              <span className="text-xs font-mono font-bold tracking-widest">pg_client</span>
            </div>
            <textarea
              value={sqlQuery}
              onChange={e => setSqlQuery(e.target.value)}
              className="w-full h-64 bg-slate-900 text-emerald-400 p-4 font-mono text-sm outline-none resize-y"
              spellCheck={false}
              placeholder="UPDATE deudas SET monto = 0 WHERE id = 123; -- (Requiere pg y string de conexión)"
            />
          </div>
          <div className="flex justify-end">
            <button 
              onClick={runSql}
              disabled={isSqlLoading}
              className="bg-fuchsia-600 text-white px-8 py-3 rounded-lg font-black flex items-center gap-2 hover:bg-fuchsia-700 disabled:opacity-50 shadow-lg shadow-fuchsia-500/30"
            >
              <Zap className="w-5 h-5" /> EJECUTAR QUERY
            </button>
          </div>

          {sqlError && <div className="text-red-500 font-bold bg-red-50 p-4 rounded border border-red-200 font-mono text-sm">{sqlError}</div>}

          {sqlResult && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 overflow-x-auto font-mono text-xs">
              <div className="mb-4 text-emerald-600 font-bold">
                ✓ Query ejecutado. Filas afectadas: {sqlResult.rowCount}
              </div>
              {sqlResult.rows && sqlResult.rows.length > 0 && (
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      {sqlResult.fields.map((f: string) => <th key={f} className="px-3 py-2 bg-slate-100 border-b">{f}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sqlResult.rows.map((r: any, i: number) => (
                      <tr key={i}>
                        {sqlResult.fields.map((f: string) => <td key={f} className="px-3 py-1 border-b">{String(r[f])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
