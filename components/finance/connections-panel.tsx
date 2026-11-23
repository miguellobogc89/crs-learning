"use client";

import { GmailCard } from "./gmail-card";

/** Integraciones de servicios externos; las entidades bancarias se gestionan en Cuentas. */
export function ConnectionsPanel() {
  return <div className="space-y-4 pb-4"><GmailCard /></div>;
}
