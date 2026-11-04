import { waApi } from "./api";
import type { Configuration } from "@/lib/whatsapp/types";
type SDK = {
  init(options: {
    appId: string;
    version: string;
    cookie: boolean;
    xfbml: boolean;
  }): void;
  login(
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ): void;
};
type MetaWindow = Window & { FB?: SDK; fbAsyncInit?: () => void };
let sdkPromise: Promise<void> | null = null;
export function loadMeta(config: Configuration) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const w = window as MetaWindow;
    const timeout = window.setTimeout(() => {
      sdkPromise = null;
      reject(
        new Error(
          "Meta no ha cargado. Comprueba el dominio autorizado y vuelve a intentarlo.",
        ),
      );
    }, 15000);
    const init = () => {
      if (!w.FB) return;
      w.FB.init({
        appId: config.appId,
        version: config.version,
        cookie: true,
        xfbml: false,
      });
      clearTimeout(timeout);
      resolve();
    };
    if (w.FB) {
      init();
      return;
    }
    w.fbAsyncInit = init;
    const existing = document.getElementById("crs-facebook-sdk");
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.id = "crs-facebook-sdk";
    script.src = "https://connect.facebook.net/es_ES/sdk.js";
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      sdkPromise = null;
      reject(new Error("No se pudo cargar Facebook"));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}
/** Resolves with a warning to show (e.g. the number connected but Meta did not register it yet), or null. */
export function signup(config: Configuration): {
  promise: Promise<string | null>;
  cancel: () => void;
} {
  let cleanup = () => {};
  let cancel = () => {};
  const promise = new Promise<string | null>((resolve, reject) => {
    const sdk = (window as MetaWindow).FB;
    if (!sdk) {
      reject(new Error("Facebook todavía no está listo"));
      return;
    }
    let finished = false,
      authorized = false,
      finishing = false;
    // Which account and number Meta says were chosen; {} = not said, the server reads them from the authorization.
    let ids: { phoneNumberId?: string; wabaId?: string } | null = null;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const stop = (error?: Error, warning: string | null = null) => {
      if (finished) return;
      finished = true;
      cleanup();
      clearTimeout(fallback);
      if (error) reject(error);
      else resolve(warning);
    };
    cancel = () => stop(new Error("Conexión cancelada"));
    const complete = async () => {
      if (finished || finishing || !authorized || !ids) return;
      finishing = true;
      try {
        const r = await waApi<{ warning?: string | null }>("connect/finish", ids);
        stop(undefined, r?.warning ?? null);
      } catch (e) {
        stop(e instanceof Error ? e : new Error("No se pudo conectar"));
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/.test(event.origin)) return;
      let data;
      try {
        data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "ERROR" || data.event === "CANCEL") {
        const detail = typeof data.data?.error_message === "string" ? `: ${data.data.error_message}` : "";
        stop(new Error(`Se ha cancelado la conexión con Meta${detail}`));
        return;
      }
      // FINISH, FINISH_ONLY_WABA, FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING… all end the flow.
      if (typeof data.event !== "string" || !data.event.startsWith("FINISH")) return;
      const waba = data.data?.waba_id, phone = data.data?.phone_number_id;
      ids = {
        ...(typeof waba === "string" && /^\d+$/.test(waba) ? { wabaId: waba } : {}),
        ...(typeof phone === "string" && /^\d+$/.test(phone) ? { phoneNumberId: phone } : {}),
      };
      void complete();
    };
    const timeout = window.setTimeout(
      () => stop(new Error("La conexión ha caducado. Vuelve a intentarlo.")),
      300000,
    );
    cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);
    };
    window.addEventListener("message", onMessage);
    sdk.login(
      (response) => {
        if (finished) return;
        const code = response.authResponse?.code;
        if (!code) {
          // Meta answers without a code when its window is closed early, or when another signup window takes over.
          stop(new Error("Meta no ha devuelto la autorización. Si la ventana de Meta sigue abierta, termina en ella y después pulsa «Añadir número» otra vez eligiendo la cuenta ya creada: será inmediato."));
          return;
        }
        // Exchange immediately: the code is short-lived; the session event may arrive in either order.
        void waApi("connect/code", { code })
          .then(() => {
            authorized = true;
            void complete();
            // If Meta's message never reaches this page, ask the server to find the account from the authorization.
            fallback = setTimeout(() => {
              if (!ids) { ids = {}; void complete(); }
            }, 8000);
          })
          .catch((e) =>
            stop(e instanceof Error ? e : new Error("No se pudo autorizar")),
          );
      },
      {
        config_id: config.configId,
        auth_type: "rerequest",
        response_type: "code",
        override_default_response_type: true,
      },
    );
  });
  return { promise, cancel: () => cancel() };
}
