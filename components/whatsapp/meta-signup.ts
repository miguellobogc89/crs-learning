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
export function signup(config: Configuration): {
  promise: Promise<void>;
  cancel: () => void;
} {
  let cleanup = () => {};
  let cancel = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    const sdk = (window as MetaWindow).FB;
    if (!sdk) {
      reject(new Error("Facebook todavía no está listo"));
      return;
    }
    let finished = false,
      authorized = false,
      finishing = false;
    let ids: { phoneNumberId: string; wabaId: string } | null = null;
    const stop = (error?: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    cancel = () => stop(new Error("Conexión cancelada"));
    const complete = async () => {
      if (finished || finishing || !authorized || !ids) return;
      finishing = true;
      try {
        await waApi("connect/finish", ids);
        stop();
      } catch (e) {
        stop(e instanceof Error ? e : new Error("No se pudo conectar"));
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (
        ![
          "https://www.facebook.com",
          "https://web.facebook.com",
          "https://business.facebook.com",
        ].includes(event.origin)
      )
        return;
      let data;
      try {
        data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "ERROR" || data.event === "CANCEL") {
        stop(new Error("Se ha cancelado la conexión con Meta"));
        return;
      }
      if (data.event !== "FINISH") return;
      if (!data.data?.phone_number_id || !data.data?.waba_id) {
        stop(
          new Error(
            "Meta no devolvió un número verificado. Completa el alta del número en Meta.",
          ),
        );
        return;
      }
      ids = {
        phoneNumberId: data.data.phone_number_id,
        wabaId: data.data.waba_id,
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
          stop(new Error("Meta no ha autorizado la conexión"));
          return;
        }
        // Exchange immediately: the code is short-lived; the session event may arrive in either order.
        void waApi("connect/code", { code })
          .then(() => {
            authorized = true;
            void complete();
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
