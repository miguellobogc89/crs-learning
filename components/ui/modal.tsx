type Props={
    children:React.ReactNode;
}

export function Modal({children}:Props){

    return(

        <div className="fixed inset-0 flex items-center justify-center bg-black/60">

            <div className="w-full max-w-xl rounded-2xl bg-slate-950 p-8">

                {children}

            </div>

        </div>

    )

}