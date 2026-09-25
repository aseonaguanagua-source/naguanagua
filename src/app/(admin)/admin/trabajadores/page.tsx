'use client';
import { useState, useEffect } from 'react';
import { Users, Save, ArrowLeft, Plus, Shield, ShieldAlert, ShieldCheck, AlertCircle } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { supabase } from '@/lib/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const defaultPermissions = {
  crear_contribuyente: false,
  editar_contribuyente: false,
  borrar_contribuyente: false,
  gestionar_pagos: false,
  anular_pagos: false,
  anular_facturas: false,
  caja_tasa_personalizada: false,
  ver_reportes: false,
  gestionar_usuarios: false,
};

export default function TrabajadoresPage() {
  const [trabajadores, setTrabajadores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchTrabajadores();
  }, []);

  const fetchTrabajadores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('trabajadores').select('*').order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        setTrabajadores(data);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error al cargar trabajadores: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  const handleEdit = (trabajador: any) => {
    setFormData({ ...trabajador });
    setIsEditing(true);
  };

  const handleAdd = () => {
    setFormData({
      id: null,
      nombre: '',
      cedula: '',
      correo: '',
      usuario: '',
      clave: '',
      rol: 'Taquilla / Operador',
      estado: 'Activo',
      letra: '',
      permisos: { ...defaultPermissions }
    });
    setIsEditing(true);
    setErrorMsg('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');

    try {
      // Validar que la letra no este duplicada en otro trabajador activo
      if (formData.letra && formData.letra.trim()) {
        const { data: letraExistente } = await supabase
          .from('trabajadores')
          .select('id, nombre, letra')
          .eq('letra', formData.letra.trim().toUpperCase())
          .neq('id', formData.id || '')
          .eq('estado', 'Activo')
          .maybeSingle();
        if (letraExistente) {
          setErrorMsg(`La letra '${formData.letra.toUpperCase()}' ya está asignada al trabajador: ${letraExistente.nombre}. Cada trabajador activo debe tener una letra única.`);
          setIsSaving(false);
          return;
        }
      }

      const payload = {
        nombre: formData.nombre,
        cedula: formData.cedula,
        correo: formData.correo,
        usuario: formData.usuario,
        clave: formData.clave,
        rol: formData.rol,
        estado: formData.estado,
        letra: formData.letra || '',
        permisos: formData.permisos
      };

      if(formData.id) {
        // Update
        const { error } = await supabase.from('trabajadores').update(payload).eq('id', formData.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from('trabajadores').insert([payload]);
        if (error) throw error;
      }

      await fetchTrabajadores();
      setIsEditing(false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error al guardar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRoleChange = (role: string) => {
    let newPerms = { ...formData.permisos };
    if (role === 'Administrador') {
      Object.keys(newPerms).forEach(k => newPerms[k as keyof typeof newPerms] = true);
    } else if (role === 'Auditor') {
      Object.keys(newPerms).forEach(k => newPerms[k as keyof typeof newPerms] = false);
      newPerms.ver_reportes = true;
    } else if (role === 'Taquilla / Operador') {
      Object.keys(newPerms).forEach(k => newPerms[k as keyof typeof newPerms] = false);
      newPerms.crear_contribuyente = true;
      newPerms.gestionar_pagos = true;
    } else if (role === 'Supervisor') {
      Object.keys(newPerms).forEach(k => newPerms[k as keyof typeof newPerms] = true);
      newPerms.borrar_contribuyente = false;
      newPerms.gestionar_usuarios = false;
    } else if (role === 'Operador de Censo') {
      Object.keys(newPerms).forEach(k => newPerms[k as keyof typeof newPerms] = false);
      newPerms.crear_contribuyente = true;
    }
    setFormData({ ...formData, rol: role, permisos: newPerms });
  };

  const togglePermission = (key: string) => {
    setFormData({
      ...formData,
      permisos: {
        ...formData.permisos,
        [key]: !formData.permisos[key]
      }
    });
  };

  const columns = [
    { key: 'nombre', header: 'Nombre Completo' },
    { key: 'usuario', header: 'Usuario' },
    { key: 'letra', header: 'Letra', render: (row: any) => (
      <span className="font-bold text-slate-700">{row.letra || '-'}</span>
    )},
    { key: 'rol', header: 'Rol', render: (row: any) => (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${row.rol === 'Administrador' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
        {row.rol}
      </span>
    )},
    { key: 'estado', header: 'Estado', render: (row: any) => (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${row.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {row.estado}
      </span>
    )},
    { key: 'actions', header: 'Acciones', render: (row: any) => (
      <button onClick={() => handleEdit(row)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded border border-slate-300">
        Ver / Editar
      </button>
    )}
  ];

  const permisosList = [
    { key: 'crear_contribuyente', label: 'Crear Contribuyentes', desc: 'Permite registrar nuevos contribuyentes en el sistema.' },
    { key: 'editar_contribuyente', label: 'Editar Contribuyentes', desc: 'Permite modificar datos o configurar condominios.' },
    { key: 'borrar_contribuyente', label: 'Eliminar Contribuyentes', desc: 'Permite borrar registros permanentemente.' },
    { key: 'gestionar_pagos', label: 'Procesar Pagos', desc: 'Permite registrar cobros y convenios de pago.' },
    { key: 'anular_pagos', label: 'Anular Recibos', desc: 'Permite revertir pagos ya procesados.' },
    { key: 'anular_facturas', label: 'Anular Recibos', desc: 'Permite anular recibos emitidas.' },
    { key: 'caja_tasa_personalizada', label: 'Aplicar Tasa BCV Manual (Caja)', desc: 'Permite editar la tasa BCV manualmente al cobrar en Caja.' },
    { key: 'ver_reportes', label: 'Ver Reportes', desc: 'Acceso a los reportes financieros e informes.' },
    { key: 'gestionar_usuarios', label: 'Gestionar Trabajadores', desc: 'Permite crear o editar accesos al sistema.' },
  ];

  if (isEditing) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Shield className="w-6 h-6 text-slate-700" />
            <h1 className="text-xl font-semibold text-slate-800 uppercase tracking-wide">
              {formData.nombre ? 'Editar Trabajador' : 'Nuevo Trabajador'}
            </h1>
          </div>
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase border-b border-slate-100 pb-2 mb-4">Datos Básicos</h2>
              
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Nombre Completo</label>
                <input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>
              
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Cédula</label>
                <input required type="text" value={formData.cedula} onChange={e => setFormData({...formData, cedula: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Correo Electrónico</label>
                <input required type="email" value={formData.correo} onChange={e => setFormData({...formData, correo: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Nombre de Usuario</label>
                <input required type="text" value={formData.usuario} onChange={e => setFormData({...formData, usuario: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>
              
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Contraseña (Opcional)</label>
                <input type="password" placeholder="********" value={formData.clave || ''} onChange={e => setFormData({...formData, clave: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Estado de la Cuenta</label>
                <select value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500">
                  <option value="Activo">Activo</option>
                  <option value="Suspendido">Suspendido</option>
                </select>
              </div>
              
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Letra Identificadora (Caja / Auditoría)</label>
                <input type="text" maxLength={1} placeholder="Ej: A, B, F..." value={formData.letra || ''} onChange={e => setFormData({...formData, letra: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 font-bold text-center uppercase" />
                <span className="text-[10px] text-slate-400 mt-1 block">Aparecerá en los recibos impresos (ej. Caja: F-OMAR)</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase">Rol y Permisos</h2>
                <div className="w-1/2">
                  <select value={formData.rol} onChange={e => handleRoleChange(e.target.value)} className="w-full border-2 border-blue-200 bg-blue-50 rounded px-3 py-1.5 text-sm font-semibold text-blue-800 outline-none focus:border-blue-500">
                    <option value="Administrador">Administrador</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Taquilla / Operador">Taquilla / Operador</option>
                    <option value="Operador de Censo">Operador de Censo</option>
                    <option value="Auditor">Auditor</option>
                    <option value="Personalizado">Personalizado</option>
                  </select>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-6">Activa o desactiva los módulos a los que este trabajador tendrá acceso. Al seleccionar un Rol predeterminado arriba, se auto-configurarán estos permisos.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {permisosList.map(perm => (
                  <div 
                    key={perm.key} 
                    className={`flex items-start gap-3 p-3 rounded-lg border ${formData.permisos[perm.key] ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-white'} cursor-pointer hover:border-blue-300 transition-colors`}
                    onClick={() => {
                      togglePermission(perm.key);
                      if (formData.rol !== 'Personalizado') setFormData((prev: any) => ({...prev, rol: 'Personalizado'}));
                    }}
                  >
                    <div className="mt-0.5">
                      {formData.permisos[perm.key] ? (
                        <ShieldCheck className="w-5 h-5 text-blue-600" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-slate-300" />
                      )}
                    </div>
                    <div>
                      <h4 className={`text-xs font-bold ${formData.permisos[perm.key] ? 'text-blue-800' : 'text-slate-600'}`}>{perm.label}</h4>
                      <p className="text-[10px] text-slate-500 mt-1">{perm.desc}</p>
                    </div>
                    <div className="ml-auto">
                      <div className={`w-8 h-4 rounded-full flex items-center p-0.5 transition-colors ${formData.permisos[perm.key] ? 'bg-blue-600' : 'bg-slate-300'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${formData.permisos[perm.key] ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4 border border-red-200">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded shadow flex items-center gap-2 font-medium transition-colors disabled:opacity-50">
                {isSaving ? <AlertCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 
                {isSaving ? 'Guardando...' : 'Guardar Trabajador'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-slate-700" />
          <h1 className="text-xl font-semibold text-slate-800 uppercase tracking-wide">
            Gestión de Trabajadores
          </h1>
        </div>
        
        <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow text-sm font-medium flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> Nuevo Trabajador
        </button>
      </div>
      
      {errorMsg && (
        <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4 border border-red-200">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-slate-500">Cargando trabajadores...</div>
      ) : (
        <DataTable data={trabajadores} columns={columns} itemsPerPage={10} />
      )}
    </div>
  );
}

