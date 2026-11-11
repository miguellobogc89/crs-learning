// lib/brokers/providers.ts
// Registro de proveedores de CRS. Para añadir un bróker: implementa su adaptador en
// adapters/<id>/ y regístralo aquí. El gateway, la interfaz y los agentes no cambian.
import { createBinanceAdapter } from "./adapters/binance";
import { createTrading212Adapter } from "./adapters/trading212";
import { createRegistry } from "./registry";
import type { ProviderInfo } from "./types";

export const brokerRegistry = createRegistry();

brokerRegistry.register(createTrading212Adapter());
brokerRegistry.register(createBinanceAdapter());

// Anunciados en la interfaz como «próximamente». Sin adaptador: no se pueden conectar.
const soon = (id: string, name: string, domain: string, markets: ProviderInfo["markets"], description: string): ProviderInfo => ({
  id,
  name,
  logo: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  description,
  availability: "soon",
  environments: [],
  markets,
  capabilities: [],
  orderTypes: [],
  credentialFields: [],
  notes: [],
});

for (const info of [
  soon("kraken", "Kraken", "kraken.com", ["crypto"], "Criptomonedas en euros."),
  soon("coinbase", "Coinbase", "coinbase.com", ["crypto"], "Criptomonedas (Advanced Trade)."),
  soon("ibkr", "Interactive Brokers", "interactivebrokers.com", ["bolsa", "crypto"], "Acciones de todo el mundo, ETF y más."),
]) {
  brokerRegistry.announce(info);
}
