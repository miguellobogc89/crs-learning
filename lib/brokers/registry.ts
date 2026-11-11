// lib/brokers/registry.ts
// Registro central de proveedores. Añadir un bróker = escribir su adaptador y registrarlo en
// providers.ts. Nada más del sistema cambia. Puro (sin red ni base de datos).
import { CAPABILITY_METHOD, type BrokerAdapter } from "./adapter";
import { BrokerError, type ProviderInfo } from "./types";

export type BrokerRegistry = {
  register(adapter: BrokerAdapter): void;
  /** Anuncia un proveedor sin adaptador todavía («próximamente» en la interfaz). */
  announce(info: ProviderInfo): void;
  get(providerId: string): BrokerAdapter;
  has(providerId: string): boolean;
  list(): ProviderInfo[];
};

/** Lo declarado tiene que estar implementado (y al revés): evita capacidades fantasma. */
export function checkAdapter(adapter: BrokerAdapter): string[] {
  const problems: string[] = [];
  const { info } = adapter;
  if (!/^[a-z0-9_]{2,40}$/.test(info.id)) problems.push(`id no válido: ${info.id}`);
  if (!info.environments.length) problems.push("sin entornos");
  for (const [cap, method] of Object.entries(CAPABILITY_METHOD)) {
    const declared = info.capabilities.includes(cap as keyof typeof CAPABILITY_METHOD);
    const implemented = typeof adapter[method] === "function";
    if (declared && !implemented) problems.push(`declara «${cap}» pero no implementa ${String(method)}`);
    if (!declared && implemented) problems.push(`implementa ${String(method)} pero no declara «${cap}»`);
  }
  if (info.capabilities.includes("place_order") && !info.orderTypes.length) problems.push("envía órdenes pero no declara tipos de orden");
  return problems;
}

export function createRegistry(): BrokerRegistry {
  const adapters = new Map<string, BrokerAdapter>();
  const announced = new Map<string, ProviderInfo>();
  return {
    register(adapter) {
      const problems = checkAdapter(adapter);
      if (problems.length) throw new Error(`Adaptador ${adapter.info.id} incoherente: ${problems.join("; ")}`);
      if (adapters.has(adapter.info.id)) throw new Error(`Proveedor duplicado: ${adapter.info.id}`);
      adapters.set(adapter.info.id, adapter);
      announced.delete(adapter.info.id);
    },
    announce(info) {
      if (!adapters.has(info.id)) announced.set(info.id, { ...info, availability: "soon" });
    },
    get(providerId) {
      const a = adapters.get(providerId);
      if (!a) throw new BrokerError("unsupported", `Proveedor no disponible: ${providerId}`, { provider: providerId });
      return a;
    },
    has: (providerId) => adapters.has(providerId),
    list: () => [...[...adapters.values()].map((a) => a.info), ...announced.values()],
  };
}
