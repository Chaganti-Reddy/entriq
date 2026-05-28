// apps/web/stores/auth.ts
// Unified auth store: works for both plain participants and org members.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type MemberRole = 'admin' | 'co_organizer';
export type OrgStatus  = 'pending' | 'approved' | 'rejected' | 'suspended';

/** Unified user info — org fields present only if user is an org member */
export interface UserInfo {
  id:        string;
  name:      string;
  email:     string;
  // Org member fields (optional)
  memberId?:  string;
  role?:      MemberRole;
  orgId?:     string;
  orgName?:   string;
  orgStatus?: OrgStatus;
}

interface AuthState {
  token:           string | null;
  refreshToken:    string | null;
  user:            UserInfo | null;
  isAuthenticated: boolean;
  _hasHydrated:    boolean;

  setAuth:         (token: string, refreshToken: string, user: UserInfo) => void;
  clearAuth:       () => void;
  setHasHydrated:  (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token:           null,
      refreshToken:    null,
      user:            null,
      isAuthenticated: false,
      _hasHydrated:    false,

      setAuth: (token, refreshToken, user) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('entriq_token', token);
          localStorage.setItem('entriq_refresh_token', refreshToken);
        }
        set({ token, refreshToken, user, isAuthenticated: true });
      },

      clearAuth: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('entriq_token');
          localStorage.removeItem('entriq_refresh_token');
        }
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
      },

      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name:    'entriq-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token:           state.token,
        refreshToken:    state.refreshToken,
        user:            state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

