"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Checkbox, DateField, DateInput, DateSegment, FieldError, I18nProvider, Input, Label, Radio, RadioGroup, Text, TextArea, TextField } from "react-aria-components";
import type { CalendarDateTime } from "@internationalized/date";
import { parseDateTime } from "@internationalized/date";
import s from "./fields.module.css";

export function Field({ label, name, type = "text", description, required, maxLength, defaultValue, value, onChange, multiline, rows = 6, inputMode, pattern, letter }: {
  label: string; name: string; type?: string; description?: ReactNode; required?: boolean; maxLength?: number; defaultValue?: string;
  value?: string; onChange?: (value: string) => void; multiline?: boolean; rows?: number;
  inputMode?: "text" | "email" | "decimal" | "numeric"; pattern?: string; letter?: boolean;
}) {
  return <TextField className={s.field} name={name} type={type} isRequired={required} maxLength={maxLength} defaultValue={defaultValue}
    value={value} onChange={onChange} pattern={pattern} inputMode={inputMode}>
    <Label className={s.label}>{label}</Label>
    {multiline ? <TextArea className={s.input} rows={rows} data-letter={letter || undefined} /> : <Input className={s.input} />}
    {description && <Text slot="description" className={s.description}>{description}</Text>}
    <FieldError className={s.error} />
  </TextField>;
}

export function formatLocal(value: CalendarDateTime | null): string {
  if (!value) return "";
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(value.year, 4)}-${p(value.month)}-${p(value.day)}T${p(value.hour)}:${p(value.minute)}`;
}

function parseLocalValue(value?: string): CalendarDateTime | null {
  if (!value) return null;
  try { return parseDateTime(value); } catch { return null; }
}

export function DeadlineField({ label, name, description, required, defaultValue, value, onChange, inline }: {
  label: string; name: string; description?: ReactNode; required?: boolean; defaultValue?: string; value?: string;
  onChange?: (value: string) => void; inline?: boolean;
}) {
  const [internalValue, setInternalValue] = useState<CalendarDateTime | null>(() => parseLocalValue(defaultValue));
  const currentValue = value === undefined ? internalValue : parseLocalValue(value);
  return <I18nProvider locale="en-GB">
    <DateField className={inline ? s.inlineDate : s.field} value={currentValue} granularity="minute" hourCycle={24} isRequired={required} aria-label={label}
      onChange={(next) => {
        const nextValue = next as CalendarDateTime | null;
        if (value === undefined) setInternalValue(nextValue);
        onChange?.(formatLocal(nextValue));
      }}>
      <Label className={inline ? s.inlineLabel : s.label}>{label}</Label>
      <span className={s.dateRow}>
        <DateInput className={s.dateInput}>{(segment) => <DateSegment segment={segment} className={s.segment} />}</DateInput>
        <span className={s.unit}>UTC{inline ? "." : ""}</span>
      </span>
      {description && <Text slot="description" className={s.description}>{description}</Text>}
      <FieldError className={s.error} />
    </DateField>
    <input type="hidden" name={name} value={formatLocal(currentValue)} />
  </I18nProvider>;
}

export function StatusChoice({ name, options, deadlineFor, deadlineName, deadlineLabel, deadlineDescription }: {
  name: string; options: { value: string; label: string; detail?: string }[];
  deadlineFor?: string; deadlineName?: string; deadlineLabel?: string; deadlineDescription?: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(options[0]?.value ?? null);
  return <>
    <RadioGroup className={s.radios} name={name} value={selected} onChange={setSelected} isRequired>
      <Label className={s.label}>Status</Label>
      {options.map((o) => <Radio key={o.value} value={o.value} className={s.radio}>
        <span className={s.radioMark} aria-hidden="true" />
        <span><span className={s.radioLabel}>{o.label}</span>{o.detail && <span className={s.radioDetail}>{o.detail}</span>}</span>
      </Radio>)}
    </RadioGroup>
    {deadlineFor && deadlineName && selected === deadlineFor && <DeadlineField label={deadlineLabel ?? "New deadline"} name={deadlineName} required description={deadlineDescription} />}
  </>;
}

export function Acknowledge({ name, value, children }: { name: string; value: string; children: ReactNode }) {
  return <Checkbox className={s.checkbox} name={name} value={value}>
    <span className={s.box} aria-hidden="true"><svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 6.5L5 9L10 3" /></svg></span>
    <span>{children}</span>
  </Checkbox>;
}
