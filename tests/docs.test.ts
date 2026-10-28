import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_DOCS, DOC_GROUPS, docHref } from "../src/content/docs/nav";
import { DOC_CONTENT, docContent } from "../src/content/docs/registry";

test("every documentation navigation item resolves to one page body", () => {
  assert.equal(ALL_DOCS.length, 33);
  assert.equal(DOC_GROUPS.find((group) => group.slug === "architecture")?.pages.length, 5);
  for (const doc of ALL_DOCS) {
    assert.ok(docContent(doc.group, doc.slug), `Missing content for ${docHref(doc)}`);
  }
  assert.equal(Object.keys(DOC_CONTENT).length, ALL_DOCS.length);
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
});

test("documentation page bodies have no placeholder copy", () => {
  const body = Object.values(DOC_CONTENT).map((content) => [
    content.summary,
    ...content.sections.flatMap((section) => [section.title, ...section.paragraphs, ...(section.bullets ?? []), ...(section.steps ?? []), ...(section.links ?? []).map((item) => item.label)]),
    ...(content.curious ?? []),
    ...(content.curiousCode ?? []),
  ].join("\n")).join("\n");
  assert.doesNotMatch(body, /TODO|lorem|coming soon/i);
});
