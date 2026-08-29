import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '@/lib/axios';
import useAuthStore from '@/stores/authStore';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Briefcase, Mail, Lock } from 'lucide-react';

/**
 * Dedicated client-portal sign-in.
 *
 * Only user accounts with `role === 'client'` may proceed. Employee/admin
 * accounts are shown a clear message pointing them to /login. This keeps the
 * two portals fully isolated at the entry point even though the underlying
 * `/api/auth/login` endpoint is shared.
 */
const ClientPortalLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const { settings, refresh } = useAppSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/client-portal';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      // Peek at the login response BEFORE committing it to the auth store,
      // so admins/employees hitting the client-portal form are rejected
      // WITHOUT briefly being authenticated (which would trip GuestRoute).
      const { data } = await api.post('/auth/login', { email, password });
      if (data?.role !== 'client') {
        // Best-effort session cleanup so no cookie is left behind.
        try { await api.post('/auth/logout'); } catch { /* ignore */ }
        setError('This account is not a client portal account. Please use the main sign-in at /login.');
        return;
      }
      // Role matches — commit to the store the normal way so app state syncs.
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh();
      navigate(from.startsWith('/client-portal') ? from : '/client-portal', { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Login failed. Check your credentials and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const brandName = settings?.brand_name || 'OfficeFlow';

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#09090B]">
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
          data-testid="client-portal-login-card"
        >
          <div className="bg-white dark:bg-[#18181B] rounded-xl border border-[#E2E8F0] dark:border-[#27272A] p-8 shadow-sm">
            <div className="text-center mb-8">
              {settings?.brand_logo_url ? (
                <img
                  src={settings.brand_logo_url}
                  alt="Brand"
                  className="w-16 h-16 mx-auto mb-4 object-contain rounded-xl"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="inline-flex items-center justify-center w-16 h-16 bg-[#0EA5E9] rounded-xl mb-4">
                  <Briefcase className="w-8 h-8 text-white" />
                </div>
              )}
              <div className="inline-block px-2 py-0.5 rounded-full bg-[#E0F2FE] dark:bg-[#0C4A6E]/40 text-[#0369A1] dark:text-sky-200 text-[10px] uppercase tracking-wider font-semibold mb-2">
                Client Portal
              </div>
              <h1 className="text-3xl font-bold text-[#0F172A] dark:text-[#FAFAFA] tracking-tight mb-2" data-testid="client-login-title">
                Client Sign In
              </h1>
              <p className="text-[#64748B] dark:text-[#A1A1AA]">
                Sign in to view your schedules, invoices and reports with {brandName}
              </p>
            </div>

            {error && (
              <div
                data-testid="client-login-error"
                className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="client-email" className="text-[#0F172A] dark:text-[#FAFAFA]">Client Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B] dark:text-[#A1A1AA]" />
                  <Input
                    id="client-email"
                    data-testid="client-login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-11"
                    placeholder="you@client-org.com"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-password" className="text-[#0F172A] dark:text-[#FAFAFA]">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B] dark:text-[#A1A1AA]" />
                  <Input
                    id="client-password"
                    data-testid="client-login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                data-testid="client-login-submit"
                disabled={isLoading}
                className="w-full bg-[#0EA5E9] hover:bg-[#0284C7] text-white h-11 rounded-lg transition-colors"
              >
                {isLoading ? 'Signing in...' : 'Sign In to Client Portal'}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-xs text-[#64748B] dark:text-[#A1A1AA]">
                Employees and admins:&nbsp;
                <Link to="/login" className="text-[#4F46E5] hover:underline">use the main sign-in</Link>
              </p>
              <p className="text-xs text-[#94A3B8] dark:text-[#71717A]">
                Don't have client access? Contact your {brandName} administrator.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-[#0EA5E9] to-[#0369A1] items-center justify-center p-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="text-white text-center max-w-lg"
        >
          <h2 className="text-5xl font-bold mb-6 tracking-tight">{brandName} · Client Portal</h2>
          <p className="text-xl text-sky-100 leading-relaxed">
            Live dispatch schedules, invoices, wage reports and post-site coverage — everything you need to keep your operation on track.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default ClientPortalLogin;
