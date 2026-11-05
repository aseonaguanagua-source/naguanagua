import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey =
    typeof window === 'undefined'
        ? process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey
        : supabaseAnonKey;

const customFetch: typeof fetch = async (input, init) => {
    if (typeof window !== 'undefined' && supabaseUrl) {
        const rawUrl =
            typeof input === 'string'
                ? input
                : input instanceof URL
                ? input.toString()
                : input.url;

        if (
            rawUrl.startsWith(`${supabaseUrl}/rest/v1/`) ||
            rawUrl.startsWith(`${supabaseUrl}/storage/v1/`)
        ) {
            const proxiedUrl = `/api/supabase-rest/${rawUrl.slice(supabaseUrl.length + 1)}`;
            return fetch(proxiedUrl, init);
        }
    }
    return fetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: typeof window !== 'undefined',
    },
    global: {
        fetch: customFetch,
    },
});
