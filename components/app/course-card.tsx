// components/app/course-card.tsx
import Link from "next/link";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Progress } from "@/components/ui/progress";

import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description: string;
  progress: number;
};

export function CourseCard({
  title,
  description,
  progress,
}: Props) {
  return (
    <Card className="border-slate-800 bg-slate-950 transition hover:border-cyan-500">

      <CardHeader>

        <Badge className="w-fit">
          Curso
        </Badge>

        <CardTitle className="mt-4 text-white">
          {title}
        </CardTitle>

      </CardHeader>

      <CardContent>

        <p className="text-sm leading-6 text-slate-400">
          {description}
        </p>

        <div className="mt-6">

          <Progress value={progress} />

          <p className="mt-2 text-sm text-slate-500">
            {progress}%
          </p>

        </div>

      </CardContent>

      <CardFooter>

        <Button asChild className="w-full">

          <Link href="#">

            Continuar

          </Link>

        </Button>

      </CardFooter>

    </Card>
  );
}