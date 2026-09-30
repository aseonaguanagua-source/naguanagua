import * as cheerio from 'cheerio';
import https from 'https';

export async function getTasaBCV(sync: boolean = false) {
  // 0. Revisar si hay una tasa manual en la base de datos
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (supabaseUrl && supabaseKey) {
      const dbRes = await fetch(`${supabaseUrl}/rest/v1/sistema_config?id=eq.tasa_bcv_manual&select=valor`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        cache: 'no-store'
      });
      if (dbRes.ok) {
        const rows = await dbRes.json();
        if (rows && rows.length > 0 && rows[0].valor) {
          const manualRate = parseFloat(rows[0].valor);
          if (!isNaN(manualRate) && manualRate > 0) {
            return {
              success: true,
              euro: manualRate,
              usd: manualRate,
              tcmmv: manualRate,
              timestamp: new Date().toISOString(),
              source: 'manual-db'
            };
          }
        }
      }
    }
  } catch(e) {
    console.error('Error fetching manual rate:', e);
  }

  // 0.5 Revisar si hay una tasa semanal y qué día es hoy
  let tasaSemanalGuardada = null;
  let fechaSemanalGuardada = null;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (supabaseUrl && supabaseKey) {
      const dbRes = await fetch(`${supabaseUrl}/rest/v1/sistema_config?id=eq.tasa_bcv_semanal&select=valor,updated_at`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        cache: 'no-store'
      });
      if (dbRes.ok) {
        const rows = await dbRes.json();
        if (rows && rows.length > 0 && rows[0].valor) {
          tasaSemanalGuardada = parseFloat(rows[0].valor);
          fechaSemanalGuardada = rows[0].updated_at;
        }
      }
    }
  } catch(e) {
    console.error('Error fetching semanal rate:', e);
  }

  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;

  // Si es fin de semana (sábado o domingo) y tenemos una tasa guardada, usarla (que será la del viernes)
  if (isWeekend && tasaSemanalGuardada !== null && !isNaN(tasaSemanalGuardada) && tasaSemanalGuardada > 0) {
    return {
      success: true,
      euro: tasaSemanalGuardada,
      usd: tasaSemanalGuardada,
      tcmmv: tasaSemanalGuardada,
      timestamp: fechaSemanalGuardada || today.toISOString(),
      source: 'semanal-db-congelada'
    };
  }

  try {
    // 1. Scraping directo de bcv.org.ve
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await fetch('https://www.bcv.org.ve/', { 
      // @ts-ignore
      agent,
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) throw new Error('BCV Website unreachable');
    const html = await response.text();
    const $ = cheerio.load(html);
    
    let euroText = $('#euro strong').text().trim().replace(',', '.');
    let usdText = $('#dolar strong').text().trim().replace(',', '.');
    
    let euroVal = parseFloat(euroText);
    let usdVal = parseFloat(usdText);

    if (isNaN(euroVal) || isNaN(usdVal)) {
      throw new Error('Could not parse BCV HTML correctly');
    }

    const tcmmv = euroVal; // Se usa estrictamente la tasa del Euro por ordenanza

    // Guardar como tasa guardada (se actualiza de lunes a viernes)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (supabaseUrl && supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/sistema_config?id=eq.tasa_bcv_semanal`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ valor: tcmmv.toString(), updated_at: new Date().toISOString() })
        });
      }
    } catch (e) {
      console.error('No se pudo actualizar la tasa semanal en la BD', e);
    }

    return {
      success: true,
      euro: euroVal,
      usd: usdVal,
      tcmmv: tcmmv,
      timestamp: new Date().toISOString(),
      source: 'bcv-scraped'
    };

  } catch (error: any) {
    console.error('Error scraping BCV, falling back:', error.message);
    
    // Fallback 1: DolarAPI
    try {
      const [usdRes, eurRes] = await Promise.all([
        fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' }),
        fetch('https://ve.dolarapi.com/v1/euros/oficial', { cache: 'no-store' })
      ]);
      const usdData = await usdRes.json();
      const eurData = await eurRes.json();
      
      const usdVal = usdData.promedio;
      const euroVal = eurData.promedio;
      
      const tcmmv = euroVal; // Estrictamente tasa Euro

      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (supabaseUrl && supabaseKey) {
          await fetch(`${supabaseUrl}/rest/v1/sistema_config?id=eq.tasa_bcv_semanal`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ valor: tcmmv.toString(), updated_at: new Date().toISOString() })
          });
        }
      } catch (e) {}

      return {
        success: true,
        euro: euroVal,
        usd: usdVal,
        tcmmv: tcmmv,
        timestamp: eurData.fechaActualizacion || new Date().toISOString(),
        source: 'dolarapi-cached'
      };
    } catch (e2: any) {
       console.error('DolarAPI failed:', e2.message);
       return {
          success: false,
          euro: 0,
          usd: 0,
          tcmmv: 0,
          error: "No se pudo contactar a la API de tasas de manera confiable"
       };
    }
  }
}
