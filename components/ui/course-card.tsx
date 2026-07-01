import Link from "next/link";
import { Card } from "./card";
import { Progress } from "./progress";
import { Badge } from "./badge";

type Props={
    title:string;
    description:string;
    progress:number;
    href:string;
}

export function CourseCard({
    title,
    description,
    progress,
    href
}:Props){

    return(

        <Link href={href}>

            <Card className="transition hover:border-cyan-500">

                <Badge>

                    Curso

                </Badge>

                <h2 className="mt-4 text-xl font-bold text-white">

                    {title}

                </h2>

                <p className="mt-2 text-slate-400">

                    {description}

                </p>

                <div className="mt-6">

                    <Progress value={progress}/>

                </div>

            </Card>

        </Link>

    )

}