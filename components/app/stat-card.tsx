// components/app/stat-card.tsx
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  title: string;
  value: string | number;
};

export function StatCard({
  title,
  value,
}: Props) {
  return (
    <Card className="border-slate-800 bg-slate-950">

      <CardContent className="p-6">

        <p className="text-sm text-slate-400">
          {title}
        </p>

        <h2 className="mt-3 text-4xl font-bold text-cyan-400">
          {value}
        </h2>

      </CardContent>

    </Card>
  );
}