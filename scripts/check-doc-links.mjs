import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src/content/docs");
const groups = await readdir(root, { withFileTypes: true });
const files = (await Promise.all(groups.filter((entry) => entry.isDirectory()).map(async (group) =>
  (await readdir(path.join(root, group.name), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => path.join(root, group.name, entry.name))))).flat();
let failures = 0;
let count = 0;
for (const file of [...files, path.resolve("README.md")]) {
  const raw = await readFile(file, "utf8");
  for (const match of raw.matchAll(/https:\/\/[^\s)<>"']+/g)) {
    const url = match[0].replace(/[.,!?]+$/, "");
    count++;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
      console.log(`${response.status} ${path.relative(process.cwd(), file)} ${url}`);
      if (!response.ok) failures++;
    } catch (error) {
      console.error(`ERROR ${path.relative(process.cwd(), file)} ${url}: ${error instanceof Error ? error.message : String(error)}`);
      failures++;
    }
  }
}
console.log(`Checked ${count} external links, ${failures} failed.`);
if (failures) process.exitCode = 1;
