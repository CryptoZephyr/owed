"use client";

import { useEffect, useState } from "react";
import s from "./stamp.module.css";
import { STAMP_WORDS } from "./stamp-words";
import type { StampKind } from "./stamp-words";

export function Stamp({ kind, amount, time, reference, id }: { kind: StampKind; amount: string; time?: string; reference?: string; id?: string }) {
  const [land, setLand] = useState(false);
  useEffect(() => {
    if (kind !== "paid" || !id) return;
    const key = `owed-stamp:${id}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    setLand(true);
  }, [kind, id]);
  return <div className={s.stamp} data-kind={kind} data-land={land || undefined}>
    <span className={s.word}>{STAMP_WORDS[kind]}</span>
    <span className={s.amount}>{amount}</span>
    {(time || reference) && <span className={s.meta}>{[reference, time].filter(Boolean).join(" · ")}</span>}
  </div>;
}
