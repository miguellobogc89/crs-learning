import Image from "next/image";

const BANK_LOGOS: Record<string, string> = {
  santander: "/finance-app/banks/santander.png",
  bbva: "/finance-app/banks/bbva.jpg",
  revolut: "/finance-app/banks/revolut.png",
};

export function BankLogo({ bank, className = "h-9 w-9" }: { bank: string | null; className?: string }) {
  const logo = bank ? BANK_LOGOS[bank.toLowerCase()] : undefined;
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-slate-100 ${className}`}>
      {logo ? <Image src={logo} alt={`Logo de ${bank}`} fill sizes="48px" className="object-cover" /> : <span className="text-[10px] font-bold uppercase text-slate-600">{(bank ?? "imp").slice(0, 3)}</span>}
    </span>
  );
}
