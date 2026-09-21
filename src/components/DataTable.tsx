'use client';
import React, { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  itemsPerPage?: number;
  searchable?: boolean;
}

export function DataTable<T extends Record<string, any>>({ data, columns, itemsPerPage: defaultPerPage = 25, searchable = true }: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [perPage, setPerPage] = useState(defaultPerPage);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const filteredData = React.useMemo(() => {
    return data.filter((item) => {
      if (!debouncedSearchTerm) return true;
      return Object.values(item).some((val) =>
        String(val).toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      );
    });
  }, [data, debouncedSearchTerm]);

  const totalPages = Math.ceil(filteredData.length / perPage);
  const startIndex = (currentPage - 1) * perPage;
  const currentData = filteredData.slice(startIndex, startIndex + perPage);

  const goToPage = (p: number) => setCurrentPage(Math.min(Math.max(1, p), totalPages || 1));

  return (
    <div className="bg-white rounded shadow flex flex-col w-full text-sm">
      {/* Header controls */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2 bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Mostrar</span>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="border border-slate-300 rounded px-2 py-1 text-slate-700 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>registros</span>
          {filteredData.length !== data.length && (
            <span className="text-xs text-slate-400">(filtrados de {data.length})</span>
          )}
        </div>

        {searchable && (
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Buscar:</span>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-slate-300 rounded pl-2 pr-8 py-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-400 text-sm"
                placeholder="Buscar..."
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-2 top-1.5" />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white border-b border-slate-200">
              {columns.map((col, idx) => (
                <th key={idx} className="px-4 py-3 font-semibold text-[10px] uppercase text-slate-900 tracking-wider">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentData.length > 0 ? (
              currentData.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className="px-4 py-3 text-slate-600">
                      {col.render ? col.render(row) : (row[col.key] as React.ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                  {searchTerm ? 'No se encontraron resultados.' : 'Ningún dato disponible en esta tabla'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center flex-wrap gap-2">
        <span className="text-xs text-slate-500">
          {filteredData.length === 0 ? 'Sin registros' : `Mostrando ${startIndex + 1}–${Math.min(startIndex + perPage, filteredData.length)} de ${filteredData.length} registros`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className="px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >«</button>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          ><ChevronLeft className="w-4 h-4" /></button>
          {/* Page numbers — ventana de hasta 5 páginas sin duplicados */}
          {(() => {
            if (totalPages <= 1) return null;
            const maxVisible = 5;
            let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
            let end = start + maxVisible - 1;
            if (end > totalPages) {
              end = totalPages;
              start = Math.max(1, end - maxVisible + 1);
            }
            return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(pg => (
              <button
                key={pg}
                onClick={() => goToPage(pg)}
                className={`px-2.5 py-1 text-xs rounded border ${currentPage === pg ? 'bg-blue-500 text-white border-blue-500' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
              >{pg}</button>
            ));
          })()}

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages || totalPages === 0}
            className="p-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          ><ChevronRight className="w-4 h-4" /></button>
          <button
            onClick={() => goToPage(totalPages)}
            disabled={currentPage >= totalPages || totalPages === 0}
            className="px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >»</button>
        </div>
      </div>
    </div>
  );
}
