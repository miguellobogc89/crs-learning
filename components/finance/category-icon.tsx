"use client";
// Icono de cada categoría, en un círculo con su color (el mismo tono de la categoría en pastillas y gráficos).
// Lo usan las listas de movimientos y el detalle, para que la lista se lea de un vistazo.
import type { CSSProperties, ComponentType } from "react";
import {
  ArrowDownLeft, ArrowLeftRight, Banknote, Bike, Briefcase, Bus, CircleHelp, Gamepad2, Gift, GraduationCap, HandCoins, HeartPulse,
  Home, Landmark, PawPrint, Percent, PiggyBank, Plane, Receipt, Repeat, Scissors, Shield, Shirt, ShoppingBag, ShoppingCart, Tag,
  Ticket, TrendingUp, UtensilsCrossed, Wallet, Zap,
} from "lucide-react";
import { categoryHex } from "@/lib/finance/categories";

type Icon = ComponentType<{ className?: string; style?: CSSProperties }>;
const ICONS: Record<string, Icon> = {
  vivienda: Home, suministros: Zap, alimentacion: ShoppingCart, restaurantes: UtensilsCrossed, comida_domicilio: Bike,
  ocio: Ticket, videojuegos: Gamepad2, transporte: Bus, compras: ShoppingBag, moda: Shirt, mascotas: PawPrint,
  suscripciones: Repeat, salud: HeartPulse, seguros: Shield, prestamos: Landmark, impuestos: Receipt, educacion: GraduationCap,
  viajes: Plane, cuidado_personal: Scissors, regalos: Gift, efectivo: Banknote, comisiones: Percent, otros_gastos: Wallet,
  nomina: Briefcase, intereses: TrendingUp, otros_ingresos: ArrowDownLeft, regalo_recibido: Gift,
  transferencia_interna: ArrowLeftRight, ahorro_inversion: PiggyBank, sin_clasificar: CircleHelp,
};

export const categoryIconOf = (key: string): Icon => ICONS[key] ?? Tag;

export function CategoryIcon({ category, size = "md" }: { category: string; size?: "md" | "lg" }) {
  const Icon = categoryIconOf(category);
  const hex = categoryHex(category);
  const box = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const icon = size === "lg" ? "h-5 w-5" : "h-[18px] w-[18px]";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${box}`} style={{ backgroundColor: `${hex}1f` }} aria-hidden="true">
      <Icon className={icon} style={{ color: hex }} />
    </span>
  );
}
