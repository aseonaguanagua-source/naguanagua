import { MapPin, Phone, Mail, FileText, Download, Smartphone } from 'lucide-react';
import MapWrapper from '@/components/MapWrapper';
import { supabase } from '@/lib/supabase';
import ManualBCVRateEditor from '@/components/ManualBCVRateEditor';
import RecaudacionWidget from '@/components/RecaudacionWidget';
import { getTasaBCV } from '@/services/bcv';
import CopyButton from '@/components/CopyButton';

export const dynamic = 'force-dynamic';

async function getExchangeRates() {
  try {
    const bcvData = await getTasaBCV();
    if (!bcvData.success) throw new Error('API request failed');
    
    return {
      usd: bcvData.usd,
      eur: bcvData.euro,
      tcmmv: bcvData.tcmmv,
      fecha: new Date(bcvData.timestamp || Date.now()).toLocaleDateString('es-VE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    };
  } catch (error) {
    console.error("Error fetching cached exchange rates:", error);
    return { usd: 0, eur: 0, tcmmv: 0, fecha: 'Error obteniendo tasas' };
  }
}

export default async function AdminHome() {
  const rates = await getExchangeRates();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
        <MapPin className="w-6 h-6 text-slate-700" />
        <h1 className="text-2xl font-semibold text-slate-800 uppercase tracking-wide">Inicio</h1>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Cobro Móvil Card */}
        <a href="/cobro-movil" className="block">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-xl shadow-lg border border-emerald-500/30 p-6 flex items-center gap-5 hover:from-emerald-500 hover:to-emerald-600 transition-all cursor-pointer group">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Smartphone className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Cobro Móvil</h2>
              <p className="text-emerald-100/80 text-sm">Busca contribuyentes, revisa su estado de cuenta y procesa cobros desde el campo con tu teléfono.</p>
            </div>
            <div className="ml-auto text-white/60 group-hover:text-white transition-colors text-2xl">→</div>
          </div>
        </a>
        {/* Widget Recaudación */}
        <RecaudacionWidget />

        {/* Tasa de Cambio */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <span className="font-semibold text-slate-700">Tasa de Cambio (Oficial / Manual)</span>
            <ManualBCVRateEditor currentRate={rates.tcmmv} />
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-4 text-sm text-slate-700 items-center justify-center">
              <span className="flex items-center gap-1">
                UCD (Moneda de Mayor Valor): 
                <strong className="text-blue-700 text-lg font-bold">Bs. {rates.tcmmv.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span>UCD: <strong className="text-green-600 font-semibold">Bs. {rates.eur.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Dólar: <strong className="text-slate-900 font-semibold">Bs. {rates.usd.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong></span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 capitalize">Fecha Valor: {rates.fecha}</span>
            </div>
          </div>
        </div>

        {/* Cuentas Bancarias */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h2 className="font-semibold text-slate-700">Cuentas Bancarias Oficiales</h2>
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">IAMEC Naguanagua</span>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bancamiga */}
            <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-black text-blue-900 text-sm">Bancamiga</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">Cta Corriente</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span className="font-semibold">Cuenta:</span>
                <span className="font-mono font-bold text-slate-900">01720110711101340717</span>
                <CopyButton text="01720110711101340717" className="text-blue-600 hover:text-blue-800 ml-1 p-1 bg-white rounded border border-blue-200" />
              </div>
              <div className="text-xs text-slate-600 pt-2 border-t border-blue-100">
                <p>Titular: <strong className="text-slate-800">IAMEC BANCAMIGA</strong></p>
                <p className="text-[11px] text-slate-500 font-mono">RIF: G-200086149</p>
              </div>
            </div>

            {/* Banesco */}
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-black text-emerald-900 text-sm">Banesco</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Cta Corriente</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span className="font-semibold">Cuenta:</span>
                <span className="font-mono font-bold text-slate-900">01340415144151031715</span>
                <CopyButton text="01340415144151031715" className="text-emerald-600 hover:text-emerald-800 ml-1 p-1 bg-white rounded border border-emerald-200" />
              </div>
              <div className="text-xs text-slate-600 pt-2 border-t border-emerald-100">
                <p>Titular: <strong className="text-slate-800">Inst. Soc. Mun. para el Ambiente</strong></p>
                <p className="text-[11px] text-slate-500 font-mono">RIF: G-200076739</p>
              </div>
            </div>
          </div>
        </div>

        {/* Contacto y Ubicación */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700">Contacto y Ubicación</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm text-slate-700 mb-1">Oficinas de Atención al Usuario:</div>
                  <div className="text-sm text-slate-600">Avenida Libertador, frente a la Plaza Bolívar. Naguanagua Edo. Falcón Zona Postal 2055</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm text-slate-700 mb-1">Teléfonos:</div>
                  <div className="text-sm text-slate-600">+58 412-9030238</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm text-slate-700 mb-1">Correo Electrónico:</div>
                  <a href="mailto:info@aseonaguanagua.globalrecca.com" className="text-sm text-blue-600 hover:underline">info@aseonaguanagua.globalrecca.com</a>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ height: '300px' }}>
              <MapWrapper 
                position={{ lat: 10.2544, lng: -68.0116 }} 
                readOnly={true} 
              />
            </div>
          </div>
        </div>

        {/* Descarga */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700">Descarga de Documentos Legales</h2>
          </div>
          <div className="p-6">
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-sm text-slate-600">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                <div>
                  Ordenanza Sobre la Gestión y Prestación del Servicio de Manejo integral de Residuos y Desechos Sólidos del Municipio Naguanagua.
                  <a href="/admin/tarifas" className="text-blue-600 hover:underline ml-1 inline-flex items-center gap-1">
                    Consultar Ordenanza
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-600">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                <div>
                  Gaceta Municipal 19. Exoneración del 100% en multas, recargos e intereses correspondientes a los años 2024 y 2025.
                  <a href="/admin/tarifas" className="text-blue-600 hover:underline ml-1 inline-flex items-center gap-1">
                    Ver Gaceta en Tarifas
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-600">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                <div>
                  Gaceta Municipal 23. Plan de Saneamiento y Regularización de Deudas para Conjuntos Residenciales (50% desc. capital).
                  <a href="/admin/tarifas" className="text-blue-600 hover:underline ml-1 inline-flex items-center gap-1">
                    Ver Gaceta en Tarifas
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-600">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                <div>
                  Gaceta Municipal 31. Plan de Saneamiento y Regularización de Deudas para Comercios e Industrias.
                  <a href="/admin/tarifas" className="text-blue-600 hover:underline ml-1 inline-flex items-center gap-1">
                    Ver Gaceta en Tarifas
                  </a>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
