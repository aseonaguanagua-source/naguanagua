/**
 * Pruebas del motor de condominios. Ejecutar:
 *   npx tsx --tsconfig tsconfig.json src/lib/condominios/motor.test.ts
 */
import assert from 'node:assert/strict';
import { cargoMensual, cargoMensualUnidad, deudaPorMeses, esCondominioReal, modalidadSugerida, tarifaDesocupadaBs, Condominio } from './motor';

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

console.log(`\n${ok} pruebas OK`);
