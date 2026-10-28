"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Input, Label, TextField } from "react-aria-components";
import { toCents } from "@/lib/money";
import { ButtonLink, Button } from "./Button";
import { DeadlineField, Field } from "./Fields";
import { Line, Receipt } from "./Receipt";
import s from "./promise.module.css";

export type PromiseDefaults = { places?: string; amount?: string; deadline?: string };

function cents(amount: string): number | null {
  try { const c = toCents(amount); return c >= 100 && c <= 100000 ? c : null; } catch { return null; }
}

function places(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

const show = (c: number) => `USD ${Math.trunc(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;

function Slot({ label, children, width }: { label: string; children: ReactNode; width?: string }) {
  return <TextField className={s.slot} aria-label={label} style={width ? { ["--slot" as string]: width } : undefined}>
    <Label className={s.slotLabel}>{label}</Label>{children}
  </TextField>;
}

export function PromiseForm({ mode, defaults = {}, action, children }: {
  mode: "demo" | "role"; defaults?: PromiseDefaults; action?: (form: FormData) => Promise<never>; children?: ReactNode;
}) {
  const [count, setCount] = useState(defaults.places ?? "3");
  const [amount, setAmount] = useState(defaults.amount ?? "25.00");
  const [deadline, setDeadline] = useState(defaults.deadline ?? "");
  const c = cents(amount), p = places(count);
  const total = c !== null && p !== null ? c * p : null;
  const sentence = <div className={s.sentence}>
    Pay each of <Slot label="Places" width="3ch"><Input className={s.slotInput} name={mode === "role" ? "capacity" : undefined} value={count}
      onChange={(e) => setCount(e.target.value)} inputMode="numeric" pattern="[0-9]{1,3}" required /></Slot> candidates
    {mode === "role" && <> for <Slot label="Role" width="14ch"><Input className={s.slotInput} name="title" required maxLength={160} placeholder="" /></Slot></>}
    {" "}<Slot label="Guarantee each" width="6ch"><span className={s.currency}>USD</span><Input className={s.slotInput} name={mode === "role" ? "guaranteeUsd" : undefined}
      value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" pattern="[0-9]{1,4}(\.[0-9]{1,2})?" required /></Slot>
    {" "}if they hear nothing by <DeadlineField inline label="Reply deadline" name="deadline" required defaultValue={defaults.deadline} onChange={setDeadline} />.
  </div>;
  const receipt = <Receipt label="Hold">
    <Line label="Places" value={p ?? "Check places"} />
    <Line label="Guarantee per place" value={c !== null ? show(c) : "USD 1 to 1,000"} />
    <Line label="Total hold in PayPal" value={total !== null ? show(total) : "Not set"} total />
  </Receipt>;
  if (mode === "demo") {
    const query = new URLSearchParams({ places: count, amount, ...(deadline ? { deadline } : {}) });
    const href = `/auth/paypal?returnTo=${encodeURIComponent(`/employer?${query}`)}`;
    return <div className={s.promise}>
      {sentence}{receipt}{children}
      <div className="actions"><ButtonLink href={href}>Continue with PayPal</ButtonLink>
        <span className="secondary small">Sign in as the employer. Your promise carries over to the new role.</span></div>
    </div>;
  }
  return <form action={action} className={s.promise}>
    <div className={s.employer}><Field label="Employer name, as candidates will see it" name="employerName" required maxLength={120} /></div>
    {sentence}{receipt}
    <input type="hidden" name="guaranteeCents" value={c ?? ""} />
    <p className="secondary small measure">Choose a deadline within 21 days. PayPal authorizes the total now and charges nothing unless a candidate hears nothing by the deadline. Candidates always receive the full guarantee. In this sandbox build, Owed pays the PayPal fees.</p>
    <div className="actions"><Button>Create role</Button></div>
  </form>;
}
