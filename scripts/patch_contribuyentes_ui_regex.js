const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /<th className="px-3 py-2">Estado<\/th>\s*<\/tr>\s*<\/thead>/,
  '<th className="px-3 py-2">Estado</th>\n<th className="px-3 py-2 text-center">Factura Fiscal</th>\n</tr>\n</thead>'
);

content = content.replace(
  /(\s*)<td className="px-3 py-2">\s*<span className={`px-2 py-0\.5 rounded text-\[10px\] font-bold \${\s*p\.estado === 'Aprobado' \? 'bg-emerald-100 text-emerald-800' :\s*p\.estado === 'Por Verificar' \? 'bg-yellow-100 text-yellow-800' :\s*'bg-red-100 text-red-800'\s*}`}>{p\.estado}<\/span>\s*<\/td>\s*<\/tr>\s*\);\s*}/g,
  `$1<td className="px-3 py-2">
                                <span className={\`px-2 py-0.5 rounded text-[10px] font-bold \${
                                  p.estado === 'Aprobado' ? 'bg-emerald-100 text-emerald-800' :
                                  p.estado === 'Por Verificar' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }\`}>{p.estado}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {det.factura_digital?.emitida && det.factura_digital?.url ? (
                                  <a href={det.factura_digital.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium shadow-sm transition-colors">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    Ver Factura TFHKA
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400 font-medium">No disponible</span>
                                )}
                              </td>
                            </tr>
                          );
                        }`
);

fs.writeFileSync(path, content, 'utf8');
console.log("Patched UI");
