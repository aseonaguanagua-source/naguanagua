'use client';
import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, Calendar, MapPin, Calculator } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import Select from 'react-select';
import { supabase } from '@/lib/supabase';
import dynamic from 'next/dynamic';

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function CensoMobilePage() {
  const { ordenanzasConfig: ordenanzaData } = useAppContext();
  const todasLasActividades = [...ordenanzaData.actividadesComerciales, ...ordenanzaData.actividadesIndustriales];

  const [operador, setOperador] = useState<string>('Operador');
  
  useEffect(() => {
    const op = localStorage.getItem('operador_censo_auth');
    if(op) setOperador(op);
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Calculation states
  const [isCalculating, setIsCalculating] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);
  const [bcvRate, setBcvRate] = useState<string | null>(null);
  const [bcvDate, setBcvDate] = useState<string>('');
  const [calculoDetalle, setCalculoDetalle] = useState<any>(null);
  
  const [formData, setFormData] = useState<any>({
    IdentidadTipo: 'V',
    IdentidadNumero: '',
    Contribuyente: '',
    NombreComercial: '',
    telefonoPrefijo: '0414',
    telefonoNumero: '',
    correoNombre: '',
    correoDominio: '@gmail.com',
    correoDominioOtro: '',
    Direccion: '',
    DireccionExacta: '',
    coordenadas: null,
    Clasificacion: 'Residencial',
    TipoResidencia: ordenanzaData.tiposResidenciales[0].label,
    ActividadComercial: '',
    NivelMetraje: ordenanzaData.nivelesMetraje[0],
    isCondominio: false,
    cantidadInmuebles: 0,
    locales: [],
    NumeroPatente: '',
    FichaCatastral: '',
    Nota: '',
    FechaInicioActividad: new Date().toISOString().split('T')[0]
  });

  const generarLocales = () => {
    const val = formData.cantidadInmuebles || 0;
    const currentLocales = formData.locales || [];
    let newLocales = [...currentLocales];
    
    if (val > currentLocales.length) {
      for (let i = currentLocales.length; i < val; i++) {
        newLocales.push({
          id: `local-${i}-${Date.now()}`,
          numeracion: `Inmueble ${i + 1}`,
          uso: (formData.Clasificacion === 'Comercial' || formData.Clasificacion === 'Industrial') ? 'Comercial' : 'Residencial',
          estatus: 'Desocupado',
          actividad: '',
          nivel: ordenanzaData.nivelesMetraje[0],
          tipoResidencia: ordenanzaData.tiposResidenciales[0].label,
          nombreContribuyente: '',
          documentoIdentidadTipo: 'V',
          documentoIdentidadNumero: '',
          catastro: '',
          patente: ''
        });
      }
    } else {
      newLocales = newLocales.slice(0, val);
    }
    setFormData({...formData, locales: newLocales});
  };

  const calcularTarifa = async () => {
    setIsCalculating(true);
    try {
      // Fetch BCV
      const res = await fetch('/api/bcv');
      const data = await res.json();
      
      const tasaTruncada = (Math.trunc(data.tcmmv * 100) / 100).toFixed(2);
      setBcvRate(tasaTruncada);
      setBcvDate(new Date(data.timestamp).toLocaleString());

      // Find factor
      let factorTotal = 0;
      let leyenda = '';
      const desgloseLocales: any[] = [];

      if (formData.isCondominio && formData.locales?.length > 0) {
        leyenda = `Condominio (${formData.cantidadInmuebles} Inmuebles)`;
        formData.locales.forEach((local: any) => {
          let localFactor = 0;
          let localLeyenda = '';

          if (local.uso === 'Residencial') {
            const tipo = ordenanzaData.tiposResidenciales.find(t => t.label === (local.tipoResidencia || formData.TipoResidencia));
            if (tipo) {
              localFactor = tipo.factor;
              localLeyenda = `Tasa Residencial (${tipo.label.substring(0, 25)}...)`;
            }
          } else if (local.uso === 'Comercial') {
            const nivelIndex = ordenanzaData.nivelesMetraje.indexOf(local.nivel || ordenanzaData.nivelesMetraje[0]);
            
            if (local.estatus === 'Desocupado') {
              const actVacio = todasLasActividades.find(a => a.label === 'Inmueble desocupado (vacío)');
              if (actVacio && nivelIndex !== -1) {
                localFactor = actVacio.factores[nivelIndex];
                localLeyenda = `Comercial Desocupado (${local.nivel})`;
              }
            } else {
              const act = todasLasActividades.find(a => a.label === local.actividad);
              if (act && nivelIndex !== -1) {
                localFactor = act.factores[nivelIndex];
                localLeyenda = `Comercial/Ind. Ocupado - ${local.actividad}`;
              }
            }
          }
          
          factorTotal += localFactor;
          
          if (localFactor > 0) {
            desgloseLocales.push({
              numeracion: local.numeracion,
              leyenda: localLeyenda,
              factor: localFactor,
              montoBs: (Math.trunc((localFactor * data.tcmmv) * 100) / 100).toFixed(2)
            });
          }
        });
      } else {
        if (formData.Clasificacion === 'Residencial') {
          const tipo = ordenanzaData.tiposResidenciales.find(t => t.label === formData.TipoResidencia);
          if (tipo) {
            factorTotal = tipo.factor;
            leyenda = `Clasificador de Tasa Residencial: ${tipo.label}`;
          }
        } else {
          const act = todasLasActividades.find(a => a.label === formData.ActividadComercial);
          const nivelIndex = ordenanzaData.nivelesMetraje.indexOf(formData.NivelMetraje);
          if (act && nivelIndex !== -1) {
            factorTotal = act.factores[nivelIndex];
            leyenda = `Tasa Com/Ind: ${act.label} (Nivel: ${formData.NivelMetraje})`;
          }
        }
      }

      const rawTotal = factorTotal * data.tcmmv;
      const totalTruncado = (Math.trunc(rawTotal * 100) / 100).toFixed(2);

      setCalculoDetalle({
        factor: factorTotal,
        leyenda,
        totalBs: totalTruncado,
        fuente: data.source,
        desglose: desgloseLocales
      });
      setShowCalculation(true);
    } catch (e) {
      console.error(e);
    }
    setIsCalculating(false);
  };

  const handleSaveCenso = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const fullTelefono = formData.telefonoPrefijo + formData.telefonoNumero;
      const fullCorreo = formData.correoDominio === 'Otro' ? formData.correoNombre + formData.correoDominioOtro : formData.correoNombre + formData.correoDominio;
      const act = formData.Clasificacion === 'Residencial' ? formData.TipoResidencia : formData.ActividadComercial;
      const finalContribuyente = (formData.NombreComercial && formData.NombreComercial.trim()) ? `${formData.Contribuyente} | Comercial: ${formData.NombreComercial}` : formData.Contribuyente;

      // Save to pre_registros with advanced fields
      const { error } = await supabase.from('pre_registros').insert([{
        identidad: `${formData.IdentidadTipo || 'V'}${formData.IdentidadNumero || ''}`,
        contribuyente: finalContribuyente,
        registro: fullTelefono,
        tipo: formData.Clasificacion,
        actividad: act,
        codigo: formData.Clasificacion === 'Residencial' ? formData.TipoResidencia : formData.NivelMetraje,
        origen: `Censo - ${operador}`,
        fecha_inicio: formData.FechaInicioActividad,
        domicilio_fiscal: formData.Direccion,
        direccion_exacta: formData.DireccionExacta,
        coordenadas: formData.coordenadas,
        is_condominio: formData.isCondominio,
        cantidad_inmuebles: formData.cantidadInmuebles,
        locales: formData.isCondominio ? formData.locales.map((l: any) => ({
          ...l,
          documentoIdentidad: `${l.documentoIdentidadTipo || 'V'}${l.documentoIdentidadNumero || ''}`
        })) : formData.locales,
        nota: [
          formData.NumeroPatente ? `Patente: ${formData.NumeroPatente}` : '',
          formData.FichaCatastral ? `Catastro: ${formData.FichaCatastral}` : '',
          formData.Nota || ''
        ].filter(Boolean).join(' | ')
      }]);

      if (error) throw error;
      
      // Registrar en auditoria (vía servidor: la clave pública no puede insertar)
      await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: operador,
          accion: 'Censo Movil Enviado',
          categoria: 'SISTEMA',
          modulo: '/operador/censo',
          detalles: { _categoria: 'SISTEMA', _modulo: '/operador/censo', operador },
        }),
      }).catch(() => {});

      
      setShowSuccess(true);
      
      // Reset form
      setFormData({
        IdentidadTipo: 'V',
        IdentidadNumero: '',
        Contribuyente: '',
        telefonoPrefijo: '0414',
        telefonoNumero: '',
        correoNombre: '',
        correoDominio: '@gmail.com',
        correoDominioOtro: '',
        Direccion: '',
        DireccionExacta: '',
        coordenadas: null,
        Clasificacion: 'Residencial',
        TipoResidencia: ordenanzaData.tiposResidenciales[0].label,
        ActividadComercial: '',
        NivelMetraje: ordenanzaData.nivelesMetraje[0],
        isCondominio: false,
        cantidadInmuebles: 0,
        locales: [],
        NumeroPatente: '',
        FichaCatastral: '',
        Nota: '',
        FechaInicioActividad: new Date().toISOString().split('T')[0]
      });
      setShowCalculation(false);

      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      alert('Hubo un error al guardar el censo.');
    }
    setIsSaving(false);
  };

  return (
    <div className="p-4 bg-slate-100 min-h-screen">
      <div className="mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-lg font-black text-slate-800 tracking-tight">Formulario de Censo</h1>
        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider">Operador Activo: {operador}</p>
      </div>

      {showSuccess && (
        <div className="mb-4 p-4 bg-green-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-green-500/30">
          <CheckCircle className="w-6 h-6" />
          ¡Enviado a pre-registros correctamente!
        </div>
      )}

      <form onSubmit={handleSaveCenso} className="bg-white p-5 rounded-xl shadow-sm mb-6 border border-slate-200">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Razón Social / Nombre <span className="text-red-500">*</span></label>
            <input type="text" value={formData.Contribuyente} onChange={e => setFormData({...formData, Contribuyente: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-orange-500 focus:bg-white uppercase font-medium transition-all" required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Cédula / RIF <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <select 
                value={formData.IdentidadTipo || 'V'}
                onChange={e => {
                  const newTipo = e.target.value;
                  const maxLength = 10;
                  const newNumero = (formData.IdentidadNumero || '').slice(0, maxLength);
                  setFormData({...formData, IdentidadTipo: newTipo, IdentidadNumero: newNumero});
                }}
                className="w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-orange-500 focus:bg-white uppercase font-medium transition-all"
              >
                <option value="V">V</option>
                <option value="E">E</option>
                <option value="J">J</option>
                <option value="G">G</option>
                <option value="P">P</option>
                <option value="C">C</option>
              </select>
              <input 
                type="text" 
                value={formData.IdentidadNumero || ''} 
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  const maxLength = 10;
                  if (val.length <= maxLength) {
                    setFormData({...formData, IdentidadNumero: val});
                  }
                }} 
                placeholder="12345678" 
                className="w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-orange-500 focus:bg-white uppercase font-medium transition-all" 
                required 
              />
            </div>
          </div>
          
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Teléfono Móvil <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <select value={formData.telefonoPrefijo} onChange={e => setFormData({...formData, telefonoPrefijo: e.target.value})} className="w-1/3 border border-slate-300 rounded px-2 py-2 text-sm text-slate-700 outline-none focus:border-blue-500">
                <option value="0412">0412</option>
                <option value="0414">0414</option>
                <option value="0424">0424</option>
                <option value="0416">0416</option>
                <option value="0426">0426</option>
                <option value="0422">0422</option>
              </select>
              <input type="tel" value={formData.telefonoNumero} onChange={e => setFormData({...formData, telefonoNumero: e.target.value.replace(/\D/g, '')})} placeholder="1234567" maxLength={7} className="w-2/3 border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" required />
            </div>
          </div>
          
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Email <span className="text-red-500">*</span></label>
            <div className="flex gap-1 mb-1">
              <input type="text" value={formData.correoNombre} onChange={e => setFormData({...formData, correoNombre: e.target.value.replace(/\s/g, '')})} placeholder="usuario" className="w-1/2 border border-slate-300 rounded px-2 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" required />
              <select value={formData.correoDominio} onChange={e => setFormData({...formData, correoDominio: e.target.value})} className="w-1/2 border border-slate-300 rounded px-1 py-2 text-sm text-slate-700 outline-none focus:border-blue-500">
                <option value="@gmail.com">@gmail.com</option>
                <option value="@yahoo.com">@yahoo.com</option>
                <option value="@hotmail.com">@hotmail.com</option>
                <option value="@outlook.com">@outlook.com</option>
                <option value="Otro">Otro...</option>
              </select>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] font-medium text-slate-500">Ubicación en el Mapa</label>
              {formData.coordenadas && (
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200 flex items-center gap-1">
                  <MapPin size={10} />
                  Ubicación fijada
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mb-2">Haz clic en el mapa para marcar la ubicación exacta del inmueble. (Auto-completará la dirección)</p>
            <MapPicker 
              position={formData.coordenadas} 
              onLocationSelect={async (loc) => {
                setFormData({...formData, coordenadas: loc});
                try {
                  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`);
                  const data = await res.json();
                  if (data && data.display_name) {
                    setFormData((prev: any) => ({...prev, coordenadas: loc, DireccionExacta: data.display_name}));
                  }
                } catch (err) {
                  console.error('Error in reverse geocoding:', err);
                }
              }} 
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Domicilio fiscal (como aparece en el RIF) <span className="text-red-500">*</span></label>
            <input type="text" value={formData.Direccion} onChange={e => setFormData({...formData, Direccion: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" required />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Dirección Exacta (Punto en el Mapa)</label>
            <input type="text" value={formData.DireccionExacta || ''} onChange={e => setFormData({...formData, DireccionExacta: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Notas / Observaciones</label>
            <textarea value={formData.Nota || ''} onChange={e => setFormData({...formData, Nota: e.target.value})} rows={2} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" placeholder="Añade detalles adicionales o justificaciones aquí..." />
          </div>

          {/* Clasificación de Ordenanza */}
          <div className="md:col-span-2 mt-6 border-t border-slate-200 pt-6">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-4">Clasificación (Según Ordenanza)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-blue-600 mb-1">Clasificación Principal</label>
                <select 
                  value={formData.Clasificacion} 
                  onChange={e => {
                    const val = e.target.value;
                    const updatedLocales = (formData.locales || []).map((loc: any) => ({
                      ...loc,
                      uso: val === 'Residencial' ? 'Residencial' : (val.includes('Comercial') || val === 'Industrial') ? 'Comercial' : loc.uso
                    }));
                    setFormData({
                      ...formData, 
                      Clasificacion: val,
                      TipoResidencia: (val === 'Residencial' || val === 'Mixto') ? (formData.TipoResidencia || ordenanzaData.tiposResidenciales[0].label) : '',
                      ActividadComercial: (val.includes('Comercial') || val === 'Industrial' || val === 'Mixto') ? (formData.ActividadComercial || todasLasActividades[0].label) : '',
                      NivelMetraje: (val.includes('Comercial') || val === 'Industrial' || val === 'Mixto') ? (formData.NivelMetraje || ordenanzaData.nivelesMetraje[0]) : '',
                      locales: updatedLocales
                    });
                  }}
                  className="w-full border border-blue-300 bg-blue-50 rounded px-3 py-2 text-sm text-blue-800 outline-none focus:border-blue-500 font-medium"
                >
                  {ordenanzaData.clasificaciones.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {(formData.Clasificacion === 'Residencial') && !formData.isCondominio && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 mb-1">Tipo de Residencia (Clasificador)</label>
                  <select 
                    value={formData.TipoResidencia || ordenanzaData.tiposResidenciales[0].label} 
                    onChange={e => setFormData({...formData, TipoResidencia: e.target.value})}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  >
                    {ordenanzaData.tiposResidenciales.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                  </select>
                </div>
              )}

              {(formData.Clasificacion?.includes('Comercial') || formData.Clasificacion === 'Industrial' || formData.Clasificacion === 'Mixto') && !formData.isCondominio && (
                <>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Actividad Económica</label>
                    <Select
                      options={todasLasActividades.map(a => ({ value: a.label, label: a.label }))}
                      value={{ value: formData.ActividadComercial, label: formData.ActividadComercial }}
                      onChange={(selected: any) => setFormData({...formData, ActividadComercial: selected?.value || ''})}
                      placeholder="Buscar o seleccionar..."
                      className="text-sm text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Nivel (Rango de Metraje)</label>
                    <select 
                      value={formData.NivelMetraje || ordenanzaData.nivelesMetraje[0]} 
                      onChange={e => setFormData({...formData, NivelMetraje: e.target.value})}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                    >
                      {ordenanzaData.nivelesMetraje.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* CONDOMINIOS */}
            <div className="flex items-center gap-2 mt-4 mb-2">
              <input 
                type="checkbox" 
                id="isCondominio" 
                checked={formData.isCondominio || false}
                onChange={e => setFormData({
                  ...formData, 
                  isCondominio: e.target.checked, 
                  cantidadInmuebles: e.target.checked ? (formData.cantidadInmuebles || 0) : 0,
                  locales: e.target.checked ? (formData.locales || []) : []
                })}
                className="w-4 h-4 text-blue-600 rounded border-slate-300" 
              />
              <label htmlFor="isCondominio" className="text-xs font-medium text-slate-700">Es un Condominio (Contiene múltiples inmuebles)</label>
            </div>

            {/* Catastro y Patente */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wide">Ficha Catastral (Opcional)</label>
                <input
                  type="text"
                  value={formData.FichaCatastral || ''}
                  onChange={e => setFormData({...formData, FichaCatastral: e.target.value})}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  placeholder="Ej. CAT-0001"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wide">Número de Patente (Opcional)</label>
                <input
                  type="text"
                  value={formData.NumeroPatente || ''}
                  onChange={e => setFormData({...formData, NumeroPatente: e.target.value})}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  placeholder="Ej. PAT-9876"
                />
              </div>
            </div>

            {formData.isCondominio && (
              <div className="mt-4 flex items-end gap-3">
                 <div>
                   <label className="block text-[10px] font-medium text-slate-500 mb-1">Cantidad de Locales / Apartamentos</label>
                   <input 
                     type="number" 
                     min="0"
                     max="200"
                     value={formData.cantidadInmuebles || ''}
                     onChange={e => setFormData({...formData, cantidadInmuebles: parseInt(e.target.value) || 0})}
                     className="w-32 border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
                   />
                 </div>
                 <button
                   type="button"
                   onClick={generarLocales}
                   className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors shadow-sm"
                 >
                   Generar Formulario
                 </button>
              </div>
            )}
            
            {formData.isCondominio && formData.cantidadInmuebles > 0 && (
              <div className="mt-4 border border-slate-200 rounded overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Desglose de Inmuebles ({formData.cantidadInmuebles})</h4>
                  <div className="flex items-center gap-1.5">
                    <input 
                      type="checkbox" 
                      id="uniformConfig"
                      checked={formData.uniformConfig || false}
                      onChange={e => setFormData({...formData, uniformConfig: e.target.checked})}
                      className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="uniformConfig" className="text-[10px] font-medium text-slate-600 cursor-pointer uppercase tracking-wide">
                      Asignación Masiva
                    </label>
                  </div>
                </div>

                {formData.uniformConfig && (
                  <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex flex-wrap gap-4 items-end shadow-inner">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-bold text-blue-800 mb-1">Unificar Tipo de Residencia</label>
                      <select 
                        onChange={e => {
                          const val = e.target.value;
                          if(!val) return;
                          const newLocales = formData.locales.map((l: any) => ({
                            ...l,
                            tipoResidencia: l.uso === 'Residencial' ? val : l.tipoResidencia
                          }));
                          setFormData({...formData, locales: newLocales});
                        }}
                        className="w-full border border-blue-200 rounded px-2 py-1.5 text-xs outline-none text-blue-800 bg-white"
                      >
                        <option value="">-- Selecciona para aplicar a todos --</option>
                        {ordenanzaData.tiposResidenciales.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                      </select>
                    </div>
                    {formData.Clasificacion !== 'Residencial' && (
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-[10px] font-bold text-blue-800 mb-1">Unificar Tamaño (Metraje Comercial)</label>
                        <select 
                          onChange={e => {
                            const val = e.target.value;
                            if(!val) return;
                            const newLocales = formData.locales.map((l: any) => ({
                              ...l,
                              nivel: l.uso === 'Comercial' ? val : l.nivel
                            }));
                            setFormData({...formData, locales: newLocales});
                          }}
                          className="w-full border border-blue-200 rounded px-2 py-1.5 text-xs outline-none text-blue-800 bg-white"
                        >
                          <option value="">-- Selecciona para aplicar a todos --</option>
                          {ordenanzaData.nivelesMetraje.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="max-h-[400px] overflow-y-auto p-4 space-y-4 bg-white">
                  {formData.locales?.map((local: any, index: number) => (
                    <div key={local.id || index} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 border border-slate-100 bg-slate-50 rounded items-end">
                       <div>
                         <label className="block text-[10px] font-medium text-slate-500 mb-1">Numeración / Identificador</label>
                         <input type="text" value={local.numeracion} onChange={e => {
                            const newLocales = [...formData.locales];
                            newLocales[index].numeracion = e.target.value;
                            setFormData({...formData, locales: newLocales});
                         }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none" />
                       </div>
                       <div>
                         <label className="block text-[10px] font-medium text-slate-500 mb-1">Uso</label>
                         <select value={local.uso} onChange={e => {
                            const val = e.target.value;
                            const newLocales = [...formData.locales];
                            newLocales[index].uso = val;
                            if(val === 'Residencial') newLocales[index].tipoResidencia = ordenanzaData.tiposResidenciales[0].label;
                            setFormData({...formData, locales: newLocales});
                         }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none">
                           <option value="Residencial">Residencial</option>
                           {(formData.Clasificacion.includes('Comercial') || formData.Clasificacion === 'Industrial' || formData.Clasificacion === 'Mixto') && (
                             <option value="Comercial">Comercial / Industrial</option>
                           )}
                         </select>
                       </div>
                       
                       {local.uso === 'Residencial' ? (
                         <div className="col-span-2">
                           <label className="block text-[10px] font-medium text-slate-500 mb-1">Clasificador Residencial</label>
                           <select value={local.tipoResidencia} onChange={e => {
                              const newLocales = [...formData.locales];
                              newLocales[index].tipoResidencia = e.target.value;
                              setFormData({...formData, locales: newLocales});
                           }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none">
                             {ordenanzaData.tiposResidenciales.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                           </select>
                         </div>
                       ) : (
                         <>
                           <div>
                             <label className="block text-[10px] font-medium text-slate-500 mb-1">Estado</label>
                             <select value={local.estatus} onChange={e => {
                                const newLocales = [...formData.locales];
                                newLocales[index].estatus = e.target.value;
                                setFormData({...formData, locales: newLocales});
                             }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none">
                               <option value="Desocupado">Desocupado</option>
                               <option value="Ocupado">Ocupado / Activo</option>
                             </select>
                           </div>
                           
                           {local.estatus === 'Ocupado' && (
                             <div className="col-span-1 md:col-span-4">
                               <label className="block text-[10px] font-medium text-slate-500 mb-1">Actividad Económica</label>
                               <Select
                                 options={todasLasActividades.map(a => ({ value: a.label, label: a.label }))}
                                 value={{ value: local.actividad, label: local.actividad }}
                                 onChange={(selected: any) => {
                                   const newLocales = [...formData.locales];
                                   newLocales[index].actividad = selected?.value || '';
                                   setFormData({...formData, locales: newLocales});
                                 }}
                                 placeholder="Buscar actividad..."
                                 className="text-xs"
                               />
                             </div>
                           )}
                           
                           <div className="col-span-1 md:col-span-4">
                             <label className="block text-[10px] font-medium text-slate-500 mb-1">Nivel (Metraje Comercial)</label>
                             <select value={local.nivel} onChange={e => {
                                const newLocales = [...formData.locales];
                                newLocales[index].nivel = e.target.value;
                                setFormData({...formData, locales: newLocales});
                             }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none">
                               {ordenanzaData.nivelesMetraje.map(n => <option key={n} value={n}>{n}</option>)}
                             </select>
                           </div>
                         </>
                       )}

                       {/* Nuevos campos de identidad, catastro y patente */}
                       <div className="col-span-1 md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 border-t border-slate-200 pt-3">
                         <div>
                           <label className="block text-[10px] font-medium text-slate-500 mb-1">Cédula / RIF</label>
                           <div className="flex gap-2">
                             <select 
                               value={local.documentoIdentidadTipo || 'V'}
                               onChange={e => {
                                   const newLocales = [...formData.locales];
                                   const newTipo = e.target.value;
                                   const maxLength = 10;
                                   const newNumero = (local.documentoIdentidadNumero || '').slice(0, maxLength);
                                   newLocales[index].documentoIdentidadTipo = newTipo;
                                   newLocales[index].documentoIdentidadNumero = newNumero;
                                   setFormData({...formData, locales: newLocales});
                               }} 
                               className="w-1/3 border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                             >
                               <option value="V">V</option>
                               <option value="E">E</option>
                               <option value="J">J</option>
                               <option value="G">G</option>
                               <option value="P">P</option>
                               <option value="C">C</option>
                             </select>
                             <input 
                               type="text" 
                               value={local.documentoIdentidadNumero || ''} 
                               onChange={e => {
                                   const val = e.target.value.replace(/\D/g, '');
                                   const tipo = local.documentoIdentidadTipo || 'V';
                                   const maxLength = 10;
                                   if (val.length <= maxLength) {
                                     const newLocales = [...formData.locales];
                                     newLocales[index].documentoIdentidadNumero = val;
                                     setFormData({...formData, locales: newLocales});
                                   }
                               }} 
                               className="w-2/3 border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-500" 
                               placeholder="12345678" 
                             />
                           </div>
                         </div>
                         <div>
                           <label className="block text-[10px] font-medium text-slate-500 mb-1">Nombre / Razón Social</label>
                           <input type="text" value={local.nombreContribuyente || ''} onChange={e => {
                               const newLocales = [...formData.locales];
                               newLocales[index].nombreContribuyente = e.target.value.toUpperCase();
                               setFormData({...formData, locales: newLocales});
                           }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-500" placeholder="Nombre completo" />
                         </div>
                         
                         <div>
                           <label className="block text-[10px] font-medium text-slate-500 mb-1">Ficha Catastral Individual</label>
                           <input type="text" value={local.catastro || ''} onChange={e => {
                               const newLocales = [...formData.locales];
                               newLocales[index].catastro = e.target.value;
                               setFormData({...formData, locales: newLocales});
                           }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-500" placeholder="Ej. CAT-0001" />
                         </div>
                         
                         {local.uso !== 'Residencial' && (
                           <div>
                             <label className="block text-[10px] font-medium text-slate-500 mb-1">Número de Patente</label>
                             <input type="text" value={local.patente || ''} onChange={e => {
                                 const newLocales = [...formData.locales];
                                 newLocales[index].patente = e.target.value;
                                 setFormData({...formData, locales: newLocales});
                             }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-500" placeholder="Ej. PAT-123" />
                           </div>
                         )}
                       </div>

                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="md:col-span-2 mt-6 border-t border-slate-200 pt-6">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-4">Datos del Censo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-orange-600 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Fecha Inicio de Actividad Económica <span className="text-red-500">*</span>
                </label>
                <input 
                  type="date" 
                  value={formData.FechaInicioActividad} 
                  onChange={e => setFormData({...formData, FechaInicioActividad: e.target.value})} 
                  className="w-full border border-orange-300 bg-orange-50 rounded px-3 py-2 text-sm text-orange-800 outline-none focus:border-orange-500" 
                  required 
                />
                <p className="text-[10px] text-slate-500 mt-1">Se usará para calcular la deuda retroactiva al aprobar este registro.</p>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 mt-4 mb-4">
            <button 
              type="button" 
              onClick={calcularTarifa}
              disabled={isCalculating}
              className="bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2 transition-colors"
            >
              <Calculator className="w-4 h-4" />
              {isCalculating ? 'Calculando...' : 'Pre-visualizar Tarifa / Calcular'}
            </button>
            
            {showCalculation && calculoDetalle && (
              <div className="mt-4 bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-4 border-b border-indigo-100 pb-2">
                  <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-indigo-500" />
                    Simulación de Tarifa Mensual
                  </h3>
                  {bcvRate && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-mono font-bold">BCV: Bs. {bcvRate}</span>}
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600 font-medium">Factor Total Mensual:</span>
                    <span className="font-bold text-slate-800">{calculoDetalle.factor.toFixed(2)} EUR (€) (Tarifa Real)</span>
                  </div>
                  {bcvRate && (
                    <div className="flex justify-between items-center text-sm bg-indigo-100/50 p-2 rounded">
                      <span className="text-indigo-800 font-medium">Equivalente Estimado (Bs):</span>
                      <span className="font-bold text-indigo-700">Bs. {(calculoDetalle.factor * parseFloat(bcvRate.replace(',', '.'))).toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  
                  {calculoDetalle.desglose?.length > 0 ? (
                    <div className="bg-white border border-indigo-100 rounded p-3">
                      <p className="text-xs font-bold text-indigo-800 mb-2 uppercase">Desglose por Inmueble</p>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                        {calculoDetalle.desglose.map((d: any, i: number) => (
                          <div key={i} className="flex justify-between items-center border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                            <div>
                              <p className="text-xs font-bold text-slate-700">{d.numeracion}</p>
                              <p className="text-[10px] text-slate-500">{d.leyenda.substring(0, 45)}...</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-slate-700">{d.factor.toFixed(2)} EUR (€)</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center text-sm border-t border-indigo-100 pt-2">
                      <span className="text-slate-600 font-medium">Detalle:</span>
                      <span className="text-slate-700 text-xs text-right max-w-[200px]">{calculoDetalle.leyenda}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center bg-indigo-100 p-3 rounded mt-2">
                    <span className="font-bold text-indigo-900">Total Estimado en Bs:</span>
                    <span className="font-black text-indigo-700 text-lg">Bs. {calculoDetalle.totalBs}</span>
                  </div>
                  
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-3">
            <button 
              type="submit" 
              disabled={isSaving}
              className="bg-orange-600 hover:bg-orange-700 text-white py-4 px-4 rounded-xl w-full text-lg font-black flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xl shadow-orange-500/20 active:scale-95"
            >
              {isSaving ? <AlertCircle className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
              {isSaving ? 'Enviando...' : 'ENVIAR CENSO'}
            </button>
          </div>

        </div>
      </form>
    </div>
  );
}
