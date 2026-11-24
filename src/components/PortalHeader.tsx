'use client';
import { useState, useEffect } from 'react';
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
import ThemeToggle from '@/components/ThemeToggle';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariantsExact } from '@/lib/formatters';

interface PortalHeaderProps {
  onMenuClick?: () => void;
}

interface CondoSibling {
  codigo: string;
  nombre: string;
}

export default function PortalHeader({ onMenuClick }: PortalHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [condoSiblings, setCondoSiblings] = useState<CondoSibling[]>([]);
  const [activeCondoCode, setActiveCondoCode] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const doc = localStorage.getItem('portal_doc') || '';
    const codigo = (localStorage.getItem('portal_codigo') || '').trim().toUpperCase();
    setActiveCondoCode(codigo);
    if (!doc) return;

    const cargarCondosDelRif = async () => {
      try {
        const variants = getIdentidadVariantsExact(doc);
        const orFilter = [...variants.map(v => `identidad.eq.${v}`), ...(codigo ? [`codigo.eq.${codigo}`] : [])].filter(Boolean).join(',');
        if (!orFilter) return;

        const { data: firstMatch } = await supabase
          .from('condominios')
          .select('codigo, nombre, identidad')
          .neq('estado', 'Eliminado')
          .or(orFilter)
          .limit(20);

        if (!firstMatch || firstMatch.length === 0) return;

        // Si encontramos un condominio, buscar todos los condominios que compartan ese mismo RIF
        const rifTarget = firstMatch[0]?.identidad || doc;
        const rifVars = getIdentidadVariantsExact(rifTarget);
        const orRif = rifVars.map(v => `identidad.eq.${v}`).join(',');
        const { data: allSiblings } = orRif
          ? await supabase
              .from('condominios')
              .select('codigo, nombre')
              .neq('estado', 'Eliminado')
              .or(orRif)
              .order('nombre', { ascending: true })
          : { data: firstMatch };

        const list = (allSiblings && allSiblings.length > 0 ? allSiblings : firstMatch).map((c: any) => ({
          codigo: String(c.codigo || '').trim().toUpperCase(),
          nombre: String(c.nombre || '').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim(),
        })).filter((c: CondoSibling) => Boolean(c.codigo));

        if (list.length > 1) {
          setCondoSiblings(list);
          const currentActive = list.find(c => c.codigo === codigo)?.codigo || list[0].codigo;
          setActiveCondoCode(currentActive);
          if (currentActive && currentActive !== codigo) {
            localStorage.setItem('portal_codigo', currentActive);
          }
        } else {
          setCondoSiblings([]);
        }
      } catch {}
    };

    cargarCondosDelRif();
  }, [pathname]);

  const handleSwitchCondominio = (newCode: string) => {
    const target = condoSiblings.find(c => c.codigo === newCode);
    if (!target) return;
    localStorage.setItem('portal_codigo', target.codigo);
    if (target.nombre) {
      localStorage.setItem('portal_user', target.nombre);
    }
    setActiveCondoCode(target.codigo);
    window.location.reload();
  };

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
      
      <div className="flex items-center gap-2 sm:gap-4 text-sm text-slate-600">
        {condoSiblings.length > 1 && (
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-xl px-2.5 py-1 text-xs shadow-xs">
            <Building2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span className="text-[10px] font-black text-emerald-800 uppercase hidden lg:inline">
              Condominio ({condoSiblings.length}):
            </span>
            <select
              value={activeCondoCode}
              onChange={(e) => handleSwitchCondominio(e.target.value)}
              className="bg-transparent border-none text-emerald-950 font-black text-xs focus:outline-none cursor-pointer max-w-[165px] sm:max-w-[260px] truncate"
              title="Cambiar entre los condominios o torres registrados bajo este RIF"
            >
              {condoSiblings.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <ThemeToggle variant="header" />
        <div className="hidden sm:flex items-center gap-2">
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
