import Link from "next/link";
import { PlainFooter } from "@/components/Footer";
import { DOC_GROUPS, docHref } from "@/content/docs/nav";
import s from "./docs.module.css";

export function DocsShell({ children }: { children: React.ReactNode }) {
  return <>
    <div className={s.shell}>
      <nav className={s.mobileNav} aria-label="Documentation sections">
        <details>
          <summary>Browse documentation</summary>
          <div className={s.mobileGroups}><Sidebar /></div>
        </details>
      </nav>
      <aside className={s.sidebar}><Sidebar /></aside>
      {children}
    </div>
    <PlainFooter />
  </>;
}

function Sidebar() {
  return <nav aria-label="Documentation">
    {DOC_GROUPS.map((group) => <section className={s.navGroup} key={group.slug}>
      <h2>{group.title}</h2>
      <ul>{group.pages.map((page) => <li key={page.slug}>
        <Link href={docHref(page)}>{page.title}</Link>
      </li>)}</ul>
    </section>)}
  </nav>;
}
