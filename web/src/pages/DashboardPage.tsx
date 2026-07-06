import { useQuery } from '@tanstack/react-query';
import { api, downloadCsv } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatCurrency } from '../lib/format';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function DashboardPage() {
  const { me, can } = useAuth();

  const kpisQ = useQuery({ queryKey: ['kpis'], queryFn: async () => (await api.get('/reports/kpis')).data });
  const sourceQ = useQuery({ queryKey: ['leads-by-source'], queryFn: async () => (await api.get('/reports/leads-by-source')).data as any[] });
  const funnelQ = useQuery({ queryKey: ['conversion-by-stage'], queryFn: async () => (await api.get('/reports/conversion-by-stage')).data });
  const repQ = useQuery({ queryKey: ['rep-activity'], queryFn: async () => (await api.get('/reports/rep-activity')).data as any[] });

  const k = kpisQ.data;
  const maxSource = Math.max(1, ...(sourceQ.data?.map((s) => s.count) ?? [1]));
  const maxStage = Math.max(1, ...(funnelQ.data?.stages?.map((s: any) => s.count) ?? [1]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome back, {me?.fullName.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">Last 30 days · scope {me?.role.dataScope.toLowerCase()}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Leads (30d)" value={String(k?.newLeads ?? '—')} hint={`${k?.totalLeads ?? 0} total`} />
        <Stat label="Open deals" value={String(k?.openDeals ?? '—')} />
        <Stat label="Weighted forecast" value={k ? formatCurrency(k.weightedForecast) : '—'} />
        <Stat label="Win rate" value={k ? `${k.winRate}%` : '—'} hint={k ? formatCurrency(k.wonValue) + ' won' : ''} />
        <Stat label="Avg speed-to-lead" value={k?.avgSpeedToLeadMins != null ? `${k.avgSpeedToLeadMins}m` : '—'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Leads by source + cost-per-lead */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Leads by source</h2>
            {can('report:export') && <button className="btn-ghost text-xs text-brand-600" onClick={() => downloadCsv('leads-by-source')}>Export CSV</button>}
          </div>
          <div className="space-y-3">
            {sourceQ.data?.length === 0 && <div className="text-sm text-slate-400">No leads yet.</div>}
            {sourceQ.data?.map((s) => (
              <div key={s.source}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-slate-700">{s.source}</span>
                  <span className="text-slate-400">
                    {s.count} leads · {s.converted} conv{s.costPerLead != null ? ` · ${formatCurrency(s.costPerLead)}/lead` : ''}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(s.count / maxSource) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conversion funnel */}
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Conversion by stage{funnelQ.data?.pipeline ? ` · ${funnelQ.data.pipeline.name}` : ''}</h2>
          <div className="space-y-2">
            {(!funnelQ.data?.pipeline) && <div className="text-sm text-slate-400">No pipeline yet.</div>}
            {funnelQ.data?.stages?.map((st: any) => (
              <div key={st.stageId} className="flex items-center gap-3">
                <div className="w-24 truncate text-xs text-slate-600">{st.name}</div>
                <div className="h-6 flex-1 rounded bg-slate-100">
                  <div className={`flex h-6 items-center justify-end rounded px-2 text-[10px] text-white ${st.isWon ? 'bg-green-500' : st.isLost ? 'bg-slate-400' : 'bg-brand-500'}`} style={{ width: `${Math.max((st.count / maxStage) * 100, st.count ? 12 : 0)}%` }}>
                    {st.count > 0 ? st.count : ''}
                  </div>
                </div>
                <div className="w-20 text-right text-xs text-slate-400">{formatCurrency(st.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rep activity leaderboard */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Rep activity</h2>
          {can('report:export') && <button className="btn-ghost text-xs text-brand-600" onClick={() => downloadCsv('rep-activity')}>Export CSV</button>}
        </div>
        <table className="w-full">
          <thead className="border-y border-slate-200 bg-slate-50">
            <tr><th className="th">Rep</th><th className="th">New leads</th><th className="th">Messages</th><th className="th">Calls</th><th className="th">Tasks</th><th className="th">Won value</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {repQ.data?.map((r) => (
              <tr key={r.userId}>
                <td className="td font-medium">{r.name}</td>
                <td className="td">{r.leads}</td>
                <td className="td">{r.messages}</td>
                <td className="td">{r.calls}</td>
                <td className="td">{r.activities}</td>
                <td className="td">{formatCurrency(r.wonValue)}</td>
              </tr>
            ))}
            {repQ.data?.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No activity yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
