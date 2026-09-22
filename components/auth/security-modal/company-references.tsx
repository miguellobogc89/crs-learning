// components/auth/security-modal/company-references.tsx
// Referencias de los proveedores, no clientes de CRS LAB.
// Comprueba periódicamente que cada empresa siga figurando en la fuente oficial.

type Company = { name: string; domain: string };

export const vercelCompanies: Company[] = [
  { name: "OpenAI", domain: "openai.com" },
  { name: "Nike", domain: "nike.com" },
  { name: "NVIDIA", domain: "nvidia.com" },
  { name: "eBay", domain: "ebay.com" },
];

export const neonCompanies: Company[] = [
  { name: "DEV", domain: "dev.to" },
  { name: "Bitso", domain: "bitso.com" },
  { name: "Retool", domain: "retool.com" },
  { name: "Replit", domain: "replit.com" },
];

export function CompanyLogos({ companies }: { companies: Company[] }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {companies.map((company) => (
        <div key={company.name} className="flex min-w-0 flex-col items-center gap-1.5 text-center" title={company.name}>
          {/* El favicon se obtiene de un servicio externo; para producción se recomienda servir logos locales. */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(company.domain)}&sz=64`}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-6 w-6 object-contain sm:h-7 sm:w-7"
          />
          <span className="max-w-full truncate text-[10px] font-medium text-slate-800 sm:text-[11px]">
            {company.name}
          </span>
        </div>
      ))}
    </div>
  );
}
