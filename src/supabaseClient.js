import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Mafdesh] Missing Supabase configuration. ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in your .env file. ' +
    'VITE_SUPABASE_PUBLISHABLE_KEY is still accepted as a fallback. ' +
    'Check your environment variables and restart the dev server.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
