const fs = require('fs');
let file = 'src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '<th className="px-3 py-2">Estado</th>\n                        </tr>',
  '<th className="px-3 py-2">Estado</th>\n                          <th className="px-3 py-2">Factura Digital</th>\n                        </tr>'
);

content = content.replace(
  /(\}<.*?p\.estado.*?<\/span>\n\s*<\/td>\n\s*)<\/tr>\n\s*\);\n/s,
  `$1<td className="px-3 py-2">
                                {det.factura_digital?.emitida ? (
                                  <a 
                                    href={det.factura_digital.url} 
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition-colors inline-block"
                                  >
                                    Ver Factura TFHKA
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-slate-400">---</span>
                                )}
                              </td>
                            </tr>
                          );
`
);

fs.writeFileSync(file, content);
