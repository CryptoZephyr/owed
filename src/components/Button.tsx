"use client";

import type { ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import type { ButtonProps as AriaButtonProps } from "react-aria-components";
import s from "./button.module.css";

export type Variant = "primary" | "secondary" | "quiet";

export function Tick() {
  return <svg className={s.tick} viewBox="0 0 8 8" width="8" height="8" aria-hidden="true" focusable="false">
    <path d="M0.75 7.25L7.25 0.75" pathLength={1} />
  </svg>;
}

export function Label({ children }: { children: ReactNode }) {
  return <span className={s.label}>{children}<Tick /></span>;
}

export function Button({ variant = "primary", children, type = "submit", ...props }: Omit<AriaButtonProps, "children" | "className"> & { variant?: Variant; children: ReactNode }) {
  return <AriaButton {...props} type={type} className={s.button} data-variant={variant}><Label>{children}</Label></AriaButton>;
}

export function ButtonLink({ variant = "primary", href, children }: { variant?: Variant; href: string; children: ReactNode }) {
  return <a href={href} className={s.button} data-variant={variant}><Label>{children}</Label></a>;
}
