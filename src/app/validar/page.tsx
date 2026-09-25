'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Award, CheckCircle, AlertTriangle, Search, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function ValidarContent() {
  const searchParams = useSearchParams();
  const initialCodigo = searchParams.get('codigo') || '';
  
  const [codigo, setCodigo] = useState(initialCodigo);
  const [isLoading, setIsLoading] = useState(!!initialCodigo);
  const [solvencia, setSolvencia] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialCodigo) {
      handleSearch(initialCodigo);
    }
  }, [initialCodigo]);

  const handleSearch = async (searchCodigo: string) => {
    if (!searchCodigo.trim()) return;
    
    setIsLoading(true);
    setError('');
    setSolvencia(null);
    
    try {
      const { data, error: dbError } = await supabase
        .from('certificados')
        .select('*')
        .eq('codigo', searchCodigo.trim())
        .single();
        
      if (dbError || !data) {
        setError('No se encontró ningún certificado válido con ese código.');
      } else {
        const hoy = new Date();
        const vencimiento = new Date(data.vencimiento);
        
        setSolvencia({
          ...data,
          vencida: hoy > vencimiento
        });
      }
    } catch (e: any) {
      setError('Error al conectar con la base de datos.');
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="flex justify-center gap-4 mb-6">
            <div className="relative w-24 h-24">
              <Image src="/logos/basura_cero.jpg" alt="Logo ISMA Naguanagua" fill className="object-contain" />
            </div>
            <div className="relative w-24 h-24">
              <Image src="/logos/global_rec.jpg" alt="Logo Global Rec" fill className="object-contain" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
            Validación de Certificados
          </h1>
          <p className="mt-4 text-lg text-slate-500">
            Sistema de Verificación de Solvencias Municipales
          </p>
        </div>

        {/* Buscador manual por si entran sin QR */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <label className="block text-sm font-bold text-slate-700 mb-2">Código del Certificado</label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Ej. SOL-V12345678-000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(codigo)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 text-lg"
              />
            </div>
            <button 
              onClick={() => handleSearch(codigo)}
              disabled={isLoading}
              className="bg-slate-800 hover:bg-slate-900 text-white px-8 py-3 rounded-lg font-bold transition-colors disabled:opacity-70 flex items-center gap-2"
            >
              {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
              Validar
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg shadow-sm flex items-start gap-4 mb-8">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-bold text-red-800">Certificado Inválido</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {solvencia && (
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden relative">
            {solvencia.vencida && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none opacity-20 overflow-hidden">
                <span className="text-[120px] font-black text-red-600 -rotate-45 tracking-widest leading-none">
                  VENCIDA
                </span>
              </div>
            )}

            <div className="bg-slate-800 p-6 text-white flex items-center justify-between relative z-20">
              <div className="flex items-center gap-3">
                <Award className="w-8 h-8 text-blue-400" />
                <div>
                  <h2 className="text-xl font-bold tracking-wide">CERTIFICADO MUNICIPAL</h2>
                  <p className="text-sm text-slate-300 font-mono">{solvencia.codigo}</p>
                </div>
              </div>
              <div className="text-right">
                {solvencia.vencida ? (
                  <span className="inline-flex items-center gap-1.5 bg-red-500 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm">
                    <AlertTriangle className="w-4 h-4" /> VENCIDA
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-green-500 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm">
                    <CheckCircle className="w-4 h-4" /> VIGENTE
                  </span>
                )}
              </div>
            </div>

            <div className="p-8 relative z-20 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-wider">Datos del Contribuyente</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Razón Social</p>
                      <p className="font-bold text-slate-800 text-lg leading-tight">{solvencia.contribuyente}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Identificación / RIF</p>
                      <p className="font-semibold text-slate-700">{solvencia.identidad || 'N/A'}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-wider">Detalles del Documento</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Tipo de Trámite</p>
                      <p className="font-bold text-slate-800">{solvencia.tipo}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">Emitido</p>
                        <p className="font-semibold text-slate-700">{new Date(solvencia.emision).toLocaleDateString('es-VE')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">Vencimiento</p>
                        <p className={`font-bold ${solvencia.vencida ? 'text-red-600' : 'text-slate-700'}`}>
                          {new Date(solvencia.vencimiento).toLocaleDateString('es-VE')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <p className="text-sm text-slate-600 text-justify leading-relaxed">
                  Este certificado digital hace constar que el contribuyente antes mencionado se encuentra 
                  registrado en nuestros sistemas y sus obligaciones tributarias correspondientes al tipo 
                  de certificado emitido han sido verificadas electrónicamente por la Alcaldía.
                </p>
                <div className="mt-6 flex justify-between items-end">
                  <p className="text-xs text-slate-400 font-mono">
                    ID Transacción:<br/>{solvencia.id}-{new Date(solvencia.created_at).getTime()}
                  </p>
                  <p className="text-[10px] text-slate-400 italic max-w-xs text-right">
                    Documento validado automáticamente a través de la plataforma en línea de la alcaldía.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ValidarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    }>
      <ValidarContent />
    </Suspense>
  );
}
