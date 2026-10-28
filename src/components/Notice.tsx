import type { ReactNode } from "react";
import s from "./notice.module.css";

const words = { info: "Info", warning: "Warning", error: "Error" } as const;

export function Notice({ kind = "info", title, children }: { kind?: keyof typeof words; title?: string; children: ReactNode }) {
  return <div className={s.notice} data-kind={kind} role={kind === "error" ? "alert" : undefined}>
    <span className={s.label}>{words[kind]}<span className={s.rule} aria-hidden="true" /></span>
    <div className={s.body}>{title && <p className={s.title}>{title}</p>}{children}</div>
  </div>;
}
