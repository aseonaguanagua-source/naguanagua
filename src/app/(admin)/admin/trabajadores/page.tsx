'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Save,
  ArrowLeft,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  CheckSquare,
  Square,
  UserCheck,
  Building2,
  Receipt,
  CreditCard,
  FileSpreadsheet,
  FileCheck,
  ClipboardList,
  MapPin,
  Handshake,
  Award,
  Calculator,
  TreePine,
  Inbox,
  Truck,
  BarChart3,
  Mail,
  Lock,
  Search
} from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export interface PermisoItem {
  key: string;
  label: string;
  desc?: string;
}

export interface ModuloPermisos {
  id: string;
  nombre: string;
  descripcion: string;
  icon: any;
  permisos: PermisoItem[];
}

// ── Módulos y permisos 100% adaptados a la operatividad real de Naguanagua ──
export const MODULOS_SISTEMA: ModuloPermisos[] = [
  {
    id: 'contribuyentes',
    nombre: 'Contribuyentes y Fichas',
    descripcion: 'Gestión de personas naturales y jurídicas registradas en el municipio.',
    icon: Users,
    permisos: [
      { key: 'ver_contribuyentes', label: 'Ver Contribuyentes' },
      { key: 'crear_contribuyente', label: 'Registrar Contribuyentes' },
      { key: 'editar_contribuyente', label: 'Editar Contribuyentes' },
      { key: 'borrar_contribuyente', label: 'Eliminar Contribuyentes' },
      { key: 'ver_contribuyentes_lectura', label: 'Ver Contribuyentes (Solo Lectura)' },
      { key: 'editar_inmuebles_catastro', label: 'Editar Inmuebles y Catastro' },
      { key: 'exportar_contribuyentes', label: 'Exportar Listado de Contribuyentes' },
    ]
  },
  {
    id: 'caja',
    nombre: 'Caja y Taquilla de Cobro',
    descripcion: 'Operaciones de caja presencial, débito, punto de venta y cobro móvil.',
    icon: Receipt,
    permisos: [
      { key: 'ver_caja', label: 'Ver Caja (Acceso)' },
      { key: 'gestionar_pagos', label: 'Procesar Cobros en Caja' },
      { key: 'caja_tasa_personalizada', label: 'Editar Tasa BCV Manual en Caja' },
      { key: 'caja_crear_saldo', label: 'Crear Notas de Crédito / Saldos Manuales' },
      { key: 'caja_eliminar_multas', label: 'Eliminar Multas e Intereses en Cobro' },
      { key: 'caja_aplicar_descuentos', label: 'Aplicar Descuentos y Exoneraciones' },
      { key: 'caja_saltar_validacion', label: 'Saltar Validación de Facturas' },
      { key: 'caja_reimprimir_recibo', label: 'Reimprimir Comprobantes de Caja' },
    ]
  },
  {
    id: 'conciliacion',
    nombre: 'Conciliación Bancaria',
    descripcion: 'Verificación de transferencias, pago móvil y depósitos bancarios.',
    icon: CreditCard,
    permisos: [
      { key: 'ver_conciliacion', label: 'Ver Conciliación Bancaria' },
      { key: 'aprobar_conciliacion', label: 'Aprobar y Conciliar Pagos' },
      { key: 'rechazar_conciliacion', label: 'Rechazar Pagos No Conciliados' },
      { key: 'editar_pago_conciliacion', label: 'Editar Referencias y Montos de Pago' },
    ]
  },
  {
    id: 'estado_cuenta',
    nombre: 'Estado de Cuenta y Recibos',
    descripcion: 'Consulta de deudas periódicas, emisión y anulación de recibos municipales.',
    icon: FileSpreadsheet,
    permisos: [
      { key: 'ver_estado_cuenta', label: 'Ver Estado de Cuenta' },
      { key: 'emitir_recibos', label: 'Emitir Recibos Mensuales' },
      { key: 'anular_facturas', label: 'Anular Recibos Emitidos' },
      { key: 'marcar_pagado_manual', label: 'Marcar como Pagado Manualmente' },
      { key: 'descargar_pdf_ec', label: 'Descargar / Imprimir Estado de Cuenta' },
    ]
  },
  {
    id: 'condominios',
    nombre: 'Condominios COB',
    descripcion: 'Manejo de conjuntos residenciales, filiales, unidades y cobro masivo.',
    icon: Building2,
    permisos: [
      { key: 'ver_condominios', label: 'Ver Módulo Condominios' },
      { key: 'vincular_unidades_condo', label: 'Registrar y Vincular Unidades / Apartamentos' },
      { key: 'ajustar_deuda_condo', label: 'Ajustar Deudas de Condominio' },
      { key: 'cobro_masivo_condo', label: 'Procesar Cobro Masivo a Condominios' },
    ]
  },
  {
    id: 'censo',
    nombre: 'Censo de Campo y Catastro',
    descripcion: 'Levantamiento territorial de inmuebles con mapa GPS en Naguanagua.',
    icon: MapPin,
    permisos: [
      { key: 'ver_censo', label: 'Ver Módulo de Censo' },
      { key: 'registrar_censo', label: 'Registrar Levantamiento con Mapa / GPS' },
      { key: 'aprobar_censo', label: 'Validar y Aprobar Fichas de Censo' },
      { key: 'exportar_censo', label: 'Exportar Registros de Censo' },
    ]
  },
  {
    id: 'pre_registros',
    nombre: 'Pre-Registros Web',
    descripcion: 'Aprobación de solicitudes creadas por ciudadanos desde el portal web.',
    icon: ClipboardList,
    permisos: [
      { key: 'ver_pre_registros', label: 'Ver Pre-registros Web' },
      { key: 'aprobar_pre_registro', label: 'Aprobar y Crear Contribuyente' },
      { key: 'rechazar_pre_registro', label: 'Rechazar Solicitudes Web' },
    ]
  },
  {
    id: 'convenios',
    nombre: 'Convenios de Pago',
    descripcion: 'Suscripción de acuerdos de financiamiento en cuotas.',
    icon: Handshake,
    permisos: [
      { key: 'ver_convenios', label: 'Ver Convenios de Pago' },
      { key: 'crear_convenio', label: 'Crear Nuevo Convenio de Pago' },
      { key: 'anular_convenio', label: 'Cancelar / Anular Convenio' },
    ]
  },
  {
    id: 'certificados',
    nombre: 'Certificados y Solvencias',
    descripcion: 'Emisión y verificación de certificados de solvencia municipal.',
    icon: Award,
    permisos: [
      { key: 'ver_certificados', label: 'Ver Certificados de Pago' },
      { key: 'emitir_solvencia', label: 'Emitir Certificado / Solvencia Municipal' },
      { key: 'anular_solvencia', label: 'Anular Certificado de Solvencia' },
    ]
  },
  {
    id: 'tarifas',
    nombre: 'Tarifas y Parámetros Económicos',
    descripcion: 'Configuración de ordenanzas, alícuotas, UCD, tasa BCV y multas.',
    icon: Calculator,
    permisos: [
      { key: 'ver_tarifas', label: 'Ver Tarifas y Ordenanza' },
      { key: 'editar_tarifas', label: 'Editar Tarifas Residencial, Comercial e Industrial' },
      { key: 'editar_tasa_bcv', label: 'Modificar Tasa BCV y Factor UCD' },
      { key: 'editar_retenciones_interes', label: 'Editar Retenciones, Multas e Intereses' },
      { key: 'usar_calculadora_deuda', label: 'Calcular Deuda y Simular Trámites' },
    ]
  },
  {
    id: 'servicios_especiales',
    nombre: 'Servicios Especiales y Ambiente',
    descripcion: 'Permisos de tala/poda, vistos buenos ambientales y servicios extraordinarios.',
    icon: TreePine,
    permisos: [
      { key: 'ver_servicios_especiales', label: 'Ver Servicios Especiales y Visto Bueno' },
      { key: 'gestionar_visto_bueno', label: 'Gestionar Visto Bueno Ambiental' },
      { key: 'gestionar_tala_poda', label: 'Gestionar Permisos de Tala y Poda' },
      { key: 'facturar_servicio_especial', label: 'Registrar y Facturar Servicio Especial' },
    ]
  },
  {
    id: 'buzon_denuncias',
    nombre: 'Buzón y Denuncias Ciudadanas',
    descripcion: 'Atención de reclamos, quejas ambientales y solicitudes de vecinos.',
    icon: Inbox,
    permisos: [
      { key: 'ver_buzon', label: 'Ver Buzón de Solicitudes y Reclamos' },
      { key: 'responder_buzon', label: 'Responder Solicitudes Ciudadanas' },
      { key: 'ver_denuncias', label: 'Ver Denuncias de la Comunidad' },
      { key: 'gestionar_denuncias', label: 'Gestionar y Resolver Denuncias' },
    ]
  },
  {
    id: 'rutas_operativos',
    nombre: 'Rutas y Operativos de Aseo',
    descripcion: 'Cronogramas de recolección de desechos y jornadas comunitarias.',
    icon: Truck,
    permisos: [
      { key: 'ver_rutas', label: 'Ver Rutas y Horarios de Aseo' },
      { key: 'editar_rutas', label: 'Modificar / Crear Rutas de Camiones' },
      { key: 'planificar_jornadas', label: 'Planificar Jornadas de Campo' },
    ]
  },
  {
    id: 'reportes_auditoria',
    nombre: 'Reportes y Auditoría Forense',
    descripcion: 'Informes de recaudación, morosidad y bitácora inmutable de trazabilidad.',
    icon: BarChart3,
    permisos: [
      { key: 'ver_reportes', label: 'Ver Reportes Financieros' },
      { key: 'exportar_reportes', label: 'Exportar Reportes a Excel' },
      { key: 'ver_auditoria', label: 'Acceso a Auditoría (Logs de Personal)' },
      { key: 'inspeccionar_auditoria', label: 'Inspeccionar Trazabilidad Forense de Operadores' },
    ]
  },
  {
    id: 'correos',
    nombre: 'Correos Informativos',
    descripcion: 'Envío de comunicados oficiales y avisos de cobro por correo electrónico.',
    icon: Mail,
    permisos: [
      { key: 'ver_correos', label: 'Ver Módulo de Correos' },
      { key: 'enviar_comunicados', label: 'Enviar Comunicados Masivos' },
    ]
  },
  {
    id: 'trabajadores_seguridad',
    nombre: 'Personal y Seguridad del Sistema',
    descripcion: 'Control de cuentas de trabajadores, letras de caja y permisos de acceso.',
    icon: Lock,
    permisos: [
      { key: 'gestionar_usuarios', label: 'Ver y Gestionar Trabajadores' },
      { key: 'editar_permisos_roles', label: 'Editar Permisos y Roles de Personal' },
      { key: 'asignar_letra_caja', label: 'Asignar Letra Identificadora de Caja' },
      { key: 'suspender_trabajador', label: 'Suspender / Activar Acceso al Sistema' },
    ]
  },
];

