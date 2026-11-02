import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type DocFrontmatter = {
  title: string;
  summary: string;
  lastVerified: string;
  commit: string;
};

const docsRoot = path.join(process.cwd(), "src", "content", "docs");

export function mdxFilePath(group: string, slug: string): string {
  return path.join(docsRoot, group, `${slug}.mdx`);
}

export async function readMdxPage(group: string, slug: string): Promise<{ raw: string; frontmatter: DocFrontmatter }> {
  const raw = await readFile(mdxFilePath(group, slug), "utf8");
  return { raw, frontmatter: parseFrontmatter(raw) };
}

export function parseFrontmatter(raw: string): DocFrontmatter {
  const block = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!block) throw new Error("MDX frontmatter is missing");

  const values: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  const frontmatter = {
    title: values.title,
    summary: values.summary,
    lastVerified: values.lastVerified,
    commit: values.commit,
  };
  if (Object.values(frontmatter).some((value) => !value)) throw new Error("MDX frontmatter is incomplete");
  return frontmatter as DocFrontmatter;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function headings(raw: string): { id: string; title: string }[] {
  return Array.from(raw.matchAll(/^## (.+)$/gm), (match) => {
    const title = match[1]?.trim() ?? "";
    return { id: slugify(title), title };
  });
}
