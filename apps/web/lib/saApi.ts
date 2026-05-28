// apps/web/lib/saApi.ts
// Axios instance for super admin API calls — uses separate SA token from localStorage.

import axios from 'axios';
import { useSuperAdminStore } from '@/stores/superAdminAuth';

export const saApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

saApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('entriq_sa_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

saApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = typeof window !== 'undefined'
        ? localStorage.getItem('entriq_sa_refresh_token')
        : null;
      if (!refreshToken) {
        useSuperAdminStore.getState().clearAuth();
        if (typeof window !== 'undefined') window.location.href = '/super-admin/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/auth/refresh`,
          { refreshToken }
        );
        // Update both localStorage and Zustand store
        localStorage.setItem('entriq_sa_token', data.token);
        useSuperAdminStore.getState().setAuth(data.token, refreshToken);
        original.headers.Authorization = `Bearer ${data.token}`;
        return saApi(original);
      } catch {
        useSuperAdminStore.getState().clearAuth();
        if (typeof window !== 'undefined') window.location.href = '/super-admin/login';
      }
    }
    return Promise.reject(error);
  }
);
