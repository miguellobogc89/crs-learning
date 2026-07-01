// components/app/page-title.tsx
type Props = {
  title: string;
  subtitle?: string;
};

export function PageTitle({
  title,
  subtitle,
}: Props) {
  return (
    <div className="mb-10">

      <h1 className="text-4xl font-bold tracking-tight text-white">
        {title}
      </h1>

      {subtitle && (
        <p className="mt-2 text-slate-400">
          {subtitle}
        </p>
      )}

    </div>
  );
}