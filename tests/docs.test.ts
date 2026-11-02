import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ALL_DOCS, DOC_GROUPS, docHref } from "../src/content/docs/nav";
import { CLOSURE_STATUSES, GUARANTEE_STATUSES, ROLE_STATUSES } from "../src/lib/owed/domain";

const root = path.join(process.cwd(), "src", "content", "docs");
const mdxPath = (route: string) => path.join(root, `${route}.mdx`);
const groups = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
const mdxRoutes = new Set(groups.flatMap((group) => readdirSync(path.join(root, group.name), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
  .map((entry) => `${group.name}/${entry.name.slice(0, -4)}`)));
const routes = new Set(ALL_DOCS.map(docHref));

test("every navigation page has exactly one MDX source", () => {
  assert.equal(ALL_DOCS.length, 29);
  assert.deepEqual(DOC_GROUPS.map(({ slug }) => slug), ["get-started", "guides", "concepts", "reference", "security", "evidence", "help"]);
  for (const doc of ALL_DOCS) assert.ok(existsSync(mdxPath(`${doc.group}/${doc.slug}`)), `${docHref(doc)} has no MDX file`);
  assert.deepEqual([...mdxRoutes].sort(), ALL_DOCS.map(({ group, slug }) => `${group}/${slug}`).sort());
  assert.equal(existsSync(path.join(root, "pages", "content.ts")), false);
  assert.equal(existsSync(path.join(root, "registry.ts")), false);
});

test("guides use the required five sections in order", () => {
  const expected = ["What you see", "What you do", "What Owed does", "How you know it worked", "If nothing changes"];
  for (const doc of ALL_DOCS.filter(({ group }) => group === "guides")) {
    const raw = readFileSync(mdxPath(`${doc.group}/${doc.slug}`), "utf8");
    const sections = [...raw.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    assert.deepEqual(sections, expected, `${docHref(doc)} uses the required guide sections`);
  }
});

test("frontmatter and internal and external links are valid", () => {
  for (const route of mdxRoutes) {
    const raw = readFileSync(mdxPath(route), "utf8");
    const block = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/m)?.[1];
    assert.ok(block, `${route} has no frontmatter`);
    const fields = Object.fromEntries([...block.matchAll(/^(\w+):\s*['"]?(.+?)['"]?$/gm)].map((m) => [m[1], m[2]]));
    assert.ok(fields.title && fields.summary);
    assert.match(fields.lastVerified ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.match(fields.commit ?? "", /^[0-9a-f]{7}$/i);
    const nav = ALL_DOCS.find((doc) => `${doc.group}/${doc.slug}` === route);
    assert.equal(fields.title, nav?.title);
    assert.equal(fields.summary, nav?.summary);
    for (const match of raw.matchAll(/\]\((\/docs\/[^)#\s]+)(?:#[^)]*)?\)/g)) assert.ok(routes.has(match[1]!), `${route} links to missing ${match[1]}`);
    for (const match of raw.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) assert.ok(match[1]!.startsWith("https://"));
    assert.doesNotMatch(raw, /todo|coming soon|lorem|placeholder/i, `${route} has placeholder copy`);
  }
  const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
  for (const match of readme.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) assert.ok(match[1]!.startsWith("https://"));
  for (const match of readme.matchAll(/\]\((https:\/\/owed-vert-ten\.vercel\.app\/docs\/[^)#\s]+)(?:#[^)]*)?\)/g)) {
    assert.ok(routes.has(new URL(match[1]!).pathname), `README links to missing ${match[1]}`);
  }
});

test("redirects go directly to existing navigation pages", () => {
  const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  const redirects = [...config.matchAll(/source:\s*"([^"]+)"\s*,\s*destination:\s*"([^"]+)"\s*,\s*permanent:\s*true/g)];
  assert.equal(redirects.length, 27);
  const sources = new Set(redirects.map((m) => m[1]));
  for (const [, source, destination] of redirects) {
    assert.ok(routes.has(destination!), `${source} targets missing ${destination}`);
    assert.ok(!sources.has(destination), `${source} redirects through ${destination}`);
  }
});

test("documented status arrays match database constraints", () => {
  const migration = readFileSync(path.join(process.cwd(), "supabase/migrations/202610190001_owed.sql"), "utf8");
  const values = (pattern: RegExp) => {
    const constraint = migration.match(pattern)?.[1];
    assert.ok(constraint);
    return [...constraint.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  assert.deepEqual(ROLE_STATUSES, values(/create table owed\.roles \([\s\S]*?status text not null default 'draft' check \(status in \(([^)]+)\)\)/));
  assert.deepEqual(GUARANTEE_STATUSES, values(/create table owed\.guarantees \([\s\S]*?status text not null default 'invited' check \(status in \(([^)]+)\)\)/));
  assert.deepEqual(CLOSURE_STATUSES, values(/closure_status text check \(closure_status in \(([^)]+)\)\)/));
});
