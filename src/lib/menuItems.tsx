// Definición de los menús laterales. El ORDEN se puede cambiar desde Modo Dios → "Orden del menú"
// (se guarda en system_config.MENU_ORDEN). Los ítems nuevos que no estén en el orden guardado van al final.
import { Home, Search, FileText, FlaskConical, Wrench, UserPlus, Users, FileSpreadsheet, History, Award, Clock, Building2, AlertTriangle, Handshake, LayoutDashboard, Mail, User, PieChart, Truck, Inbox, Calculator, Briefcase, Landmark, BookOpen, Car, Map, Bus, TreePine, ShieldAlert, DollarSign, Wallet, FileCheck, Package, ShoppingCart, Target, BarChart3, ClipboardCheck, Smartphone, LogOut, ShieldCheck, Sparkles, Terminal } from 'lucide-react';

export type MenuItem = { icon: any; name: string; href: string };
export type MenuKey = 'aseo' | 'recaudacion' | 'administracion';
export type MenuOrden = Partial<Record<MenuKey, string[]>> & {
  /** rutas ocultas del menú (en modo DEV se ven oscuras/deshabilitadas) */ ocultos?: string[];
  /** menús desplegables creados al soltar una opción encima de otra */ grupos?: MenuGrupo[];
};

export const MENU_ASEO: MenuItem[] = [
  { icon: Home, name: 'Inicio Aseo', href: '/admin' },
  { icon: PieChart, name: 'Administrativo', href: '/admin/administrativo' },
  { icon: FileText, name: 'Tarifas / Ordenanza', href: '/admin/tarifas' },
  { icon: ClipboardCheck, name: 'Censo de Contribuyentes', href: '/admin/censo' },
  { icon: User, name: 'Contribuyentes', href: '/admin/contribuyentes' },
  { icon: Building2, name: 'Condominios (nuevo)', href: '/admin/condominios' },
  { icon: Wallet, name: 'Caja Condominios', href: '/admin/condominios/caja' },
  { icon: Users, name: 'Condominios COB', href: '/admin/condominios-cob' },
  { icon: FileText, name: 'Pre-registros WEB', href: '/admin/pre-registros' },

  { icon: Map, name: 'Jornadas de Campo', href: '/admin/jornadas' },
  { icon: TreePine, name: 'Visto Bueno Ambiental', href: '/admin/ambiental' },
  { icon: BarChart3, name: 'Análisis de Deudas', href: '/admin/herramientas' },
  { icon: Calculator, name: 'Cálculo y Proyección', href: '/admin/calculo' },
  { icon: Sparkles, name: 'Simulador de Deuda', href: '/admin/simulador' },
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
  { icon: AlertTriangle, name: 'Multas por Mes', href: '/admin/reportes/multas' },
  { icon: Mail, name: 'Correos Informativos', href: '/admin/correos' },
  { icon: UserPlus, name: 'Trabajadores Aseo', href: '/admin/trabajadores' },
  { icon: Smartphone, name: 'Cobro Móvil', href: '/cobro-movil' },
  { icon: Map, name: 'Plan de Acción', href: '/admin/plan-accion' },
  { icon: ShieldAlert, name: 'Auditoría', href: '/admin/auditoria' }
];

export const MENU_RECAUDACION: MenuItem[] = [
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

export const MENU_ADMINISTRACION: MenuItem[] = [
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

export const MENUS: Record<MenuKey, { titulo: string; items: MenuItem[] }> = {
  aseo: { titulo: 'Aseo Urbano', items: MENU_ASEO },
  recaudacion: { titulo: 'Hacienda Municipal', items: MENU_RECAUDACION },
  administracion: { titulo: 'Administración Interna', items: MENU_ADMINISTRACION },
};

/** Aplica el orden guardado (lista de href). Lo no listado conserva su orden original al final. */
export function ordenarMenu(items: MenuItem[], orden?: string[]): MenuItem[] {
  if (!orden || !orden.length) return items;
  const pos = new globalThis.Map<string, number>(orden.map((h, i) => [h, i] as [string, number])); // "Map" es el ícono de lucide
  return items
    .map((it, i) => ({ it, k: pos.has(it.href) ? pos.get(it.href)! : 10000 + i }))
    .sort((x, y) => x.k - y.k)
    .map(x => x.it);
}

// ── Menús desplegables (grupos) ──────────────────────────────────────────────
export type MenuGrupo = { id: string; nombre: string; menu: MenuKey; items: string[] };
export type Entrada = { tipo: 'item'; href: string } | { tipo: 'grupo'; id: string; nombre: string; items: string[] };
export const claveEntrada = (e: Entrada) => (e.tipo === 'item' ? e.href : `g:${e.id}`);

/**
 * Arma el menú en el orden guardado: opciones sueltas y menús desplegables (grupos).
 * Lo que no esté en el orden guardado se agrega al final en su orden original.
 */
export function construirEntradas(items: MenuItem[], orden: MenuOrden, menu: MenuKey): Entrada[] {
  const existe = new Set(items.map(i => i.href));
  const grupos = (orden.grupos || []).filter(g => g.menu === menu)
    .map(g => ({ ...g, items: g.items.filter(h => existe.has(h)) })).filter(g => g.items.length > 0);
  const enGrupo = new Set(grupos.flatMap(g => g.items));
  const out: Entrada[] = []; const puesto = new Set<string>();
  const poner = (e: Entrada) => { const k = claveEntrada(e); if (!puesto.has(k)) { puesto.add(k); out.push(e); } };
  for (const k of orden[menu] || []) {
    if (k.startsWith('g:')) { const g = grupos.find(x => x.id === k.slice(2)); if (g) poner({ tipo: 'grupo', id: g.id, nombre: g.nombre, items: g.items }); }
    else if (existe.has(k) && !enGrupo.has(k)) poner({ tipo: 'item', href: k });
  }
  grupos.forEach(g => poner({ tipo: 'grupo', id: g.id, nombre: g.nombre, items: g.items }));
  items.forEach(i => { if (!enGrupo.has(i.href)) poner({ tipo: 'item', href: i.href }); });
  return out;
}
