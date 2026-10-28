"use client";

import { useEffect, useState } from "react";
import s from "./status.module.css";

export type Tone = "neutral" | "amber" | "green" | "blue" | "red";

export function Status({ word, tone = "neutral", id }: { word: string; tone?: Tone; id?: string }) {
  const [previous, setPrevious] = useState<string | null>(null);
  const [phase, setPhase] = useState<"strike" | "draw" | null>(null);
  useEffect(() => {
    if (!id) return;
    const key = `owed-status:${id}`;
    const last = window.sessionStorage.getItem(key);
    window.sessionStorage.setItem(key, word);
    if (!last || last === word || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPrevious(last);
    setPhase("strike");
    const swap = window.setTimeout(() => setPhase("draw"), 260);
    const done = window.setTimeout(() => { setPhase(null); setPrevious(null); }, 400);
    return () => { window.clearTimeout(swap); window.clearTimeout(done); };
  }, [id, word]);
  const showing = phase === "strike" && previous ? previous : word;
  return <span className={s.status} data-tone={tone} data-phase={phase ?? undefined}>
    <span className={s.word}>{showing}</span><span className={s.rule} aria-hidden="true" />
  </span>;
}
