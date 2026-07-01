import { Card } from "./card";

type Props={
    title:string;
    value:string|number;
}

export function StatCard({title,value}:Props){

    return(

        <Card>

            <p className="text-sm text-slate-400">

                {title}

            </p>

            <h2 className="mt-2 text-3xl font-bold">

                {value}

            </h2>

        </Card>

    )

}