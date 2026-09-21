import { LayoutDashboard } from 'lucide-react';

export default function AdministracionDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <LayoutDashboard className="w-6 h-6 text-indigo-500" />
        Dashboard: Administración Pública
      </h1>
      <p className="text-slate-600">Bienvenido al sistema ERP interno de la Alcaldía.</p>
    </div>
  );
}
