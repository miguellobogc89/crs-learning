// app/login-layout.tsx

import type { ReactNode } from "react";

type LoginLayoutProps = {
  leftHeader: ReactNode;
  leftContent: ReactNode;
  leftFooter: ReactNode;

  rightHeader: ReactNode;
  rightContent: ReactNode;
  rightFooter?: ReactNode;
};

export function LoginLayout({
  leftHeader,
  leftContent,
  leftFooter,
  rightHeader,
  rightContent,
  rightFooter,
}: LoginLayoutProps) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-background text-foreground">
      <div className="flex h-full min-h-0 w-full">
        {/* =====================================================
            IZQUIERDA
        ===================================================== */}

        <aside
          className="
            relative hidden h-full min-h-0 w-[44%] shrink-0
            flex-col overflow-hidden
            border-r border-border bg-sidebar
            px-[clamp(24px,2.6vw,56px)]
            py-[clamp(20px,3vh,48px)]
            lg:flex
          "
        >
          {/* HEADER */}

          <div className="relative z-10 flex-[0_0_10%] min-h-0">
            {leftHeader}
          </div>

          {/* CONTENIDO */}

          <div
            className="
              relative z-10
              flex min-h-0 flex-1
              items-center
              py-[clamp(12px,2vh,32px)]
            "
          >
            <div className="w-full">
              {leftContent}
            </div>
          </div>

          {/* FOOTER */}

          <div
            className="
              relative z-10
              flex-[0_0_15%]
              min-h-0
            "
          >
            {leftFooter}
          </div>
        </aside>

        {/* =====================================================
            DERECHA
        ===================================================== */}

        <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          {/* HEADER */}

          <div
            className="
              flex-[0_0_10%]
              min-h-0
              px-[clamp(20px,3vw,64px)]
            "
          >
            {rightHeader}
          </div>

          {/* CONTENIDO */}

          <div
            className="
              flex min-h-0 flex-1
              items-center justify-center
              px-[clamp(20px,3vw,64px)]
              py-[clamp(8px,1.5vh,24px)]
            "
          >
            <div
              className="
                flex
                h-[clamp(440px,72vh,720px)]
                min-h-0
                w-full
                max-w-[clamp(390px,32vw,490px)]
                flex-col
                justify-center
              "
            >
              {rightContent}
            </div>
          </div>

          {/* FOOTER */}

          <div
            className="
              flex-[0_0_6%]
              min-h-0
              px-[clamp(20px,3vw,64px)]
            "
          >
            {rightFooter}
          </div>
        </main>
      </div>
    </div>
  );
}