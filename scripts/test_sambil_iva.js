const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { isResidencialInm } = require('./src/lib/condominios/motor.ts'); // Wait, ts can't be required easily.
// I will just copy the `isResidencialInm` logic or query directly.
