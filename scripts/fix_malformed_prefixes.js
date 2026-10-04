const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const targets = [
  { oldId: 'V-7537637+', cleanId: 'V-7537637' },
  { oldId: 'V-*6178986', cleanId: 'V-6178986' },
  { oldId: 'V-V14537734', cleanId: 'V-14537734' },
  { oldId: 'V-V16152454', cleanId: 'V-16152454' },
  { oldId: 'V-V14715469', cleanId: 'V-14715469' },
  { oldId: 'V-V7744287', cleanId: 'V-7744287' },
  { oldId: 'V-V2841685', cleanId: 'V-2841685' },
  { oldId: 'V-V3843321', cleanId: 'V-3843321' },
  { oldId: 'V-V11360324', cleanId: 'V-11360324' },
  { oldId: 'V-V15151087', cleanId: 'V-15151087' },
  { oldId: 'V-E00233', cleanId: 'E-00233' },
  { oldId: 'V-E00100', cleanId: 'E-00100' },
  { oldId: 'V-E00030', cleanId: 'E-00030' },
  { oldId: 'V-8 006098', cleanId: 'V-8006098' }
];

(async () => {
  console.log('Verifying collisions for syntax fixes...');
  for (const t of targets) {
    const { data: existClean } = await sb
      .from('contribuyentes')
      .select('identidad, nombre')
      .eq('identidad', t.cleanId)
      .maybeSingle();

    console.log(t.oldId + ' -> ' + t.cleanId + ': ' + (existClean ? 'COLLISION WITH ' + existClean.nombre : 'FREE (No collision)'));
  }
})();
