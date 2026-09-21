import { redirect } from "next/navigation";
import { MessageSquareText } from "lucide-react";

import { auth } from "@/auth";
import { OpenAssistantButton } from "@/components/assistant/open-assistant-button";

export default async function AssistantPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <main className="flex h-full items-center justify-center bg-background px-6">
      <section className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <MessageSquareText className="h-5 w-5" />
        </div>

        <h1 className="mt-4 text-base font-semibold text-foreground">
          Pregunta a CRS Assistant
        </h1>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Haz preguntas sobre tus documentos y obten respuestas basadas en el
          Knowledge al que tienes acceso.
        </p>

        <div className="mt-6 flex justify-center">
          <OpenAssistantButton />
        </div>
      </section>
    </main>
  );
}
