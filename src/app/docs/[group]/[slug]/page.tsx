import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocPage } from "@/components/docs/doc-page";
import { hasMdxPage, readMdxPage } from "@/content/docs/frontmatter";
import { ALL_DOCS, docHref, findDoc } from "@/content/docs/nav";
import { docContent } from "@/content/docs/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_DOCS.map(({ group, slug }) => ({ group, slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ group: string; slug: string }> }): Promise<Metadata> {
  const { group, slug } = await params;
  const doc = findDoc(group, slug);
  if (!doc) return {};
  const source = hasMdxPage(group, slug) ? await readMdxPage(group, slug) : undefined;
  const pageTitle = source?.frontmatter.title ?? doc.title;
  const title = `${pageTitle} · Owed docs`;
  const description = source?.frontmatter.summary ?? doc.summary;
  return {
    title,
    description,
    openGraph: { title, description, type: "article", url: docHref(doc) },
  };
}

export default async function Page({ params }: { params: Promise<{ group: string; slug: string }> }) {
  const { group, slug } = await params;
  const doc = findDoc(group, slug);
  const isMdx = Boolean(doc) && hasMdxPage(group, slug);
  if (!doc || (!isMdx && !docContent(group, slug))) notFound();
  return <DocPage group={group} slug={slug} isMdx={isMdx} />;
}
