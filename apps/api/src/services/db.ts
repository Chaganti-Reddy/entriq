// apps/api/src/services/db.ts
// Two Supabase clients:
//  - db        (service role) — full DB access, bypasses RLS. Never expose to clients.
//  - anonDb    (anon key)     — used for Supabase Auth operations (signUp, signIn).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../lib/env.js';

const clientOpts = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
};

// Lazy singletons — deferred until first use so CF Workers env bindings
// are available at request time rather than module initialisation time.
let _db: SupabaseClient | null = null;
let _anonDb: SupabaseClient | null = null;

function getInstance(): SupabaseClient {
  if (!_db) {
    const url = getEnv('SUPABASE_URL');
    const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    _db = createClient(url, key, clientOpts);
  }
  return _db;
}

function getAnonInstance(): SupabaseClient {
  if (!_anonDb) {
    const url     = getEnv('SUPABASE_URL');
    const anonKey = getEnv('SUPABASE_ANON_KEY');
    if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    _anonDb = createClient(url, anonKey, clientOpts);
  }
  return _anonDb;
}

/** Service-role client — use for all DB queries (bypasses RLS). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db      = new Proxy({} as SupabaseClient, { get: (_, p) => (getInstance() as any)[p] });

/** Anon client — use for auth operations (signUp, signInWithPassword, getUser). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const anonDb  = new Proxy({} as SupabaseClient, { get: (_, p) => (getAnonInstance() as any)[p] });

