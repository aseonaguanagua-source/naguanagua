'use client';
import { Home, Search, FileText, FlaskConical, Wrench, UserPlus, Users, FileSpreadsheet, History, Award, Clock, Building2, AlertTriangle, Handshake, LayoutDashboard, Mail, User, PieChart, Truck, Inbox, Calculator, Briefcase, Landmark, BookOpen, Car, Map, Bus, TreePine, ShieldAlert, DollarSign, Wallet, FileCheck, Package, ShoppingCart, Target, BarChart3, ClipboardCheck, Smartphone, LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { performLogout } from '@/lib/logout';

export default function Sidebar() {
  const pathname = usePathname();
  const isAdminPath = pathname.startsWith('/admin') || pathname.startsWith('/audit');
  
  if (!isAdminPath) {
    return null;
  }

  const isRecaudacion = pathname.startsWith('/admin/recaudacion');
  const isAdministracion = pathname.startsWith('/admin/administracion');

  const menuAseo = [
    { icon: Home, name: 'Inicio Aseo', href: '/admin' },
    { icon: PieChart, name: 'Administrativo', href: '/admin/administrativo' },
    { icon: FileText, name: 'Tarifas / Ordenanza', href: '/admin/tarifas' },
    { icon: ClipboardCheck, name: 'Censo de Contribuyentes', href: '/admin/censo' },
    { icon: User, name: 'Contribuyentes', href: '/admin/contribuyentes' },
    { icon: Users, name: 'Condominios COB', href: '/admin/condominios-cob' },
    { icon: FileText, name: 'Pre-registros WEB', href: '/admin/pre-registros' },

    { icon: Map, name: 'Jornadas de Campo', href: '/admin/jornadas' },
    { icon: TreePine, name: 'Visto Bueno Ambiental', href: '/admin/ambiental' },
    { icon: BarChart3, name: 'Análisis de Deudas', href: '/admin/herramientas' },
    { icon: Calculator, name: 'Cálculo y Proyección', href: '/admin/calculo' },
    { icon: Briefcase, name: 'Caja / Pagos', href: '/admin/caja' },
    { icon: Landmark, name: 'Conciliacion Bancaria', href: '/admin/caja/conciliacion' },
    { icon: FileText, name: 'Facturación Electrónica', href: '/admin/facturacion-electronica' },
    { icon: FileSpreadsheet, name: 'Emisión de recibos', href: '/admin/estado-cuenta' },
    { icon: Handshake, name: 'Convenios de Pago', href: '/admin/convenios-pago' },
    { icon: Award, name: 'Certificados Emitidos', href: '/admin/certificados' },
    { icon: History, name: 'Historial Documentos', href: '/admin/historial-documentos' },
    { icon: Inbox, name: 'Buzón de Solicitudes', href: '/admin/buzon' },
    { icon: AlertTriangle, name: 'Denuncias Ciudadanas', href: '/admin/denuncias' },
    { icon: Truck, name: 'Rutas Camiones', href: '/admin/rutas' },
    { icon: Wrench, name: 'Servicios Especiales', href: '/admin/servicios-especiales' },
    { icon: PieChart, name: 'Reportes Generales', href: '/admin/reportes' },
    { icon: Mail, name: 'Correos Informativos', href: '/admin/correos' },
    { icon: UserPlus, name: 'Trabajadores Aseo', href: '/admin/trabajadores' },
    { icon: Smartphone, name: 'Cobro Móvil', href: '/cobro-movil' },
    { icon: Map, name: 'Plan de Acción', href: '/admin/plan-accion' },
    { icon: ShieldAlert, name: 'Auditoría', href: '/admin/auditoria' }
  ];

  const menuRecaudacion = [
    { icon: Landmark, name: 'Dashboard Hacienda', href: '/admin/recaudacion' },
    { icon: Briefcase, name: 'Actividades Económicas', href: '/admin/recaudacion/actividades-economicas' },
    { icon: Building2, name: 'Catastro y Propiedad', href: '/admin/recaudacion/catastro' },
    { icon: Car, name: 'Vehículos y Patentes', href: '/admin/recaudacion/vehiculos' },
    { icon: Map, name: 'Ordenamiento Territorial', href: '/admin/recaudacion/ordenamiento' },
    { icon: Truck, name: 'Vialidad y Tránsito', href: '/admin/recaudacion/vialidad' },
    { icon: Bus, name: 'Terminal de Pasajeros', href: '/admin/recaudacion/terminal' },
    { icon: Users, name: 'Servicios Públicos', href: '/admin/recaudacion/servicios' },
    { icon: TreePine, name: 'Ambiente', href: '/admin/recaudacion/ambiente' },
    { icon: ShieldAlert, name: 'Policía Municipal', href: '/admin/recaudacion/policia' },
    { icon: Handshake, name: 'Convenios y Exoneraciones', href: '/admin/recaudacion/convenios' },
    { icon: Search, name: 'Fiscalización / Auditoría', href: '/admin/recaudacion/fiscalizacion' },
    { icon: FileSpreadsheet, name: 'Pasarela de Pagos', href: '/admin/recaudacion/pagos' }
  ];

  const menuAdministracion = [
    { icon: LayoutDashboard, name: 'Dashboard Admin', href: '/admin/administracion' },
    { icon: Calculator, name: 'Presupuesto Público', href: '/admin/administracion/presupuesto' },
    { icon: Wallet, name: 'Finanzas y Pagos', href: '/admin/administracion/finanzas' },
    { icon: Users, name: 'RRHH y Nómina', href: '/admin/administracion/rrhh' },
    { icon: ShoppingCart, name: 'Compras y Servicios', href: '/admin/administracion/compras' },
    { icon: FileCheck, name: 'Contrataciones', href: '/admin/administracion/contrataciones' },
    { icon: Package, name: 'Almacén e Inventario', href: '/admin/administracion/almacen' },
    { icon: Building2, name: 'Bienes Nacionales', href: '/admin/administracion/bienes' },
    { icon: Target, name: 'Plan Operativo Anual', href: '/admin/administracion/poa' },
    { icon: ShieldAlert, name: 'Auditoría', href: '/admin/auditoria' }
  ];

  let activeMenu = menuAseo;
  let title = 'Aseo Urbano';
  
  if (isRecaudacion) {
    activeMenu = menuRecaudacion;
    title = 'Hacienda Municipal';
  } else if (isAdministracion) {
    activeMenu = menuAdministracion;
    title = 'Administración Interna';
  }

  return (
    <aside className="w-64 bg-[#111827] h-screen text-slate-300 flex flex-col fixed left-0 top-0 z-50">
      <div className="flex items-center justify-center border-b border-white/10 bg-[#111827] px-4 py-4">
        <img
          src="/logos/logo_global_rec.png"
          alt="Global Rec"
          className="w-40 max-w-full h-auto object-contain"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
      </div>
      <div className="p-4 bg-[#111827] border-b border-white/10 text-sm text-[#c8e64c] text-center uppercase tracking-wider font-semibold">
        {title}
      </div>
      <nav className="flex-1 overflow-y-auto py-4 sidebar-scroll">
        <ul className="space-y-1">
          {activeMenu.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2 hover:bg-white/5 hover:text-[#c8e64c] transition-colors ${pathname === item.href ? 'bg-white/10 text-[#c8e64c] border-l-4 border-[#c8e64c]' : ''}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="p-4 bg-[#111827] border-t border-white/10 shrink-0 space-y-2">
        <button
          onClick={async () => {
            await performLogout('/admin');
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/70 border border-red-800/40 text-xs font-bold text-red-300 hover:text-white transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-red-400" />
          <span>Cerrar Sesión</span>
        </button>
        <Link href="/" className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
          <Home className="w-4 h-4" /> Volver al Inicio
        </Link>
      </div>

      <style jsx global>{`
        .sidebar-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .sidebar-scroll::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 10px;
          border: 2px solid #0f172a;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </aside>
  );
}

