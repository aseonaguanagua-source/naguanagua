// Valida que la hoja "Deuda consolidada" cuadre con los totales del condominio. npx tsx scripts/saneamiento/val_excel_condo.ts URB003522
import { config } from 'dotenv';
config({ path: '.env.local' });
(async () => {
  const { cargarCondominio, calcularEstado } = await import('../../src/lib/condominios/servicio');
  for (const cod of process.argv.slice(2)) {
    const d: any = await cargarCondominio(cod);
    if (!d) { console.log(cod, 'no encontrado'); continue; }
    const e = calcularEstado(d.condo, d.unidades, 980.61472543, new Date(), d.multas);
    let sumMes = 0, desfase = 0;
    e.renglones.filter(r => !r.esGrupo).forEach(r => {
      const pm = r.deuda?.porMes || [];
      if ((r.periodos || []).length !== pm.length) desfase++;
      pm.forEach(m => { sumMes += m.baseBs + m.multaBs + m.ivaBs; });
    });
    const extra = e.renglones.reduce((s, r) => s + (r.multasManualesBs || 0) + (r.multaExtraBs || 0), 0);
    console.log(cod, { renglones: e.renglones.length, totalBs: Math.round(e.totales.totalBs * 100) / 100, consolidado: Math.round((sumMes + extra) * 100) / 100, retencion: e.totales.retencionBs, periodosDesfasados: desfase });
  }
})();
