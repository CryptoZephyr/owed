import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ALL_DOCS, DOC_GROUPS, docHref } from "../src/content/docs/nav";
import { DOC_CONTENT, docContent } from "../src/content/docs/registry";

const docsRoot = path.join(process.cwd(), "src", "content", "docs");
const mdxPath = (group: string, slug: string) => path.join(docsRoot, group, `${slug}.mdx`);
const mdxRoutes = new Set(readdirSync(docsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((group) =>
  readdirSync(path.join(docsRoot, group.name), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => `${group.name}/${entry.name.slice(0, -4)}`),
));

test("every documentation navigation item resolves to one page body", () => {
  assert.equal(ALL_DOCS.length, 32);
  assert.equal(DOC_GROUPS.find((group) => group.slug === "architecture")?.pages.length, 5);
  for (const doc of ALL_DOCS) {
    const legacy = Boolean(docContent(doc.group, doc.slug));
    const mdx = existsSync(mdxPath(doc.group, doc.slug));
    assert.equal(Number(legacy) + Number(mdx), 1, `${docHref(doc)} must have exactly one source`);
  }
  const routes = new Set(ALL_DOCS.map((doc) => `${doc.group}/${doc.slug}`));
  for (const route of Object.keys(DOC_CONTENT)) assert.ok(routes.has(route), `Legacy content has no navigation route: ${route}`);
  for (const route of mdxRoutes) assert.ok(routes.has(route), `MDX content has no navigation route: ${route}`);
  assert.equal(Object.keys(DOC_CONTENT).length + mdxRoutes.size, ALL_DOCS.length);
});

test("every internal docs link in page content resolves to a real route", () => {
  const routes = new Set(ALL_DOCS.map(docHref));
  for (const [page, content] of Object.entries(DOC_CONTENT)) {
    for (const section of content.sections) {
      for (const item of section.links ?? []) {
        assert.ok(item.href.startsWith("/docs/"), `${page} has a non-docs internal link`);
        assert.ok(routes.has(item.href), `${page} links to missing route ${item.href}`);
      }
    }
  }
  for (const page of mdxRoutes) {
    const raw = readFileSync(path.join(docsRoot, `${page}.mdx`), "utf8");
    for (const match of raw.matchAll(/\]\((\/docs\/[^)#\s]+)(?:#[^)]*)?\)/g)) {
      const href = match[1];
      assert.ok(href);
      assert.ok(routes.has(href), `${page} links to missing route ${href}`);
    }
  }
});

test("documentation page bodies have no placeholder copy", () => {
  const legacyBody = Object.values(DOC_CONTENT).map((content) => [
    content.summary,
    ...content.sections.flatMap((section) => [section.title, ...section.paragraphs, ...(section.bullets ?? []), ...(section.steps ?? []), ...(section.links ?? []).map((item) => item.label)]),
    ...(content.curious ?? []),
    ...(content.curiousCode ?? []),
  ].join("\n")).join("\n");
  const mdxBody = Array.from(mdxRoutes, (page) => readFileSync(path.join(docsRoot, `${page}.mdx`), "utf8")).join("\n");
  const body = `${legacyBody}\n${mdxBody}`;
  assert.doesNotMatch(body, /TODO|lorem|coming soon/i);
});
