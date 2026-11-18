import styles from "./module-logo.module.css";

type Module = "business" | "trading" | "finance";

/** Mantiene la silueta del PNG y aplica el acabado de cada módulo. */
export function ModuleLogo({ module, className = "size-7" }: { module: Module; className?: string }) {
  return <span aria-hidden="true" className={`${styles.logo} ${styles[module]} ${className}`} />;
}
