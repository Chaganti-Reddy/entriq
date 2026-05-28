// apps/web/app/super-admin/login/page.tsx
// Super admin login page — completely isolated from org login.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useSuperAdminStore } from '@/stores/superAdminAuth';
import { saApi } from '@/lib/saApi';

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

export default function SuperAdminLoginPage() {
  const router  = useRouter();
  const { setAuth } = useSuperAdminStore();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await saApi.post('/auth/super-admin/login', data);
      setAuth(res.token, res.refreshToken);
      toast.success('Welcome, Super Admin');
      router.push('/super-admin');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setError('Invalid email or password.');
      } else {
        toast.error('Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className={`bg-zinc-900 border rounded-2xl p-8 shadow-2xl shadow-black/50 ${error ? 'border-red-500/30' : 'border-zinc-800'}`}>
          <div className="flex flex-col items-center mb-8 gap-2">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-zinc-100">Super Admin</h1>
            <p className="text-sm text-zinc-500">Platform control panel</p>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" className="mt-1.5" error={!!errors.email} {...register('email')} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" className="mt-1.5" error={!!errors.password} {...register('password')} />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in →'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
