import { Landmark, Building2, Briefcase, Handshake } from 'lucide-react';
import Link from 'next/link';

export default function RecaudacionDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Hacienda Municipal</h1>
        <p className="text-slate-500">Panel de control de recaudación, impuestos y servicios.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1 */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
            <Briefcase className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800">0</h3>
          <p className="text-sm text-slate-500 font-medium">Empresas Registradas</p>
        </div>

        {/* Card 2 */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800">0</h3>
          <p className="text-sm text-slate-500 font-medium">Inmuebles Catastrados</p>
        </div>

        {/* Card 3 */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center mb-4">
            <Landmark className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800">0.00 €</h3>
          <p className="text-sm text-slate-500 font-medium">Recaudación del Mes</p>
        </div>

        {/* Card 4 */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-4">
            <Handshake className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800">0</h3>
          <p className="text-sm text-slate-500 font-medium">Declaraciones Procesadas</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center mt-8">
        <Landmark className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-700 mb-2">Bienvenido al Sistema Integral de Recaudación Tributaria Municipal</h2>
        <p className="text-slate-500 max-w-2xl mx-auto mb-6">
          Desde este panel podrás gestionar las actividades económicas, patentes, catastro, registro vehicular, servicios públicos y multas del municipio.
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/user_action/admin/recaudacion/actividades-economicas" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Gestionar Empresas
          </Link>
          <Link href="/user_action/admin/recaudacion/catastro" className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium">
            Ver Fichas Catastrales
          </Link>
        </div>
      </div>
    </div>
  );
}