// Obtener todas las claves de permisos
const TODAS_LAS_CLAVES = MODULOS_SISTEMA.flatMap(m => m.permisos.map(p => p.key));

// Permisos predeterminados por Rol
const ROL_PRESETS: Record<string, string[]> = {
  Administrador: [...TODAS_LAS_CLAVES],
  Supervisor: TODAS_LAS_CLAVES.filter(k => 
    !['borrar_contribuyente', 'suspender_trabajador', 'editar_permisos_roles'].includes(k)
  ),
  'Taquilla / Operador': [
    'ver_caja',
    'gestionar_pagos',
    'caja_reimprimir_recibo',
    'ver_contribuyentes_lectura',
    'ver_estado_cuenta',
    'descargar_pdf_ec',
    'ver_condominios',
    'cobro_masivo_condo',
    'ver_reportes',
    'ver_certificados',
    'emitir_solvencia',
  ],
  'Operador de Censo': [
    'ver_censo',
    'registrar_censo',
    'ver_contribuyentes_lectura',
    'planificar_jornadas',
    'ver_rutas'
  ],
  Auditor: [
    'ver_reportes',
    'exportar_reportes',
    'ver_auditoria',
    'inspeccionar_auditoria',
    'ver_contribuyentes_lectura',
    'ver_estado_cuenta',
    'descargar_pdf_ec',
    'ver_certificados'
  ],
  Personalizado: []
};

