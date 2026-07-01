type Props={
    title:string;
    children:React.ReactNode;
}

export function Section({title,children}:Props){

    return(

        <section className="mb-10">

            <h2 className="mb-5 text-2xl font-bold text-white">

                {title}

            </h2>

            {children}

        </section>

    )

}