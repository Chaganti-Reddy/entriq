// apps/web/stores/superAdminAuth.ts
// Separate Zustand store for super admin session — kept isolated from org auth.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SuperAdminState {
  token:           string | null;
  refreshToken:    string | null;
  isAuthenticated: boolean;
  _hasHydrated:    boolean;

  setAuth:        (token: string, refreshToken: string) => void;
  clearAuth:      () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useSuperAdminStore = create<SuperAdminState>()(
  persist(
    (set) => ({
      token:           null,
      refreshToken:    null,
      isAuthenticated: false,
      _hasHydrated:    false,

      setAuth: (token, refreshToken) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('entriq_sa_token', token);
          localStorage.setItem('entriq_sa_refresh_token', refreshToken);
        }
        set({ token, refreshToken, isAuthenticated: true });
      },

      clearAuth: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('entriq_sa_token');
          localStorage.removeItem('entriq_sa_refresh_token');
        }
        set({ token: null, refreshToken: null, isAuthenticated: false });
      },

      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'entriq-sa-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token:           state.token,
        refreshToken:    state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
