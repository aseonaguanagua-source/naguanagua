import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';

// Lee el ordenanza.ts
const code = fs.readFileSync('src/data/ordenanza.ts', 'utf8');
// Solo queremos extraer el JSON. Para no lidiar con imports locos, usemos una regex.
let actividadesComerciales = [];
// This is a hacky way since the real array is huge, let's just use ts-node properly by creating a package.json fix or modifying tsconfig.
