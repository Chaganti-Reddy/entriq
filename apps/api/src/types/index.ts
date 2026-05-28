// apps/api/src/types/index.ts
import type { Context } from 'hono';
import type { JWTPayload } from '@entriq/shared';

// Hono context with authenticated user attached by auth middleware
export type AppEnv = {
  Variables: {
    user: JWTPayload;
  };
};

export type AppContext = Context<AppEnv>;

// Re-export shared types for convenience
export * from '@entriq/shared';
