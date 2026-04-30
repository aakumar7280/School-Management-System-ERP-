import { PropsWithChildren, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { clearSession } from '../auth/session';
import { AuthSession } from '../auth/types';

/* ── SVG icon components (inline, no extra deps) ── */
const icons: Record<string, JSX.Element> = {
  Dashboard: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
    </svg>
  ),
  Attendance: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
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
  if (role === 'TEACHER') {
    return [
      { to: '/teacher/dashboard', label: 'Dashboard' },
      { to: '/teacher/attendance', label: 'Attendance' }
    ];
  }
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

interface FeatureSearchItem {
  label: string;
  to: string;
  keywords: string[];
}

function getFeatureSearchItems(role: string): FeatureSearchItem[] {
  if (role === 'TEACHER') {
    return [
      { label: 'Dashboard', to: '/teacher/dashboard', keywords: ['teacher', 'home', 'dashboard', 'classes'] },
      { label: 'Attendance', to: '/teacher/attendance', keywords: ['teacher', 'attendance', 'records', 'present', 'absent'] }
    ];
  }

  if (role === 'STUDENT') {
    return [
      { label: 'Student Dashboard', to: '/student/dashboard', keywords: ['student', 'home', 'dashboard'] },
      { label: 'Student Profile', to: '/student/profile', keywords: ['profile', 'details'] },
      { label: 'Student Fees', to: '/student/fees', keywords: ['fees', 'invoice', 'payments'] }
    ];
  }

  if (role === 'PARENT') {
    return [
      { label: 'Parent Dashboard', to: '/parent/dashboard', keywords: ['parent', 'home', 'dashboard'] },
      { label: 'Parent Profile', to: '/parent/profile', keywords: ['profile', 'details'] },
      { label: 'Parent Fees', to: '/parent/fees', keywords: ['fees', 'invoice', 'payments'] }
    ];
  }

  return [
    { label: 'Dashboard', to: '/admin/dashboard', keywords: ['overview', 'home', 'analytics'] },
    { label: 'Students', to: '/admin/students', keywords: ['admissions', 'student management', 'profiles'] },
    { label: 'Staff', to: '/admin/staff', keywords: ['staff management', 'teachers', 'employees'] },
    { label: 'Finance Dashboard', to: '/admin/finance/dashboard', keywords: ['finance', 'summary', 'dues'] },
    { label: 'Fee Payments', to: '/admin/finance/fees', keywords: ['fees', 'transactions', 'collect fee'] },
    { label: 'Invoices', to: '/admin/finance/invoices', keywords: ['invoice', 'billing', 'download'] },
    { label: 'Salaries', to: '/admin/finance/salaries', keywords: ['salary', 'payroll'] },
    { label: 'Classes', to: '/admin/classes', keywords: ['classes', 'attendance', 'timetable'] },
    { label: 'Settings', to: '/admin/settings', keywords: ['settings', 'configuration'] }
  ];
}

export function MainLayout({ children, session, onLogout }: MainLayoutProps) {
  const navItems = getNavItems(session?.user.role ?? '');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const featureSearchItems = useMemo(() => getFeatureSearchItems(session?.user.role ?? ''), [session?.user.role]);
  const websiteUrl =
    import.meta.env.VITE_SCHOOL_WEBSITE_URL ??
    localStorage.getItem('school_website_url') ??
    'http://localhost:5500/school-website/index.html';

  const filteredSearchItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return featureSearchItems.slice(0, 6);
    }

    return featureSearchItems
      .filter((item) => {
        const inLabel = item.label.toLowerCase().includes(query);
        const inKeywords = item.keywords.some((keyword) => keyword.toLowerCase().includes(query));
        return inLabel || inKeywords;
      })
      .slice(0, 8);
  }, [featureSearchItems, searchText]);

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

  function handleFeatureSelect(to: string) {
    setSearchText('');
    setSearchOpen(false);
    navigate(to);
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

          <div className="relative hidden w-full max-w-xl flex-1 lg:block">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.85-5.65a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
              </svg>
              <input
                type="search"
                value={searchText}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 100)}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredSearchItems[0]) {
                    handleFeatureSelect(filteredSearchItems[0].to);
                  }
                }}
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                placeholder="Search features (students, invoices, fees...)"
                aria-label="Search ERP features"
              />
            </div>

            {searchOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                {filteredSearchItems.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-slate-400">No matching features</p>
                ) : (
                  <ul className="space-y-1">
                    {filteredSearchItems.map((item) => {
                      const isCurrent = location.pathname === item.to;
                      return (
                        <li key={`${item.label}-${item.to}`}>
                          <button
                            type="button"
                            onMouseDown={() => handleFeatureSelect(item.to)}
                            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
                              isCurrent ? 'bg-brand-sky/10 text-brand-navy' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{item.label}</span>
                            <span className="text-xs text-slate-400">{item.to}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
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
