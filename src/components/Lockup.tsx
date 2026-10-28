import Link from "next/link";
import { Mark } from "./Mark";
import s from "./lockup.module.css";

export function Lockup({ tone = "ink", href = "/" }: { tone?: "ink" | "paper"; href?: string | null }) {
  const body = <span className={s.lockup} data-tone={tone}><Mark tone={tone} size={20} /><span className={s.word}>Owed</span></span>;
  return href ? <Link href={href} className={s.link} aria-label="Owed home">{body}</Link> : body;
}
