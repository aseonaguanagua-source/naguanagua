// Manual de Usuario del sistema en PDF (se descarga desde el menú lateral).
// Respeta el orden, los menús desplegables y los nombres personalizados definidos en "⇅ Ordenar".
import { MENUS, construirEntradas, type MenuKey, type MenuOrden, type MenuItem } from '@/lib/menuItems';
import { MANUAL_MENU } from '@/lib/menuManual';
import { ROUTE_PERMISSIONS_MAP } from '@/lib/permissionsMap';

const VERDE: [number, number, number] = [17, 24, 39];
const ACENTO: [number, number, number] = [132, 160, 20];
const GRIS: [number, number, number] = [100, 116, 139];

const PERMISOS: Record<string, string> = {
  ver_reportes: 'Ver reportes', ver_caja: 'Caja', ver_contribuyentes: 'Contribuyentes', editar_contribuyentes: 'Editar contribuyentes',
  ver_condominios: 'Condominios', ver_auditoria: 'Auditoría', gestionar_usuarios: 'Gestión de usuarios',
};
const permisoTxt = (href: string) => {
  if (href === '/admin') return 'Todos los usuarios del sistema.';
  if (href === '/admin/administrativo' || href.startsWith('/admin/administracion')) return 'Exclusivo del perfil Administrador.';
  const l = ROUTE_PERMISSIONS_MAP[href];
  if (!l || !l.length) return 'Perfil Administrador.';
  return `Administrador, o usuarios con el permiso: ${l.map(p => PERMISOS[p] || p.replace(/_/g, ' ')).join(' / ')}.`;
};

async function logoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch('/logos/logo_global_rec.png'); if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch { return null; }
}

