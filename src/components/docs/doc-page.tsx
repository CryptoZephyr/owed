import Link from "next/link";
import { headings, readMdxPage } from "@/content/docs/frontmatter";
import { DOC_GROUPS, docHref, findDoc, neighbours } from "@/content/docs/nav";
import s from "./docs.module.css";

export async function DocPage({ group, slug }: { group: string; slug: string }) {
  const doc = findDoc(group, slug);
  if (!doc) return null;
  const source = await readMdxPage(group, slug);
  const MdxContent = (await import(`@/content/docs/${group}/${slug}.mdx`)).default;
  const title = source.frontmatter.title;
  const summary = source.frontmatter.summary;
  const sections = headings(source.raw);
  const groupTitle = DOC_GROUPS.find((item) => item.slug === group)?.title;
  const { previous, next } = neighbours(group, slug);
  const toc = <ul className={s.tocList}>{sections.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.title}</a></li>)}</ul>;

  return <main className={s.main}>
    <div className={s.articleGrid}>
      <article className={s.article}>
        <header className={s.pageHead}>
          <p className={s.kicker}>{groupTitle}</p>
          <h1>{title}</h1>
          <p>{summary}</p>
        </header>
        {sections.length >= 3 && <details className={s.mobileToc}>
          <summary>On this page</summary>{toc}
        </details>}
        <div className={s.mdxBody}><MdxContent /></div>
        <p className={s.verification}>Last verified: {source.frontmatter.lastVerified} <span aria-hidden="true">·</span> Commit: <a href={`https://github.com/CryptoZephyr/owed/commit/${source.frontmatter.commit}`}>{source.frontmatter.commit}</a></p>
        <nav className={s.pagination} aria-label="Previous and next page">
          {previous ? <Link href={docHref(previous)}><span>Previous</span>{previous.title}</Link> : <span />}
          {next ? <Link href={docHref(next)}><span>Next</span>{next.title}</Link> : <span />}
        </nav>
      </article>
      {sections.length >= 3 && <aside className={s.desktopToc} aria-label="On this page">
        <p>On this page</p>{toc}
      </aside>}
    </div>
  </main>;
}