export default function TrabajadoresPage() {
  const [trabajadores, setTrabajadores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchTable, setSearchTable] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  useEffect(() => {
    fetchTrabajadores();
  }, []);

  const fetchTrabajadores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('trabajadores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTrabajadores(data || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error al cargar trabajadores: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (trabajador: any) => {
    const rawPerms = trabajador.permisos || {};
    // Normalizar objeto de permisos
    const permsNormalizados: Record<string, boolean> = {};
    TODAS_LAS_CLAVES.forEach(k => {
      permsNormalizados[k] = Boolean(rawPerms[k]);
    });

    setFormData({
      ...trabajador,
      permisos: permsNormalizados
    });
    setIsEditing(true);
    setErrorMsg('');
  };

  const handleAdd = () => {
    const permsInitial: Record<string, boolean> = {};
    ROL_PRESETS['Taquilla / Operador'].forEach(k => {
      permsInitial[k] = true;
    });

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
      permisos: permsInitial
    });
    setIsEditing(true);
    setErrorMsg('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');

    try {
      // Validar que la letra no esté duplicada en otro trabajador activo
      if (formData.letra && formData.letra.trim()) {
        const { data: letraExistente } = await supabase
          .from('trabajadores')
          .select('id, nombre, letra')
          .eq('letra', formData.letra.trim().toUpperCase())
          .neq('id', formData.id || '')
          .eq('estado', 'Activo')
          .maybeSingle();

        if (letraExistente) {
          setErrorMsg(
            `La letra '${formData.letra.toUpperCase()}' ya está asignada al trabajador: ${letraExistente.nombre}. Cada trabajador activo debe tener una letra única de caja.`
          );
          setIsSaving(false);
          return;
        }
      }

      const payload = {
        nombre: (formData.nombre || '').trim(),
        cedula: (formData.cedula || '').trim(),
        correo: (formData.correo || '').trim(),
        usuario: (formData.usuario || '').trim(),
        clave: (formData.clave || '').trim(),
        rol: formData.rol,
        estado: formData.estado,
        letra: (formData.letra || '').trim().toUpperCase(),
        permisos: formData.permisos
      };

      const performSave = async (dataPayload: any) => {
        let res = formData.id
          ? await supabase.from('trabajadores').update(dataPayload).eq('id', formData.id)
          : await supabase.from('trabajadores').insert([dataPayload]);

        if (res.error && (res.error.code === '42703' || res.error.message?.includes('schema cache'))) {
          // Si PostgREST todavía tuviera en caché alguna columna, reintentar adaptativamente
          const safe: any = {
            nombre: dataPayload.nombre,
            usuario: dataPayload.usuario,
            clave: dataPayload.clave,
            rol: dataPayload.rol,
            estado: dataPayload.estado,
            letra: dataPayload.letra
          };
          if (!res.error.message?.includes('cedula')) safe.cedula = dataPayload.cedula;
          if (!res.error.message?.includes('correo')) safe.correo = dataPayload.correo;
          if (!res.error.message?.includes('permisos')) safe.permisos = dataPayload.permisos;

          res = formData.id
            ? await supabase.from('trabajadores').update(safe).eq('id', formData.id)
            : await supabase.from('trabajadores').insert([safe]);
        }
        return res;
      };

      const res = await performSave(payload);
      if (res.error) throw res.error;

      if (formData.id) {
        await logAudit(
          `Modificación de Permisos y Datos de Trabajador: ${formData.nombre}`,
          { trabajador_usuario: formData.usuario, rol: formData.rol, letra: payload.letra },
          'CONFIGURACION',
          'ALTA'
        );
      } else {
        await logAudit(
          `Creación de Nuevo Trabajador: ${formData.nombre}`,
          { trabajador_usuario: formData.usuario, rol: formData.rol, letra: payload.letra },
          'CONFIGURACION',
          'ALTA'
        );
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
    if (role === 'Personalizado') {
      setFormData((prev: any) => ({ ...prev, rol: role }));
      return;
    }

    const presetKeys = ROL_PRESETS[role] || [];
    const newPerms: Record<string, boolean> = {};
    TODAS_LAS_CLAVES.forEach(k => {
      newPerms[k] = presetKeys.includes(k);
    });

    setFormData((prev: any) => ({
      ...prev,
      rol: role,
      permisos: newPerms
    }));
  };

  const togglePermission = (key: string) => {
    setFormData((prev: any) => {
      const nextPerms = {
        ...prev.permisos,
        [key]: !prev.permisos[key]
      };
      return {
        ...prev,
        rol: 'Personalizado',
        permisos: nextPerms
      };
    });
  };

  const toggleModulo = (modulo: ModuloPermisos) => {
    const keysModulo = modulo.permisos.map(p => p.key);
    const estanTodosActivos = keysModulo.every(k => Boolean(formData.permisos[k]));

    setFormData((prev: any) => {
      const nextPerms = { ...prev.permisos };
      keysModulo.forEach(k => {
        nextPerms[k] = !estanTodosActivos;
      });
      return {
        ...prev,
        rol: 'Personalizado',
        permisos: nextPerms
      };
    });
  };

  const selectAllGlobal = (activar: boolean) => {
    setFormData((prev: any) => {
      const nextPerms: Record<string, boolean> = {};
      TODAS_LAS_CLAVES.forEach(k => {
        nextPerms[k] = activar;
      });
      return {
        ...prev,
        rol: activar ? 'Administrador' : 'Personalizado',
        permisos: nextPerms
      };
    });
  };

  // Conteo total de permisos activos
  const totalPermisosActivos = useMemo(() => {
    if (!formData?.permisos) return 0;
    return Object.values(formData.permisos).filter(Boolean).length;
  }, [formData?.permisos]);

  const todosGlobalmenteActivos = totalPermisosActivos === TODAS_LAS_CLAVES.length;

  // Filtrado de tabla
  const filteredTrabajadores = useMemo(() => {
    if (!searchTable.trim()) return trabajadores;
    const s = searchTable.toLowerCase().trim();
    return trabajadores.filter(t =>
      (t.nombre || '').toLowerCase().includes(s) ||
      (t.usuario || '').toLowerCase().includes(s) ||
      (t.cedula || '').toLowerCase().includes(s) ||
      (t.letra || '').toLowerCase().includes(s) ||
      (t.rol || '').toLowerCase().includes(s)
    );
  }, [trabajadores, searchTable]);

  const columns = [
    {
      key: 'nombre',
      header: 'Trabajador',
      render: (row: any) => (
        <div>
          <span className="font-bold text-slate-800 text-xs block">{row.nombre}</span>
          <span className="text-[10px] text-slate-400 font-mono">C.I. {row.cedula || 'N/A'}</span>
        </div>
      )
    },
    {
      key: 'usuario',
      header: 'Usuario',
      render: (row: any) => (
        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
          {row.usuario}
        </span>
      )
    },
    {
      key: 'letra',
      header: 'Letra Caja',
      render: (row: any) => (
        row.letra ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-black text-xs border border-indigo-200">
            {row.letra}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )
      )
    },
    {
      key: 'rol',
      header: 'Rol',
      render: (row: any) => (
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
          row.rol === 'Administrador'
            ? 'bg-purple-100 text-purple-700 border border-purple-200'
            : row.rol === 'Supervisor'
            ? 'bg-amber-100 text-amber-800 border border-amber-200'
            : row.rol === 'Auditor'
            ? 'bg-slate-100 text-slate-700 border border-slate-300'
            : 'bg-blue-100 text-blue-700 border border-blue-200'
        }`}>
          {row.rol}
        </span>
      )
    },
    {
      key: 'permisos',
      header: 'Permisos Activos',
      render: (row: any) => {
        const activos = Object.values(row.permisos || {}).filter(Boolean).length;
        return (
          <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="font-black text-indigo-600">{activos}</span> de {TODAS_LAS_CLAVES.length}
          </span>
        );
      }
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (row: any) => (
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
          row.estado === 'Activo'
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            : 'bg-rose-100 text-rose-700 border border-rose-200'
        }`}>
          {row.estado}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row: any) => (
        <button
          onClick={() => handleEdit(row)}
          className="text-xs font-bold bg-white hover:bg-indigo-600 text-slate-700 hover:text-white px-3 py-1 rounded border border-slate-300 hover:border-indigo-600 transition-colors shadow-2xs"
        >
          Editar Permisos
        </button>
      )
    }
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA DE FORMULARIO / EDICIÓN CON MATRIZ DE PERMISOS
  // ══════════════════════════════════════════════════════════════════════════
  if (isEditing) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
        {/* Cabecera Superior */}
        <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-200 gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEditing(false)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
              title="Volver al listado"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">
                {formData.id ? `Editar Trabajador: ${formData.nombre}` : 'Registrar Nuevo Trabajador'}
              </h1>
              <p className="text-xs text-slate-500">
                Configure las credenciales de acceso y asigne los permisos por módulo en el sistema municipal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all disabled:opacity-50"
            >
              {isSaving ? <AlertCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 text-red-700 p-3.5 rounded-xl text-xs font-semibold border border-red-200 flex items-center gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Fila Superior: Datos Básicos + Rol y Letra */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                Datos Básicos y Rol Institucional
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Plantilla de Rol:</span>
                <select
                  value={formData.rol}
                  onChange={e => handleRoleChange(e.target.value)}
                  className="border-2 border-indigo-200 bg-indigo-50/50 rounded-lg px-3 py-1.5 text-xs font-bold text-indigo-800 outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                >
                  <option value="Administrador">Administrador (Todos los módulos)</option>
                  <option value="Supervisor">Supervisor (Operación completa sin borrado)</option>
                  <option value="Taquilla / Operador">Taquilla / Operador de Caja</option>
                  <option value="Operador de Censo">Operador de Censo / Campo</option>
                  <option value="Auditor">Auditor (Solo Reportes e Inspección)</option>
                  <option value="Personalizado">Personalizado (Manual)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Nombre Completo</label>
                <input
                  required
                  type="text"
                  placeholder="Ej: María González"
                  value={formData.nombre}
                  onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full border border-slate-200 bg-slate-50/50 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Cédula</label>
                <input
                  required
                  type="text"
                  placeholder="Ej: V-18456789"
                  value={formData.cedula}
                  onChange={e => setFormData({ ...formData, cedula: e.target.value })}
                  className="w-full border border-slate-200 bg-slate-50/50 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Correo Electrónico</label>
                <input
                  required
                  type="email"
                  placeholder="usuario@naguanagua.gob.ve"
                  value={formData.correo}
                  onChange={e => setFormData({ ...formData, correo: e.target.value })}
                  className="w-full border border-slate-200 bg-slate-50/50 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Nombre de Usuario</label>
                <input
                  required
                  type="text"
                  placeholder="Ej: mgonzalez"
                  value={formData.usuario}
                  onChange={e => setFormData({ ...formData, usuario: e.target.value })}
                  className="w-full border border-slate-200 bg-slate-50/50 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Contraseña</label>
                <input
                  type="password"
                  placeholder={formData.id ? 'Sin cambios (dejar vacío)' : 'Contraseña segura'}
                  value={formData.clave || ''}
                  onChange={e => setFormData({ ...formData, clave: e.target.value })}
                  className="w-full border border-slate-200 bg-slate-50/50 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Estado</label>
                <select
                  value={formData.estado}
                  onChange={e => setFormData({ ...formData, estado: e.target.value })}
                  className="w-full border border-slate-200 bg-slate-50/50 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                >
                  <option value="Activo">Activo</option>
                  <option value="Suspendido">Suspendido</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-indigo-700 uppercase mb-1 flex items-center justify-between">
                  <span>Letra Identificadora de Caja</span>
                  <span className="text-[10px] text-slate-400 lowercase font-normal">recibos impresos (ej: F-OMAR)</span>
                </label>
                <input
                  type="text"
                  maxLength={1}
                  placeholder="Ej: A, B, C, F..."
                  value={formData.letra || ''}
                  onChange={e => setFormData({ ...formData, letra: e.target.value.toUpperCase() })}
                  className="w-full border-2 border-indigo-200 bg-indigo-50/40 rounded-lg px-3 py-2 text-xs font-black text-indigo-800 text-center uppercase outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* PANEL MATRICIAL DE PERMISOS POR MÓDULO (ESTRUCTURA SOLICITADA)  */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            {/* Barra de Título del Panel de Módulos */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                  Seleccione los módulos y permisos a los que puede acceder
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tiene <span className="font-black text-indigo-600">{totalPermisosActivos}</span> de{' '}
                  <span className="font-semibold text-slate-700">{TODAS_LAS_CLAVES.length}</span> permisos activados
                  para este trabajador en Naguanagua.
                </p>
              </div>

              {/* Botón Seleccionar Todos (Estilo verde de la captura) */}
              <button
                type="button"
                onClick={() => selectAllGlobal(!todosGlobalmenteActivos)}
                className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 shadow-sm transition-all ${
                  todosGlobalmenteActivos
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                    : 'bg-[#a3e635] hover:bg-[#84cc16] text-slate-900 border border-[#84cc16]'
                }`}
              >
                {todosGlobalmenteActivos ? (
                  <>
                    <Square size={14} /> Desmarcar Todos
                  </>
                ) : (
                  <>
                    <CheckSquare size={14} /> Seleccionar Todos
                  </>
                )}
              </button>
            </div>

            {/* Listado de Cajas de Módulos (Exacto al estilo del usuario) */}
            <div className="space-y-3.5">
              {MODULOS_SISTEMA.map(modulo => {
                const ModuleIcon = modulo.icon;
                const keysModulo = modulo.permisos.map(p => p.key);
                const activosEnModulo = keysModulo.filter(k => Boolean(formData.permisos[k])).length;
                const todosActivos = activosEnModulo === keysModulo.length;
                const algunoActivo = activosEnModulo > 0 && !todosActivos;

                return (
                  <div
                    key={modulo.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden transition-all"
                  >
                    {/* Encabezado del Módulo */}
                    <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Checkbox Maestro del Módulo */}
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={todosActivos}
                            ref={el => {
                              if (el) el.indeterminate = algunoActivo;
                            }}
                            onChange={() => toggleModulo(modulo)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-2">
                            <ModuleIcon className="w-4 h-4 text-slate-600" />
                            <span className="font-bold text-slate-800 text-xs tracking-tight">
                              {modulo.nombre}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                              {activosEnModulo}/{keysModulo.length}
                            </span>
                          </div>
                        </label>
                      </div>

                      {/* Botón de texto Seleccionar todos */}
                      <button
                        type="button"
                        onClick={() => toggleModulo(modulo)}
                        className="text-[11px] font-medium italic text-slate-500 hover:text-indigo-600 transition-colors"
                      >
                        {todosActivos ? 'Desmarcar todos' : 'Seleccionar todos'}
                      </button>
                    </div>

                    {/* Grilla de Permisos Granulares */}
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-white">
                      {modulo.permisos.map(perm => {
                        const isChecked = Boolean(formData.permisos[perm.key]);
                        return (
                          <label
                            key={perm.key}
                            className={`flex items-start gap-2.5 p-2 rounded-lg border transition-all cursor-pointer select-none ${
                              isChecked
                                ? 'bg-indigo-50/30 border-indigo-200 text-slate-900 font-semibold'
                                : 'bg-white border-transparent text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePermission(perm.key)}
                              className="w-4 h-4 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                            />
                            <div className="text-xs leading-snug">
                              <span className="block">{perm.label}</span>
                              {perm.desc && (
                                <span className="text-[10px] text-slate-400 font-normal block mt-0.5">
                                  {perm.desc}
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Botón inferior de guardar */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all disabled:opacity-50"
            >
              {isSaving ? <AlertCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Guardando Trabajador...' : 'Guardar y Aplicar Permisos'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA DE LISTADO / TABLA DE TRABAJADORES
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              Gestión de Trabajadores y Permisos
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 tracking-normal border border-indigo-200">
                Alcaldía de Naguanagua
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Administración de cuentas, roles y matriz de permisos granulares por módulo para el personal municipal.
            </p>
          </div>
        </div>

        <button
          onClick={handleAdd}
          className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all"
        >
          <Plus className="w-4 h-4" /> Nuevo Trabajador
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-700 p-3.5 rounded-xl text-xs font-semibold border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          {errorMsg}
        </div>
      )}

      {/* Buscador de la tabla */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            value={searchTable}
            onChange={e => setSearchTable(e.target.value)}
            placeholder="Buscar por nombre, cédula, usuario o letra de caja..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white"
          />
        </div>
        <div className="text-xs text-slate-400">
          <span className="font-bold text-slate-700">{filteredTrabajadores.length}</span> trabajadores registrados
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 space-y-2">
          <AlertCircle className="w-8 h-8 animate-spin mx-auto text-indigo-400" />
          <p className="text-xs font-semibold">Cargando personal municipal...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataTable data={filteredTrabajadores} columns={columns} itemsPerPage={10} />
        </div>
      )}
    </div>
  );
}


