'use client';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Home, 
  MessageCircle, 
  Building2, 
  FileText, 
  CreditCard, 
  History, 
  Award,
  CalendarDays,
  MessageSquareWarning,
  Wrench,
  ShieldCheck,
  SearchCheck,
  User as UserIcon,
  Power,
  Menu
} from 'lucide-react';

interface PortalHeaderProps {
  onMenuClick?: () => void;
}

export default function PortalHeader({ onMenuClick }: PortalHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const getPageInfo = () => {
    switch (pathname) {
      case '/portal/dashboard': return { title: 'DATOS DEL CONTRIBUYENTE', icon: Home };
      case '/portal/chat': return { title: 'CHAT EN LÍNEA', icon: MessageCircle };
      case '/portal/inmuebles': return { title: 'MIS INMUEBLES', icon: Building2 };
      case '/portal/estado-cuenta': return { title: 'ESTADO DE CUENTA', icon: FileText };
      case '/portal/pagos': return { title: 'PAGAR', icon: CreditCard };
      case '/portal/documentos': return { title: 'HISTORIAL DOCUMENTOS', icon: History };
      case '/portal/solvencia': return { title: 'HISTORIAL CERTIFICADOS', icon: Award };
      case '/portal/rutas': return { title: 'HORARIOS DE RUTAS', icon: CalendarDays };
      case '/portal/denuncias': return { title: 'RECLAMOS Y SUGERENCIAS', icon: MessageSquareWarning };
      case '/portal/servicios-extraordinarios': return { title: 'SERVICIOS EXTRAORDINARIOS', icon: Wrench };
      case '/portal/visto-bueno': return { title: 'VISTO BUENO AMBIENTAL', icon: ShieldCheck };
      case '/portal/inspeccion': return { title: 'SOLICITUD DE INSPECCIÓN', icon: SearchCheck };
      default: return { title: 'PORTAL', icon: Home };
    }
  };

  const { title, icon: Icon } = getPageInfo();

  return (
    <header className="bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3 text-slate-700">
        <button 
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-800 focus:outline-none"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Icon className="w-5 h-5 text-slate-500 hidden sm:block" />
        <h1 className="font-semibold text-xs sm:text-sm tracking-wide uppercase truncate max-w-[200px] sm:max-w-none">{title}</h1>
      </div>
      
      <div className="flex items-center gap-4 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-orange-500 font-semibold text-xs">Usuario Oficial</span>
          <span className="text-xs">Última Conexión: Hoy</span>
        </div>
        <button 
          onClick={() => router.push('/')}
          className="text-slate-400 hover:text-slate-600"
          title="Cerrar sesión"
        >
          <Power className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
