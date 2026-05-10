'use client';

/**
 * Compact metric card for the dashboard top row.
 *
 * Props:
 *  - icon: lucide component (rendered with w-5/h-5)
 *  - label: short caption
 *  - value: number or string already formatted
 *  - sub: optional smaller line below the value (e.g. "vs semana pasada")
 *  - tone: 'orange' | 'emerald' | 'blue' | 'amber' (controls icon bg)
 *  - loading: when true, value renders as a pulsing skeleton
 */
const TONE = {
  orange:  { wrap: 'bg-orange-50',  text: 'text-orange-600' },
  emerald: { wrap: 'bg-emerald-50', text: 'text-emerald-600' },
  blue:    { wrap: 'bg-blue-50',    text: 'text-blue-600' },
  amber:   { wrap: 'bg-amber-50',   text: 'text-amber-600' },
};

export default function KpiCard({ icon: Icon, label, value, sub, tone = 'orange', loading = false }) {
  const t = TONE[tone] || TONE.orange;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
      <div className={`p-2 ${t.wrap} rounded-xl flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${t.text}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </p>
        {loading ? (
          <div className="h-7 w-20 bg-gray-100 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5 truncate">
            {value}
          </p>
        )}
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}
