// apps/api/src/services/db.ts
// Two Supabase clients:
//  - db        (service role) — full DB access, bypasses RLS. Never expose to clients.
//  - anonDb    (anon key)     — used for Supabase Auth operations (signUp, signIn).

import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.SUPABASE_URL;
const supabaseKey     = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey)     throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseAnonKey)                 throw new Error('Missing SUPABASE_ANON_KEY environment variable');

const clientOpts = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
};

/** Service-role client — use for all DB queries (bypasses RLS). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = createClient(supabaseUrl, supabaseKey, clientOpts);

/** Anon client — use for auth operations (signUp, signInWithPassword, getUser). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const anonDb = createClient(supabaseUrl, supabaseAnonKey, clientOpts);

