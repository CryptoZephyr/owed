import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocPage } from "@/components/docs/doc-page";
import { ALL_DOCS, findDoc } from "@/content/docs/nav";
import { docContent } from "@/content/docs/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_DOCS.map(({ group, slug }) => ({ group, slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ group: string; slug: string }> }): Promise<Metadata> {
  const { group, slug } = await params;
  const doc = findDoc(group, slug);
  return doc ? { title: `${doc.title} · Owed docs`, description: doc.summary } : {};
}

export default async function Page({ params }: { params: Promise<{ group: string; slug: string }> }) {
  const { group, slug } = await params;
  if (!findDoc(group, slug) || !docContent(group, slug)) notFound();
  return <DocPage group={group} slug={slug} />;
}
