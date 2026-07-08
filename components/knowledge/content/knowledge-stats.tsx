// components/knowledge/content/knowledge-stats.tsx
import { BookOpen, Globe2, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type Props = {
  total: number;
  totalPrivate: number;
  totalPublic: number;
};

export function KnowledgeStats({
  total,
  totalPrivate,
  totalPublic,
}: Props) {
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <Card className="border-border bg-card">
        <CardContent className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lesson-soft text-lesson">
            <BookOpen className="h-5 w-5" />
          </span>

          <div>
            <p className="text-2xl font-semibold text-foreground">{total}</p>
            <p className="text-sm text-muted-foreground">Knowledge items</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-muted-foreground">
            <ShieldCheck className="h-5 w-5" />
          </span>

          <div>
            <p className="text-2xl font-semibold text-foreground">
              {totalPrivate}
            </p>
            <p className="text-sm text-muted-foreground">
              Privados de empresa
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-muted-foreground">
            <Globe2 className="h-5 w-5" />
          </span>

          <div>
            <p className="text-2xl font-semibold text-foreground">
              {totalPublic}
            </p>
            <p className="text-sm text-muted-foreground">
              Conocimiento público
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}