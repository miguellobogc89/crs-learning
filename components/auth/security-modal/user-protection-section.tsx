// components/auth/security-modal/user-protection-section.tsx
import { FileCheck2, KeyRound, LockKeyhole, UsersRound, ShieldCheck } from "lucide-react";
import { SectionHeading } from "./section-heading";

export function UserProtectionSection() {
  return (
          <section className="mt-8">
            <SectionHeading eyebrow="Protección a nivel de usuario" title="Tu información, bajo control" />
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <SecurityFeature icon={KeyRound} title="Acceso personal" description="Cada usuario accede con su propia cuenta y una sesión autenticada." />
              <SecurityFeature icon={UsersRound} title="Permisos por equipo" description="El acceso a la información depende de los permisos asignados." />
              <SecurityFeature icon={LockKeyhole} title="Conexión cifrada" description="HTTPS protege la información durante su transmisión." />
              <SecurityFeature icon={FileCheck2} title="Información organizada" description="Los espacios de trabajo permiten separar y organizar el contenido." />
            </div>
          </section>
  );
}

export function SecurityFeature({ icon: Icon, title, description }: { icon: typeof ShieldCheck; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 lg:flex-col">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div>
        <h4 className="text-xs font-semibold text-slate-900 sm:text-[13px]">{title}</h4>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}
