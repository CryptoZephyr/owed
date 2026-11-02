"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./header.module.css";

export function HeaderNav() {
  const pathname = usePathname();
  const isDocs = pathname === "/docs" || pathname.startsWith("/docs/");

  return <nav aria-label="Main" className={s.nav}>
    <Link href="/employer" aria-current={pathname.startsWith("/employer") ? "page" : undefined}>Employer</Link>
    <Link href="/candidate" aria-current={pathname.startsWith("/candidate") ? "page" : undefined}>Candidate</Link>
    <Link href="/docs/get-started/introduction" aria-current={isDocs ? "page" : undefined}>Docs</Link>
  </nav>;
}
