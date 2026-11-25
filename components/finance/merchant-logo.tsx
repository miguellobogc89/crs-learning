"use client";
// Logo de un comercio conocido (25/11/2026), del tamaño del icono de categoría. Lo sirve Brandfetch si hay clave
// (NEXT_PUBLIC_BRANDFETCH_CLIENT_ID); si no, el icono de la web. Si no carga, o el comercio no es una marca
// conocida, el icono de su categoría.
import { useEffect, useState } from "react";
import { CategoryIcon } from "./category-icon";
import { fapi, refreshFinance } from "./api";

const BRANDFETCH = process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID;
export const logoUrl = (domain: string) => BRANDFETCH
  ? `https://cdn.brandfetch.io/${encodeURIComponent(domain)}/w/128/h/128/icon?c=${BRANDFETCH}`
  : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

export function MerchantLogo({ domain, category }: { domain?: string | null; category: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [domain]);
  if (!domain || broken) return <CategoryIcon category={category} />;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-white ring-1 ring-slate-200" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl(domain)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)}
        className={BRANDFETCH ? "h-full w-full object-cover" : "h-6 w-6 object-contain"} />
    </span>
  );
}

let asked = false;
/** Una vez por sesión: pide resolver los comercios nuevos y, si sale alguno, refresca para que aparezcan sus logos. */
export function useResolveLogos() {
  useEffect(() => {
    if (asked) return;
    asked = true;
    void (async () => {
      for (let i = 0; i < 4; i++) {
        const r = await fapi<{ resolved: number; pending: number }>("logos/resolve", {}).catch(() => null);
        if (!r) return;
        if (r.resolved > 0) refreshFinance();
        if (!r.pending) return;
      }
    })();
  }, []);
}
