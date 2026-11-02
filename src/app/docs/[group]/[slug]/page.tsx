import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocPage } from "@/components/docs/doc-page";
import { readMdxPage } from "@/content/docs/frontmatter";
import { ALL_DOCS, docHref, findDoc } from "@/content/docs/nav";

export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_DOCS.map(({ group, slug }) => ({ group, slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ group: string; slug: string }> }): Promise<Metadata> {
  const { group, slug } = await params;
  const doc = findDoc(group, slug);
  if (!doc) return {};
  const source = await readMdxPage(group, slug);
  const pageTitle = source.frontmatter.title;
  const title = `${pageTitle} · Owed docs`;
  const description = source.frontmatter.summary;
  return {
    title,
    description,
    openGraph: { title, description, type: "article", url: docHref(doc) },
  };
}

export default async function Page({ params }: { params: Promise<{ group: string; slug: string }> }) {
  const { group, slug } = await params;
  if (!findDoc(group, slug)) notFound();
  return <DocPage group={group} slug={slug} />;
}
