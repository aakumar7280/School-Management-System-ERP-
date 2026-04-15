import { NavLink } from 'react-router-dom';
import { PropsWithChildren } from 'react';

import { clearSession } from '../auth/session';
import { AuthSession } from '../auth/types';

/* ── SVG icon components (inline, no extra deps) ── */
const icons: Record<string, JSX.Element> = {
  Dashboard: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
    </svg>
  ),
  'Student Management': (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0121 12.765M12 14l-6.16-3.422A12.083 12.083 0 003 12.765M12 14v7" />
    </svg>
  ),
  'Staff Management': (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Finance: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Classes: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  Settings: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  'Teacher Portal': (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  Profile: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Fees: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
};

function getIcon(label: string): JSX.Element | null {
  return icons[label] ?? null;
}

function getNavItems(role: string) {
  if (role === 'TEACHER') return [{ to: '/teacher/portal', label: 'Teacher Portal' }];
  if (role === 'STUDENT') {
    return [
      { to: '/student/dashboard', label: 'Dashboard' },
      { to: '/student/profile', label: 'Profile' },
      { to: '/student/fees', label: 'Fees' }
    ];
  }
  if (role === 'PARENT') {
    return [
      { to: '/parent/dashboard', label: 'Dashboard' },
      { to: '/parent/profile', label: 'Profile' },
      { to: '/parent/fees', label: 'Fees' }
    ];
  }

  return [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/students', label: 'Student Management' },
    { to: '/admin/staff', label: 'Staff Management' },
    { to: '/admin/finance/dashboard', label: 'Finance' },
    { to: '/admin/classes', label: 'Classes' },
    { to: '/admin/settings', label: 'Settings' }
  ];
}

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'ADMIN': return 'bg-brand-navy/10 text-brand-navy';
    case 'TEACHER': return 'bg-brand-orange/10 text-brand-orange';
    case 'STUDENT': return 'bg-brand-sky/10 text-brand-sky';
    case 'PARENT': return 'bg-emerald-50 text-emerald-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function canAccessWebsiteQuickLink(role: string) {
  return role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN' || role === 'ACCOUNTANT';
}

interface MainLayoutProps extends PropsWithChildren {
  session: AuthSession;
  onLogout: () => void;
}

export function MainLayout({ children, session, onLogout }: MainLayoutProps) {
  const navItems = getNavItems(session?.user.role ?? '');
  const websiteUrl =
    import.meta.env.VITE_SCHOOL_WEBSITE_URL ??
    localStorage.getItem('school_website_url') ??
    'http://localhost:5500/school-website/index.html';

  function handleLogout() {
    clearSession();
    onLogout();
  }

  function handleOpenSchoolWebsite(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    clearSession();
    onLogout();
    window.location.href = websiteUrl;
  }

  return (
    <div className="min-h-screen bg-brand-light text-slate-800">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-navy to-brand-sky text-sm font-bold text-white shadow-sm">
              S
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-brand-navy">School ERP</h1>
              <p className="text-[11px] leading-none text-slate-400">Management System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getRoleBadgeColor(session?.user.role ?? '')}`}>
                {session?.user.role}
              </span>
              <span className="text-sm font-medium text-slate-700">{session?.user.name}</span>
            </div>
            {canAccessWebsiteQuickLink(session?.user.role ?? '') ? (
              <a
                href={websiteUrl}
                onClick={handleOpenSchoolWebsite}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="Open School Website"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
                </svg>
                <span className="hidden sm:inline">School Website</span>
              </a>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <span className="hidden sm:inline">Logout</span>
              <svg className="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-12 gap-0 md:gap-0">
        {/* Sidebar */}
        <aside className="col-span-12 border-r border-slate-200/60 bg-white px-3 py-4 md:sticky md:top-[57px] md:col-span-3 md:h-[calc(100vh-57px)] md:overflow-y-auto md:shadow-sidebar lg:col-span-2">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-brand-navy text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-brand-navy'
                  }`
                }
              >
                {getIcon(item.label)}
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="col-span-12 min-h-[calc(100vh-57px)] p-5 md:col-span-9 lg:col-span-10 lg:p-6">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
