import type { ReactNode } from "react";
import s from "./receipt.module.css";

export function Receipt({ children, label }: { children: ReactNode; label?: string }) {
  return <dl className={s.receipt} aria-label={label}>{children}</dl>;
}

export function Line({ label, value, total }: { label: ReactNode; value: ReactNode; total?: boolean }) {
  return <div className={s.line} data-total={total || undefined}>
    <dt className={s.label}>{label}</dt><span className={s.dots} aria-hidden="true" /><dd className={s.value}>{value}</dd>
  </div>;
}
