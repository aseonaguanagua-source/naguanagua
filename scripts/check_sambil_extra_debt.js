const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkExtraDebt() {
  const extraIds = [
    'URB016182', 'URB016159', 'URB016290',
    'URB016350', 'URB016165', 'URB035217',
    'URB035214', 'URB016237', 'URB016236',
    'URB016256', 'URB016368', 'URB016180',
    'URB016154', 'URB016191', 'URB016349',
    'URB016190', 'URB016329', 'URB016371',
    'URB034119', 'URB016330', 'URB016299',
    'URB034116', 'URB016325', 'URB016331',
    'URB035220', 'URB016189', 'URB016369',
    'URB016328', 'URB016322', 'URB016291',
    'URB016181', 'URB034117', 'URB016301',
    'URB016158', 'URB016188', 'URB016153',
    'URB016324', 'URB035216', 'URB016166',
    'URB016284', 'URB016193', 'URB034118',
    'URB016336', 'URB016198', 'URB016323'
  ];

  const { data: inms } = await sb.from('inmuebles').select('inmueble, deuda_mmv').in('inmueble', extraIds);
  let totalMmv = 0;
  for (const i of inms) {
    totalMmv += i.deuda_mmv || 0;
  }
  console.log(`Total Extra MMV: ${totalMmv}`);
  console.log(`Total Extra Bs: ${totalMmv * 55927.26}`);
}
checkExtraDebt();
