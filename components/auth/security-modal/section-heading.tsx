// components/auth/security-modal/section-heading.tsx
export function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-600">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{title}</h3>
      {description && <p className="mt-1 max-w-[760px] text-xs leading-5 text-slate-500 sm:text-sm">{description}</p>}
    </div>
  );
}
