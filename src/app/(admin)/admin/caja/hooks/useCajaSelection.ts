/**
 * useCajaSelection.ts
 * Hook que encapsula toda la lógica de selección de recibos en caja:
 * - sortedRecibos (useMemo)
 * - toggleRecibo (con auto-selección de mismo local y validación de orden cronológico)
 * - toggleCuota / toggleServicio / toggleTalaPoda
 *
 * Extraído de caja/page.tsx como parte de la Fase 2 de refactorización.
 */
import { useMemo, useCallback } from 'react';
import { getUserInmuebles, isSameLocal } from '@/lib/cajaHelpers';

interface UseCajaSelectionParams {
  recibos: any[];
  freshInmuebles: any[];
  condominioHijos: any[];
  inmuebles: any[];
  foundUser: any;
  selectedRecibos: string[];
  setSelectedRecibos: (refs: string[]) => void;
  selectedCuotas: { convId: string; cuotaId: number }[];
  setSelectedCuotas: (cuotas: { convId: string; cuotaId: number }[]) => void;
  selectedServicios: string[];
  setSelectedServicios: (refs: string[]) => void;
  selectedTalaPoda: string[];
  setSelectedTalaPoda: (refs: string[]) => void;
  isItemPending: (ref: string) => boolean;
}

export function useCajaSelection({
  recibos,
  freshInmuebles,
  condominioHijos,
  inmuebles,
  foundUser,
  selectedRecibos,
  setSelectedRecibos,
  selectedCuotas,
  setSelectedCuotas,
  selectedServicios,
  setSelectedServicios,
  selectedTalaPoda,
  setSelectedTalaPoda,
  isItemPending,
}: UseCajaSelectionParams) {

  // ─── Orden estable de recibos (useMemo — evita re-sort en cada render) ────────
  const sortedRecibos = useMemo(
    () =>
      [...recibos].sort((a: any, b: any) => {
        const aIsCM = a.referencia?.startsWith('CM-');
        const bIsCM = b.referencia?.startsWith('CM-');
        if (!aIsCM && bIsCM) return -1;
        if (aIsCM && !bIsCM) return 1;
        return (a.emision || '').localeCompare(b.emision || '');
      }),
    [recibos]
  );

  // ─── toggleRecibo ──────────────────────────────────────────────────────────────
  const toggleRecibo = useCallback(
    (ref: string) => {
      const userInms = getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser);

      const currentR = recibos.find((r: any) => r.referencia === ref);
      if (!currentR) return;

      // Identificar el inmueble del recibo tocado
      const parts = ref.split('-');
      let currentInmId: string | null = parts.length > 2 ? parts[2] : null;
      if (ref.startsWith('CM-')) {
        currentInmId =
          userInms.find((i: any) => ref.includes(i.inmueble))?.inmueble ?? null;
      }

      const currentInm = userInms.find((i: any) => i.inmueble === currentInmId);
      let refsToToggle = [ref];

      // Auto-selección: recibos del mismo mes para los mismos locales fue eliminada a petición del usuario.

      // Bloquear si alguno está Por Verificar
      if (refsToToggle.some((r) => isItemPending(r))) {
        alert(
          'Uno o más recibos del mismo local tienen un pago por transferencia asociado que está Por Verificar. Espere su aprobación (Conciliación).'
        );
        return;
      }

      if (selectedRecibos.includes(ref)) {
        // ── Deseleccionar: eliminar este y todos los más nuevos del mismo inmueble ─
        let toRemove = [...refsToToggle];
        refsToToggle.forEach((tRef) => {
          const cIdx = sortedRecibos.findIndex((r: any) => r.referencia === tRef);
          if (cIdx !== -1) {
            const refParts = tRef.split('-');
            const inmuebleId = refParts.length >= 3 ? `${refParts[1]}-${refParts[2]}` : null;
            if (inmuebleId) {
              const subs = sortedRecibos
                .slice(cIdx)
                .filter((r: any) => (r.referencia || '').includes(inmuebleId))
                .map((r: any) => r.referencia);
              toRemove = [...toRemove, ...subs];
            } else {
              toRemove = [...toRemove, ...sortedRecibos.slice(cIdx).map((r: any) => r.referencia)];
            }
          }
        });
        setSelectedRecibos(selectedRecibos.filter((r) => !toRemove.includes(r)));
      } else {
        // ── Seleccionar: validar que no se salte meses anteriores ────────────────
        for (const tRef of refsToToggle) {
          const cIdx = sortedRecibos.findIndex((r: any) => r.referencia === tRef);
          if (cIdx !== -1) {
            const refParts = tRef.split('-');
            const inmuebleId = refParts.length >= 3 ? `${refParts[1]}-${refParts[2]}` : null;
            if (inmuebleId) {
              const previousSameInmueble = sortedRecibos
                .slice(0, cIdx)
                .filter((r: any) => (r.referencia || '').includes(inmuebleId))
                .map((r: any) => r.referencia);
              const missingPrevious = previousSameInmueble.some(
                (pr) => !selectedRecibos.includes(pr) && !refsToToggle.includes(pr) && !isItemPending(pr)
              );
              if (missingPrevious) {
                alert(
                  '¡No se puede adelantar meses! Debe seleccionar y pagar las deudas más antiguas de este inmueble primero.'
                );
                return;
              }
            } else {
              const previousRefs = sortedRecibos.slice(0, cIdx).map((r: any) => r.referencia);
              const missingPrevious = previousRefs.some(
                (pr) => !selectedRecibos.includes(pr) && !refsToToggle.includes(pr) && !isItemPending(pr)
              );
              if (missingPrevious) {
                alert('¡No se puede adelantar meses! Debe seleccionar y pagar las deudas más antiguas primero.');
                return;
              }
            }
          }
        }
        const newSelected = [...selectedRecibos];
        refsToToggle.forEach((tr) => {
          if (!newSelected.includes(tr)) newSelected.push(tr);
        });
        setSelectedRecibos(newSelected);
      }
    },
    [
      recibos,
      sortedRecibos,
      freshInmuebles,
      condominioHijos,
      inmuebles,
      foundUser,
      selectedRecibos,
      setSelectedRecibos,
      isItemPending,
    ]
  );

  // ─── toggleCuota ──────────────────────────────────────────────────────────────
  const toggleCuota = useCallback(
    (convId: string, cuotaId: number) => {
      const exists = selectedCuotas.find(
        (c) => c.convId === convId && c.cuotaId === cuotaId
      );
      if (exists) {
        setSelectedCuotas(
          selectedCuotas.filter((c) => !(c.convId === convId && c.cuotaId === cuotaId))
        );
      } else {
        setSelectedCuotas([...selectedCuotas, { convId, cuotaId }]);
      }
    },
    [selectedCuotas, setSelectedCuotas]
  );

  // ─── toggleServicio ───────────────────────────────────────────────────────────
  const toggleServicio = useCallback(
    (ref: string) => {
      if (selectedServicios.includes(ref)) {
        setSelectedServicios(selectedServicios.filter((r) => r !== ref));
      } else {
        setSelectedServicios([...selectedServicios, ref]);
      }
    },
    [selectedServicios, setSelectedServicios]
  );

  // ─── toggleTalaPoda ───────────────────────────────────────────────────────────
  const toggleTalaPoda = useCallback(
    (ref: string) => {
      if (selectedTalaPoda.includes(ref)) {
        setSelectedTalaPoda(selectedTalaPoda.filter((r) => r !== ref));
      } else {
        setSelectedTalaPoda([...selectedTalaPoda, ref]);
      }
    },
    [selectedTalaPoda, setSelectedTalaPoda]
  );

  return { sortedRecibos, toggleRecibo, toggleCuota, toggleServicio, toggleTalaPoda };
}
