const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetHeader = `<th className="px-3 py-2">Estado</th>
                        </tr>
                      </thead>`;
const replaceHeader = `<th className="px-3 py-2">Estado</th>
                          <th className="px-3 py-2 text-center">Factura Fiscal</th>
                        </tr>
                      </thead>`;

content = content.replace(targetHeader, replaceHeader);

const targetTd = `<span className={\`px-2 py-0.5 rounded text-[10px] font-bold \${
                                  p.estado === 'Aprobado' ? 'bg-emerald-100 text-emerald-800' :
                                  p.estado === 'Por Verificar' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }\`}>{p.estado}</span>
                              </td>
                            </tr>`;
const replaceTd = `<span className={\`px-2 py-0.5 rounded text-[10px] font-bold \${
                                  p.estado === 'Aprobado' ? 'bg-emerald-100 text-emerald-800' :
                                  p.estado === 'Por Verificar' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }\`}>{p.estado}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {det.factura_digital?.emitida && det.factura_digital?.url ? (
                                  <a href={det.factura_digital.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium shadow-sm transition-colors">
                                    <FileText className="w-3 h-3" />
                                    Ver Factura TFHKA
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400 font-medium">No disponible</span>
                                )}
                              </td>
                            </tr>`;

content = content.replace(targetTd, replaceTd);

fs.writeFileSync(path, content, 'utf8');
console.log("File patched.");
