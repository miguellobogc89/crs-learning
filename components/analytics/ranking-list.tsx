/** A ranking as horizontal bars (one series, so no legend: the card title names it). Values are always printed. */
export function RankingList({ items, empty }: { items: { label: string; value: number; display: string; detail?: string }[]; empty: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...items.map(i => Math.abs(i.value)), 1);
  return <ol className="space-y-2.5">
    {items.map((item, i) => <li key={item.label + i} className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-slate-700" title={item.label}>{item.label}</span>
        <span className="shrink-0 tabular-nums font-medium text-slate-900">{item.display}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
          <div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(2, Math.abs(item.value) / max * 100)}%` }} />
        </div>
        {item.detail && <span className="shrink-0 text-[11px] text-slate-500">{item.detail}</span>}
      </div>
    </li>)}
  </ol>;
}
