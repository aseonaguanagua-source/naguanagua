import fs from 'fs';
import { ordenanzaData } from './src/data/ordenanza';

async function generateCSV() {
  // Fetch current exchange rate
  let tcmmv = 45.0; // fallback
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/euros/oficial');
    const data = await res.json();
    if (data && data.promedio) tcmmv = data.promedio;
  } catch (e) {
    console.log("No se pudo obtener la tasa, usando 45.0");
  }

  const actividades = [...ordenanzaData.actividadesComerciales, ...(ordenanzaData.actividadesIndustriales || [])];
  
  let csv = 'ACTIVIDAD;GENERACION;TOTAL F.O.;MONTO SIN IVA;IVA 16%;MONTO TOTAL;$;MULTA AL 12%;TOTAL INCLUYENDO MULTAS\n';

  for (const act of actividades) {
    const niveles = ['BAJA', 'MEDIA', 'ALTA'];
    for (let i = 0; i < 3; i++) {
      const nivel = niveles[i];
      let fo = act.factores[i];
      if (fo === 0) fo = 1.98; // Apply the fallback we used in the system
      
      const montoSinkIVA = fo * 57 * 0.128 * tcmmv;
      const iva = montoSinkIVA * 0.16;
      const montoTotal = montoSinkIVA + iva;
      const usd = montoTotal / tcmmv;
      const multa = montoSinkIVA * 0.12;
      const granTotal = montoTotal + multa;

      // Format numbers with comma for decimals for Excel ES
      const fmt = (n: number) => n.toFixed(2).replace('.', ',');
      
      csv += `${act.label};${nivel};${fmt(fo)};${fmt(montoSinkIVA)};${fmt(iva)};${fmt(montoTotal)};${fmt(usd)};${fmt(multa)};${fmt(granTotal)}\n`;
    }
  }

  fs.writeFileSync('public/Tarifas_Comerciales.csv', csv);
  console.log('Archivo guardado en public/Tarifas_Comerciales.csv');
}

generateCSV();
