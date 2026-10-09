require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
// Need TS compilation? I'll use ts-node
