interface RolePortalPageProps {
  title: string;
  description: string;
  features?: string[];
}

export function RolePortalPage({ title, description, features = [] }: RolePortalPageProps) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">{title}</h2>
        <p className="mt-1 text-slate-500">{description}</p>
      </div>

      {features.length > 0 ? (
        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Included Modules</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {features.map((feature) => (
              <article key={feature} className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </span>
                {feature}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
