"use client";
// Icono de cada categoría: Phosphor relleno en blanco sobre el color vivo de su familia (como los Ajustes del
// iPhone). Lo usan las listas de movimientos, el detalle, el selector de categorías, Mi plan e Inicio.
import type { ComponentType, CSSProperties } from "react";
import {
  Armchair, ArrowDownLeft, ArrowsLeftRight, Baby, Bank, Barbell, BeerStein, Briefcase, Buildings, Bus, Car, Confetti, DeviceMobile,
  Drop, Flame, ForkKnife, GameController, GasPump, Gift, GraduationCap, HandHeart, House, Laptop, LetterCircleP, Lightbulb, Money,
  Moped, PaintBrush, PawPrint, Percent, PiggyBank, Pill, Plug, Question, Receipt, Repeat, Scissors, ShieldCheck, ShoppingBag,
  ShoppingCart, Stethoscope, Suitcase, TShirt, Tag, Ticket, Toolbox, TrendUp, Umbrella, Wallet, WifiHigh, Wrench,
} from "@phosphor-icons/react";
import { categoryHex } from "@/lib/finance/categories";

type Icon = ComponentType<{ size?: number | string; color?: string; weight?: "fill"; className?: string; style?: CSSProperties }>;
const ICONS: Record<string, Icon> = {
  vivienda: House, comunidad: Buildings, seguro_hogar: ShieldCheck, mantenimiento_hogar: Toolbox, muebles_decoracion: Armchair,
  luz: Lightbulb, gas: Flame, agua: Drop, internet_fijo: WifiHigh, movil: DeviceMobile, suministros: Plug,
  alimentacion: ShoppingCart, comida_domicilio: Moped,
  restaurantes: ForkKnife, bares_copas: BeerStein, conciertos_espectaculos: Ticket, viajes: Suitcase, hobbies: PaintBrush,
  videojuegos: GameController, ocio: Confetti,
  gasolina: GasPump, transporte: Bus, parking_peaje: LetterCircleP, mantenimiento_vehiculo: Wrench, seguro_coche: Car,
  moda: TShirt, electronica: Laptop, regalos: Gift, compras: ShoppingBag,
  farmacia: Pill, salud: Stethoscope, deporte: Barbell, cuidado_personal: Scissors,
  suscripciones: Repeat, educacion: GraduationCap, mascotas: PawPrint, hijos: Baby,
  prestamos: Bank, comisiones: Percent, impuestos: Receipt, seguros: Umbrella, efectivo: Money,
  solidaridad: HandHeart, otros_gastos: Wallet,
  nomina: Briefcase, intereses: TrendUp, otros_ingresos: ArrowDownLeft, regalo_recibido: Gift,
  transferencia_interna: ArrowsLeftRight, ahorro_inversion: PiggyBank, sin_clasificar: Question,
};

export const categoryIconOf = (key: string): Icon => ICONS[key] ?? Tag;

export function CategoryIcon({ category, size = "md" }: { category: string; size?: "md" | "lg" }) {
  const Icon = categoryIconOf(category);
  const hex = categoryHex(category);
  const box = size === "lg" ? "h-11 w-11 rounded-[13px]" : "h-9 w-9 rounded-[11px]";
  return (
    <span className={`flex shrink-0 items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ${box}`}
      style={{ background: `linear-gradient(160deg, ${hex}e6, ${hex})` }} aria-hidden="true">
      <Icon size={size === "lg" ? 24 : 20} color="#ffffff" weight="fill" />
    </span>
  );
}
