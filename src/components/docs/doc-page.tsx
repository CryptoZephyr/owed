import Link from "next/link";
import { Notice } from "@/components/Notice";
import { headings, readMdxPage } from "@/content/docs/frontmatter";
import { DOC_GROUPS, docHref, findDoc, neighbours } from "@/content/docs/nav";
import { docContent } from "@/content/docs/registry";
import s from "./docs.module.css";

export async function DocPage({ group, slug, isMdx }: { group: string; slug: string; isMdx: boolean }) {
  const doc = findDoc(group, slug);
  const content = docContent(group, slug);
  if (!doc || (!isMdx && !content)) return null;
  const source = isMdx ? await readMdxPage(group, slug) : undefined;
  const MdxContent = isMdx ? (await import(`@/content/docs/${group}/${slug}.mdx`)).default : undefined;
  const title = source?.frontmatter.title ?? doc.title;
  const summary = source?.frontmatter.summary ?? content?.summary ?? doc.summary;
  const sections = source ? headings(source.raw) : content?.sections ?? [];
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
        <div className={isMdx ? s.mdxBody : s.body}>
          {MdxContent && <MdxContent />}
          {content && !isMdx && <>
            {content.sections.map((item) => <section className={s.section} id={item.id} key={item.id}>
              <h2>{item.title}</h2>
              {item.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {item.bullets && <ul>{item.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
              {item.steps && <ol className={s.steps}>{item.steps.map((step, index) => <li key={step}><span className={s.stepNumber}>{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}</ol>}
              {item.links && <ul className={s.related}>{item.links.map((itemLink) => <li key={itemLink.href}><Link href={itemLink.href}>{itemLink.label}</Link></li>)}</ul>}
            </section>)}
            {(content.curious || content.curiousCode) && <Notice title="For the curious">
              {content.curious && <ul>{content.curious.map((item) => <li key={item}>{item}</li>)}</ul>}
              {content.curiousCode?.map((item) => <pre className={s.codeBlock} key={item}><code>{item}</code></pre>)}
            </Notice>}
          </>}
        </div>
        {source && <p className={s.verification}>Last verified: {source.frontmatter.lastVerified} <span aria-hidden="true">·</span> Commit: <a href={`https://github.com/CryptoZephyr/owed/commit/${source.frontmatter.commit}`}>{source.frontmatter.commit}</a></p>}
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
