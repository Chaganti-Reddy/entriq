// apps/api/src/lib/env.ts
// Central env accessor that works in both CF Workers and Node.js.
// In CF Workers, bindings are passed via the fetch `env` param (not process.env).
// Call setCFEnv(env) at the top of every request before any handler reads env vars.

let _cfEnv: Record<string, string> = {};

export function setCFEnv(env: Record<string, string>): void {
  _cfEnv = env;
}

export function getEnv(key: string): string {
  // Try CF env binding first (handles both vars and secrets)
  const cfVal = Reflect.get(_cfEnv, key);
  if (cfVal) return cfVal as string;
  // Fallback to process.env (local dev / Node.js)
  return (process.env[key] as string) ?? '';
}
