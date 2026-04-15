import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { saveSession } from '../auth/session';
import { AuthSession } from '../auth/types';
import { login } from '../lib/api';

interface LoginPageProps {
  onLogin: (session: AuthSession) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('ADM001');
  const [password, setPassword] = useState('Pass@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const websiteUrl = params.get('website');

    if (websiteUrl) {
      localStorage.setItem('school_website_url', websiteUrl);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session = await login(loginId.trim(), password);
      saveSession(session);
      onLogin(session);
      navigate(session.portal, { replace: true });
    } catch (submitError) {
      if (submitError instanceof Error) {
        setError(submitError.message);
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-navy via-brand-navy/95 to-brand-sky/80 px-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold text-white shadow-lg backdrop-blur">
            S
          </div>
          <h1 className="text-2xl font-bold text-white">School ERP</h1>
          <p className="mt-1 text-sm text-white/60">School Management System</p>
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-white/10 bg-white p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-slate-800">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in with your role credentials.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="loginId">
                Login ID
              </label>
              <input
                id="loginId"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-sky focus:bg-white focus:ring-2 focus:ring-brand-sky/20"
                placeholder="ADM001 / TCH001 / STD001 / PAR001"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-sky focus:bg-white focus:ring-2 focus:ring-brand-sky/20"
                placeholder="Enter password"
                required
              />
            </div>

            {error ? (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                <span className="font-medium">Error:</span> {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-white/40">School ERP &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
