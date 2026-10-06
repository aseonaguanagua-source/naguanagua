/**
 * Pruebas del motor de condominios. Ejecutar:
 *   npx tsx --tsconfig tsconfig.json src/lib/condominios/motor.test.ts
 */
import assert from 'node:assert/strict';
import { pendienteDesdeParaMeses, mesesPendientes, periodosPendientes, avanzarPendiente, cargoMensual, cargoMensualUnidad, cargosPorUnidad, aplicarAbono, multaLaPagaLaUnidad, SIN_REGISTRAR, deudaPorMeses, esCondominioReal, modalidadSugerida, tarifaDesocupadaBs, Condominio } from './motor';

const TASA = 977.22;
let ok = 0;
const t = (nombre: string, fn: () => void) => { fn(); ok++; console.log('  ✓', nombre); };
const cerca = (a: number, b: number, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

console.log('Motor de condominios');

t('Residencial centralizado: cantidad declarada × tarifa', () => {
  const c: Condominio = { codigo: 'URBX', tipo: 'RESIDENCIAL', modalidad: 'CENTRALIZADO', cant_declarada: 10, actividad: 'APARTAMENTO (ZONA A)', tarifa_mmv: 0.618 };
  const r = cargoMensual(c, [], TASA);
  const unit = r.tarifaUnidadBs;
  assert.ok(unit > 0);
  cerca(r.condominioBs, unit * 10);
  assert.equal(r.unidadesCobradas, 10);
});

t('Se cobra la DECLARADA aunque haya menos unidades registradas', () => {
  const c: Condominio = { codigo: 'URBX', tipo: 'COMERCIAL', modalidad: 'MIXTO_COMERCIAL', cant_declarada: 565, tarifa_mmv: 1.98 };
  const r = cargoMensual(c, Array(546).fill({ estado: 'Activa' }), TASA);
  cerca(r.condominioBs, r.tarifaUnidadBs * 565, 1);
});

t('Desocupadas pagan 1,98 MMV', () => {
  const c: Condominio = { codigo: 'URBX', tipo: 'COMERCIAL', modalidad: 'MIXTO_COMERCIAL', cant_declarada: 3, tarifa_mmv: 6.12 };
  const r = cargoMensual(c, [{ estado: 'Activa' }, { estado: 'Desocupada' }, { estado: 'Activa' }], TASA);
  cerca(r.condominioBs, r.tarifaUnidadBs * 2 + tarifaDesocupadaBs(TASA));
  cerca(tarifaDesocupadaBs(TASA), 1.98 * 57 * TASA * 0.128);
});

t('Pago individual: el condominio no genera cargo; la unidad sí', () => {
  const c: Condominio = { codigo: 'URB014903', tipo: 'COMERCIAL', modalidad: 'INDIVIDUAL', cant_declarada: 328, tarifa_mmv: 1.98 };
  assert.equal(cargoMensual(c, [], TASA).condominioBs, 0);
  assert.ok(cargoMensualUnidad(c, { estado: 'Activa', tarifa_mmv: 6.21 }, TASA) > 0);
  assert.equal(cargoMensualUnidad({ ...c, modalidad: 'MIXTO_COMERCIAL' }, { estado: 'Activa' }, TASA), 0);
});

t('Tarifa fija acordada', () => {
  const c: Condominio = { codigo: 'URBX', tipo: 'COMERCIAL', modalidad: 'TARIFA_FIJA', cant_declarada: 40, tarifa_fija_bs: 45008.92 };
  assert.equal(cargoMensual(c, [], TASA).condominioBs, 45008.92);
});

t('Deuda comercial: multa 12% salvo último mes, IVA 16%, sin retención', () => {
  const d = deudaPorMeses(3, 1000, false);
  assert.equal(d.baseBs, 3000);
  assert.equal(d.multaBs, 240);
  assert.equal(d.ivaBs, 480);
  assert.equal(d.totalBs, 3720);
  assert.equal(d.porMes[2].multaBs, 0);
});

t('Deuda comercial agente de retención: se descuenta 75% del IVA', () => {
  const d = deudaPorMeses(2, 1000, false, true);
  assert.equal(d.retencionBs, 240);
  assert.equal(d.totalBs, 2000 + 120 + 320 - 240);
});

t('Deuda residencial: multa 10%, sin IVA, la retención no aplica', () => {
  const d = deudaPorMeses(4, 500, true, true);
  assert.equal(d.multaBs, 150);
  assert.equal(d.ivaBs, 0);
  assert.equal(d.retencionBs, 0);
  assert.equal(d.totalBs, 2150);
});

t('0 meses = 0', () => assert.equal(deudaPorMeses(0, 1000, false).totalBs, 0));

t('Modalidad sugerida', () => {
  assert.equal(modalidadSugerida('URB030783', false), 'INDIVIDUAL');
  assert.equal(modalidadSugerida('URB1', true), 'CENTRALIZADO');
  assert.equal(modalidadSugerida('URB1', false), 'MIXTO_COMERCIAL');
});

t('Mismo dueño con varias actividades NO es condominio', () => {
  assert.equal(esCondominioReal({ identidad: 'J-123' }, [{ identidad: 'J123' }, { identidad: 'J-123' }]), false);
  assert.equal(esCondominioReal({ identidad: 'J-123' }, [{ identidad: 'J-123' }, { identidad: 'V-999' }]), true);
  assert.equal(esCondominioReal({ identidad: 'J-123' }, []), true);
});

t('Reparto por unidad: suma = cargo del condominio; las no registradas van en un grupo', () => {
  const c: Condominio = { codigo: 'URB016822', tipo: 'COMERCIAL', modalidad: 'MIXTO_COMERCIAL', cant_declarada: 565, tarifa_mmv: 1.98 };
  const unidades = Array.from({ length: 546 }, (_, i) => ({ id: `u${i}`, estado: 'Activa' as const }));
  const rep = cargosPorUnidad(c, unidades, TASA);
  assert.equal(rep.length, 547);
  assert.equal(rep.find(r => r.clave === SIN_REGISTRAR)!.cantidad, 19);
  assert.equal(Math.round(rep.reduce((s, r) => s + r.montoBs, 0) * 100) / 100, cargoMensual(c, unidades, TASA).condominioBs);
});

t('Reparto con más registradas que declaradas: total = declarada, cuadra al céntimo', () => {
  const c: Condominio = { codigo: 'URBX', tipo: 'RESIDENCIAL', modalidad: 'CENTRALIZADO', cant_declarada: 3, actividad: 'APARTAMENTO (ZONA A)', tarifa_mmv: 0.618 };
  const unidades = Array.from({ length: 7 }, (_, i) => ({ id: `u${i}`, estado: 'Activa' as const }));
  const rep = cargosPorUnidad(c, unidades, TASA);
  assert.equal(rep.length, 7);
  assert.equal(Math.round(rep.reduce((s, r) => s + r.montoBs, 0) * 100) / 100, cargoMensual(c, unidades, TASA).condominioBs);
});

t('Cobro con tarifa propia de cada unidad (condominio paga la suma)', () => {
  const c: Condominio = { codigo: 'URBX', tipo: 'COMERCIAL', modalidad: 'CENTRALIZADO', cant_declarada: 2, tarifa_mmv: 1.98, cobro_tarifa_por_unidad: true };
  const u = [{ id: 'a', estado: 'Activa' as const, tarifa_mmv: 82.99 }, { id: 'b', estado: 'Activa' as const, tarifa_mmv: 6.21 }];
  const rep = cargosPorUnidad(c, u, TASA);
  cerca(cargoMensual(c, u, TASA).condominioBs, rep[0].montoBs + rep[1].montoBs);
  assert.ok(rep[0].montoBs > rep[1].montoBs * 10);
});

t('Abono: cubre primero los meses más viejos; aseo antes que multa', () => {
  const deuda = [
    { clave: 'u1', periodo: '2026-09', montoBs: 100, concepto: 'ASEO' as const },
    { clave: 'u1', periodo: '2026-08', montoBs: 100, concepto: 'ASEO' as const },
    { clave: 'u1', periodo: '2026-08', montoBs: 12, concepto: 'MULTA' as const },
  ];
  const r = aplicarAbono(150, deuda);
  assert.deepEqual(r.aplicado.map(a => [a.periodo, a.concepto, a.pagadoBs, a.completo]), [
    ['2026-08', 'ASEO', 100, true], ['2026-08', 'MULTA', 12, true], ['2026-09', 'ASEO', 38, false],
  ]);
  assert.deepEqual(r.mesesCompletos, ['2026-08']);
  assert.equal(r.sobranteBs, 0);
  assert.equal(aplicarAbono(500, deuda).sobranteBs, 288);
});

t('Quién paga la multa', () => {
  assert.equal(multaLaPagaLaUnidad({ codigo: 'x', tipo: 'COMERCIAL', modalidad: 'MIXTO_COMERCIAL', cant_declarada: 1 }), true);
  assert.equal(multaLaPagaLaUnidad({ codigo: 'x', tipo: 'RESIDENCIAL', modalidad: 'CENTRALIZADO', cant_declarada: 1 }), false);
});

t('Períodos: N meses ↔ pendiente desde (último mes = mes anterior)', () => {
  const hoy = new Date('2026-10-06T15:00:00Z');
  assert.equal(pendienteDesdeParaMeses(1, hoy), '2026-09-01');
  assert.equal(pendienteDesdeParaMeses(13, hoy), '2025-09-01');
  assert.equal(pendienteDesdeParaMeses(0, hoy), null);
  assert.equal(mesesPendientes('2025-09-01', hoy), 13);
  assert.deepEqual(periodosPendientes('2026-07-01', hoy), ['2026-07', '2026-08', '2026-09']);
  assert.equal(avanzarPendiente('2026-07-01', 2, hoy), '2026-09-01');
  assert.equal(avanzarPendiente('2026-07-01', 3, hoy), null);
  // 1 de octubre a las 02:00 Caracas sigue siendo octubre
  assert.equal(pendienteDesdeParaMeses(1, new Date('2026-10-01T06:00:00Z')), '2026-09-01');
});

t('Tarifa por unidad (HMR): las unidades sin registrar no se cobran', () => {
  const c: Condominio = { codigo: 'URB009841', tipo: 'COMERCIAL', modalidad: 'CENTRALIZADO', cant_declarada: 39, tarifa_mmv: 62.13, cobro_tarifa_por_unidad: true };
  const rep = cargosPorUnidad(c, [{ id: 'hotel', estado: 'Activa', tarifa_mmv: 82.99 }, { id: 'dep', estado: 'Desocupada' }], TASA);
  assert.equal(rep.length, 2);
  assert.ok(!rep.some(r => r.clave === SIN_REGISTRAR));
});

console.log(`\n${ok} pruebas OK`);
