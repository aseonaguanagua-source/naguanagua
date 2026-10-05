import * as cheerio from 'cheerio';
import https from 'https';

/**
 * Obtiene la tasa oficial BCV (Euro / TCMMV) y la congela por toda la jornada diaria.
 * Evita que las deudas calculadas en la tarde difieran de las calculadas en la mañana
 * cuando el BCV publica la tasa con fecha valor del día hábil siguiente a la 1:30 PM.
 */
export async function getTasaBCV(sync: boolean = false) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // 1. Prioridad Máxima: Revisar si hay una tasa manual configurada por el administrador
  try {
    if (supabaseUrl && supabaseKey) {
      const dbRes = await fetch(`${supabaseUrl}/rest/v1/sistema_config?id=eq.tasa_bcv_manual&select=id,valor`, {
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
  } catch (e) {
    console.error('Error fetching manual rate:', e);
  }

  // 2. Fecha actual en zona horaria oficial de Venezuela (America/Caracas)
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const now = new Date();
  const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', weekday: 'short' }).format(now);
  const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';

  // 3. Revisar si ya existe una tasa diaria congelada para la jornada de HOY
  let tasaDiariaGuardada: number | null = null;
  let fechaDiariaGuardada: string | null = null;
  let tasaSemanalGuardada: number | null = null;

  try {
    if (supabaseUrl && supabaseKey) {
      const dbRes = await fetch(`${supabaseUrl}/rest/v1/sistema_config?id=in.(tasa_bcv_diaria,tasa_bcv_diaria_fecha,tasa_bcv_semanal)&select=id,valor`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        cache: 'no-store'
      });
      if (dbRes.ok) {
        const rows: Array<{ id: string; valor: string }> = await dbRes.json();
        rows.forEach(r => {
          if (r.id === 'tasa_bcv_diaria' && r.valor) tasaDiariaGuardada = parseFloat(r.valor);
          if (r.id === 'tasa_bcv_diaria_fecha' && r.valor) fechaDiariaGuardada = r.valor.trim();
          if (r.id === 'tasa_bcv_semanal' && r.valor) tasaSemanalGuardada = parseFloat(r.valor);
        });
      }
    }
  } catch (e) {
    console.error('Error fetching cached rates from sistema_config:', e);
  }

  // 4. Si NO es forzado (sync=false) y ya tenemos la tasa fijada para el día de HOY:
  // Retornar la tasa congelada del día. Esto GARANTIZA que los montos de la tarde sean EXACTAMENTE
  // iguales a los de la mañana, sin fluctuar por la publicación vespertina del BCV.
  if (!sync && fechaDiariaGuardada === todayStr && tasaDiariaGuardada && !isNaN(tasaDiariaGuardada) && tasaDiariaGuardada > 0) {
    return {
      success: true,
      euro: tasaDiariaGuardada,
      usd: tasaDiariaGuardada,
      tcmmv: tasaDiariaGuardada,
      timestamp: `${todayStr}T00:00:00-04:00`,
      source: 'diaria-congelada'
    };
  }

  // 5. Si es fin de semana y tenemos la tasa semanal fijada (del viernes), usarla
  if (!sync && isWeekend && tasaSemanalGuardada && !isNaN(tasaSemanalGuardada) && tasaSemanalGuardada > 0) {
    return {
      success: true,
      euro: tasaSemanalGuardada,
      usd: tasaSemanalGuardada,
      tcmmv: tasaSemanalGuardada,
      timestamp: `${todayStr}T00:00:00-04:00`,
      source: 'semanal-fin-de-semana'
    };
  }

  // 6. Consultar tasa oficial (scraping BCV o fallback DolarAPI)
  let euroVal = 0;
  let usdVal = 0;
  let source = 'bcv-scraped';

  try {
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
    
    const euroText = $('#euro strong').text().trim().replace(',', '.');
    const usdText = $('#dolar strong').text().trim().replace(',', '.');
    
    euroVal = parseFloat(euroText);
    usdVal = parseFloat(usdText);

    if (isNaN(euroVal) || isNaN(usdVal)) {
      throw new Error('Could not parse BCV HTML correctly');
    }
  } catch (error: any) {
    // Fallback: DolarAPI
    try {
      const [usdRes, eurRes] = await Promise.all([
        fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' }),
        fetch('https://ve.dolarapi.com/v1/euros/oficial', { cache: 'no-store' })
      ]);
      const usdData = await usdRes.json();
      const eurData = await eurRes.json();
      
      usdVal = parseFloat(usdData.promedio);
      euroVal = parseFloat(eurData.promedio);
      source = 'dolarapi-oficial';
    } catch (e2: any) {
      console.error('DolarAPI fallback failed:', e2.message);
      // Si todo falla y tenemos alguna tasa previa guardada, retornar esa
      if (tasaDiariaGuardada || tasaSemanalGuardada) {
        const fallback = tasaDiariaGuardada || tasaSemanalGuardada || 0;
        return {
          success: true,
          euro: fallback,
          usd: fallback,
          tcmmv: fallback,
          timestamp: new Date().toISOString(),
          source: 'cache-emergencia'
        };
      }
      return {
        success: false,
        euro: 0,
        usd: 0,
        tcmmv: 0,
        error: "No se pudo contactar a la API de tasas"
      };
    }
  }

  // Por Ordenanza Municipal el TCMMV es estrictamente la tasa del Euro
  const tcmmv = euroVal;

  // 7. Guardar en base de datos para congelar la tasa durante el día
  try {
    if (supabaseUrl && supabaseKey && tcmmv > 0) {
      await fetch(`${supabaseUrl}/rest/v1/sistema_config`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify([
          { id: 'tasa_bcv_diaria', valor: tcmmv.toString() },
          { id: 'tasa_bcv_diaria_fecha', valor: todayStr },
          { id: 'tasa_bcv_semanal', valor: tcmmv.toString() }
        ])
      });
    }
  } catch (e) {
    console.error('Error guardando tasa en sistema_config:', e);
  }

  return {
    success: true,
    euro: euroVal,
    usd: usdVal,
    tcmmv: tcmmv,
    timestamp: new Date().toISOString(),
    source
  };
}
