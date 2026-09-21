const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/conciliacion/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// Find the return block of ModalComprobante (between line 101 and 169 approx)
// We'll replace from the `return (` inside ModalComprobante to its closing `}`

// Strategy: find the specific content to replace
const OLD_MODAL_RETURN = `  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">`;

const NEW_MODAL_START = `  const isImg = (url: string) => /\\.(jpg|jpeg|png|gif|webp|bmp)(\\?|$)/i.test(url);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">`;

// Try both CRLF and LF
const crlfVersion = OLD_MODAL_RETURN.replace(/\n/g, '\r\n');
if (c.includes(crlfVersion)) {
  c = c.replace(crlfVersion, NEW_MODAL_START.replace(/\n/g, '\r\n'));
  console.log('Replaced CRLF header');
} else if (c.includes(OLD_MODAL_RETURN)) {
  c = c.replace(OLD_MODAL_RETURN, NEW_MODAL_START);
  console.log('Replaced LF header');
} else {
  console.log('❌ Could not find ModalComprobante return header');
  process.exit(1);
}

// Now replace the archivos table with the new image-preview version
const OLD_ARCHIVOS = `          {loading ? (
            <div className="text-center py-8 text-slate-400">Cargando archivos...</div>
          ) : archivos.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No hay archivos adjuntos para este pago.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-4 py-2 text-left w-12">#</th>
                  <th className="px-4 py-2 text-left">Nombre del Archivo</th>
                  <th className="px-4 py-2 text-center">Descargar</th>
                  <th className="px-4 py-2 text-center">Visualizar</th>
                </tr>
              </thead>
              <tbody>
                {archivos.map((arch, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-3 text-blue-600 font-mono text-xs">{arch.name}</td>
                    <td className="px-4 py-3 text-center">
                      <a href={arch.url} download target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800">
                        <Download size={20} />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a href={arch.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800">
                        <Eye size={20} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}`;

const NEW_ARCHIVOS = `          {loading ? (
            <div className="text-center py-8 text-slate-400">Cargando comprobantes...</div>
          ) : archivos.length === 0 ? (
            <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              <p className="mt-2">No hay comprobante adjunto para este pago.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {archivos.map((arch, i) => (
                <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-mono text-slate-600 truncate max-w-[260px]">{arch.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <a href={arch.url} download target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-semibold">
                        <Download size={14} /> Descargar
                      </a>
                      <a href={arch.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-xs font-semibold">
                        <Eye size={14} /> Nueva pestaña
                      </a>
                    </div>
                  </div>
                  {isImg(arch.url) ? (
                    <div className="bg-slate-900 flex items-center justify-center p-4 min-h-[200px]">
                      <img src={arch.url} alt="Comprobante" className="max-w-full max-h-[500px] object-contain rounded shadow-lg" />
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-500">
                      <p className="text-sm mb-3">Archivo PDF u otro formato.</p>
                      <a href={arch.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700">
                        <Eye size={14} /> Ver documento
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}`;

// Try CRLF and LF
const crlfOldArchivos = OLD_ARCHIVOS.replace(/\n/g, '\r\n');
if (c.includes(crlfOldArchivos)) {
  c = c.replace(crlfOldArchivos, NEW_ARCHIVOS.replace(/\n/g, '\r\n'));
  console.log('✅ Archivos section replaced (CRLF)');
} else if (c.includes(OLD_ARCHIVOS)) {
  c = c.replace(OLD_ARCHIVOS, NEW_ARCHIVOS);
  console.log('✅ Archivos section replaced (LF)');
} else {
  console.log('⚠ Could not find archivos table exactly - skipping (header was already updated)');
}

// Also expand the modal container for overflow
const OLD_CONTAINER = `<div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>`;
const NEW_CONTAINER = `<div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>`;
if (c.includes(OLD_CONTAINER.replace(/\n/g,'\r\n'))) {
  c = c.replace(OLD_CONTAINER.replace(/\n/g,'\r\n'), NEW_CONTAINER.replace(/\n/g,'\r\n'));
  console.log('✅ Container updated (CRLF)');
} else if (c.includes(OLD_CONTAINER)) {
  c = c.replace(OLD_CONTAINER, NEW_CONTAINER);
  console.log('✅ Container updated (LF)');
}

// Replace div p-6 with overflow-y-auto 
const OLD_P6 = `        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">`;
const NEW_P6 = `        <div className="overflow-y-auto flex-1 p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">`;
[OLD_P6, OLD_P6.replace(/\n/g,'\r\n')].forEach((pattern, idx) => {
  if (c.includes(pattern)) {
    c = c.replace(pattern, idx === 0 ? NEW_P6 : NEW_P6.replace(/\n/g,'\r\n'));
    console.log('✅ p-6 div updated');
  }
});

// Close button to shrink
c = c.replace(
  `        <div className="flex justify-end px-6 pb-4">`,
  `        <div className="flex justify-end px-6 py-3 border-t border-slate-200 shrink-0">`
);
c = c.replace(
  `        <div className="flex justify-end px-6 pb-4">\r\n`,
  `        <div className="flex justify-end px-6 py-3 border-t border-slate-200 shrink-0">\r\n`
);

fs.writeFileSync(path, c, 'utf8');
console.log('✅ ModalComprobante actualizado con preview de imagen y layout mejorado');
