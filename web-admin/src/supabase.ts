import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Helper to normalize common paste errors (e.g. quotes, missing https, rest/v1 path)
function normalizeSupabaseUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  let u = raw.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  if (!/^https?:\/\//.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.pathname.startsWith('/rest/v1')) {
      u = parsed.origin;
    }
    return u;
  } catch {
    return undefined;
  }
}

const normalizedUrl = normalizeSupabaseUrl(url);

export const supabase = normalizedUrl && key ? createClient(normalizedUrl, key) : null;