export async function descargarManualPDF(orden: MenuOrden) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 18, ANCHO = W - 2 * M;
  const nombre = (it: MenuItem) => orden.nombres?.[it.href] || it.name;
  const ocultos = new Set(orden.ocultos || []);
  const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
  const logo = await logoDataUrl();

  // ── Portada ──
  doc.setFillColor(...VERDE); doc.rect(0, 0, W, H, 'F');
  if (logo) { try { doc.addImage(logo, 'PNG', W / 2 - 35, 50, 70, 35); } catch {} }
  doc.setTextColor(200, 230, 76); doc.setFont('helvetica', 'bold'); doc.setFontSize(26);
  doc.text('MANUAL DE USUARIO', W / 2, 115, { align: 'center' });
  doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'normal');
  doc.text('Sistema de Recaudación — Aseo Urbano', W / 2, 127, { align: 'center' });
  doc.text('Instituto Autónomo Municipal de Aseo · Naguanagua', W / 2, 135, { align: 'center' });
  doc.setDrawColor(200, 230, 76); doc.setLineWidth(0.8); doc.line(W / 2 - 40, 145, W / 2 + 40, 145);
  doc.setFontSize(10); doc.setTextColor(203, 213, 225);
  doc.text('Guía descriptiva de cada opción del menú del sistema', W / 2, 155, { align: 'center' });
  doc.text(`Edición: ${fecha}`, W / 2, H - 30, { align: 'center' });
  doc.text('Global Rec · Collection System', W / 2, H - 23, { align: 'center' });

  // ── Contenido ──
  type Sec = { titulo: string; key: MenuKey; bloques: { grupo?: string; items: MenuItem[] }[] };
  const secciones: Sec[] = (Object.keys(MENUS) as MenuKey[]).map(k => {
    const porHref = new Map(MENUS[k].items.map(i => [i.href, i] as [string, MenuItem]));
    const bloques: Sec['bloques'] = [];
    for (const e of construirEntradas(MENUS[k].items, orden, k)) {
      if (e.tipo === 'item') {
        const it = porHref.get(e.href); if (!it || ocultos.has(it.href)) continue;
        const ult = bloques[bloques.length - 1];
        if (ult && !ult.grupo) ult.items.push(it); else bloques.push({ items: [it] });
      } else {
        const items = e.items.map(h => porHref.get(h)).filter((x): x is MenuItem => !!x && !ocultos.has(x.href));
        if (items.length) bloques.push({ grupo: e.nombre, items });
      }
    }
    return { titulo: MENUS[k].titulo, key: k, bloques };
  });

  let y = 0;
  const nuevaPagina = () => { doc.addPage(); y = 26; };
  const espacio = (h: number) => { if (y + h > H - 20) nuevaPagina(); };
  const parrafo = (t: string, size = 10, color: [number, number, number] = [30, 41, 59], indent = 0, estilo: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFont('helvetica', estilo); doc.setFontSize(size); doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(t, ANCHO - indent) as string[];
    for (const l of lineas) { espacio(size * 0.5); doc.text(l, M + indent, y); y += size * 0.45; }
  };

  // Índice
  nuevaPagina();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...VERDE); doc.text('Contenido', M, y); y += 4;
  doc.setDrawColor(...ACENTO); doc.setLineWidth(0.6); doc.line(M, y, M + 30, y); y += 8;
  parrafo('Este manual describe el propósito y las funciones de cada opción del menú lateral del sistema, en el mismo orden en que aparecen en pantalla. Cada usuario verá únicamente las opciones que su perfil y sus permisos le autorizan.', 10, GRIS);
  y += 4;
  const indicePos: { pag: number; y: number; txt: string; nivel: number }[] = [];
  let n = 0;
  secciones.forEach((s, si) => {
    espacio(8); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...VERDE);
    doc.text(`${si + 1}. ${s.titulo}`, M, y); y += 6;
    s.bloques.forEach(b => {
      if (b.grupo) { espacio(6); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(9.5); doc.setTextColor(...ACENTO); doc.text(`> ${b.grupo}`, M + 5, y); y += 5; }
      b.items.forEach(it => {
        n++; espacio(5); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(51, 65, 85);
        doc.text(`${si + 1}.${n}  ${nombre(it)}`, M + (b.grupo ? 10 : 5), y);
        indicePos.push({ pag: doc.getNumberOfPages(), y, txt: it.href, nivel: 0 }); y += 5;
      });
    });
    n = 0; y += 3;
  });

  // Fichas
  const paginaDe: Record<string, number> = {};
  secciones.forEach((s, si) => {
    nuevaPagina();
    doc.setFillColor(...VERDE); doc.rect(0, 14, W, 18, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(200, 230, 76);
    doc.text(`${si + 1}. ${s.titulo.toUpperCase()}`, M, 25.5); y = 42;
    let k = 0;
    s.bloques.forEach(b => {
      if (b.grupo) {
        espacio(14); doc.setFillColor(241, 245, 249); doc.rect(M, y - 5, ANCHO, 9, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ACENTO);
        doc.text(`Menú desplegable: ${b.grupo}`, M + 3, y + 1); y += 10;
      }
      b.items.forEach(it => {
        k++;
        const info = MANUAL_MENU[it.href];
        espacio(30);
        paginaDe[it.href] = doc.getNumberOfPages();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...VERDE);
        doc.text(`${si + 1}.${k}  ${nombre(it)}`, M, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
        doc.text(`Ruta: ${it.href}${orden.nombres?.[it.href] ? `   ·   Nombre original: ${it.name}` : ''}`, M, y + 4.5);
        y += 7; doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 5;
        if (!info) { parrafo('Opción del sistema. Consulte con el administrador para más detalles.', 10, GRIS, 0, 'italic'); y += 6; return; }
        parrafo('Propósito', 10, ACENTO, 0, 'bold'); y += 0.5;
        parrafo(info.proposito, 10); y += 2.5;
        parrafo('Funciones principales', 10, ACENTO, 0, 'bold'); y += 0.5;
        info.funciones.forEach(f => {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
          const lineas = doc.splitTextToSize(f, ANCHO - 7) as string[];
          espacio(lineas.length * 4.6); doc.setTextColor(...ACENTO); doc.text('•', M + 2, y);
          doc.setTextColor(30, 41, 59); lineas.forEach(l => { doc.text(l, M + 7, y); y += 4.5; });
        });
        y += 2;
        parrafo('Acceso', 10, ACENTO, 0, 'bold'); y += 0.5;
        parrafo(permisoTxt(it.href), 9.5, [51, 65, 85]);
        if (info.recomendaciones?.length) {
          y += 2; parrafo('Recomendaciones', 10, ACENTO, 0, 'bold'); y += 0.5;
          info.recomendaciones.forEach(r => parrafo(`— ${r}`, 9.5, [51, 65, 85], 3, 'italic'));
        }
        y += 8;
      });
    });
  });

  // Números de página en el índice
  indicePos.forEach(p => {
    const pg = paginaDe[p.txt]; if (!pg) return;
    doc.setPage(p.pag); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GRIS);
    doc.text(String(pg - 1), W - M, p.y, { align: 'right' });
  });

  // Encabezado y pie en todas las páginas (excepto portada)
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text('Manual de Usuario · Sistema de Recaudación de Aseo Urbano', M, 9);
    doc.text(fecha, W - M, 9, { align: 'right' });
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.line(M, 11, W - M, 11); doc.line(M, H - 12, W - M, H - 12);
    doc.text('IAMEC Naguanagua · Global Rec', M, H - 7);
    doc.text(`Página ${i - 1} de ${total - 1}`, W - M, H - 7, { align: 'right' });
  }
  doc.save(`Manual_de_Usuario_Sistema_Aseo_${new Date().toISOString().slice(0, 10)}.pdf`);
}
