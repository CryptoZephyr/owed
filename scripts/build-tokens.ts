import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tokens } from "../src/design/tokens";

const declarations: [string, string][] = [];
const kebab = (name: string): string => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

for (const [name, value] of Object.entries(tokens.color)) {
  declarations.push([`--color-${kebab(name)}`, value]);
}

for (const [name, value] of Object.entries(tokens.status)) {
  declarations.push([`--status-${name}`, value]);
}

for (const value of Object.values(tokens.space)) {
  declarations.push([`--space-${value}`, `${value}px`]);
}

for (const [name, value] of Object.entries(tokens.radius)) {
  declarations.push([`--radius-${name}`, `${value}px`]);
}

for (const [name, value] of Object.entries(tokens.font)) {
  declarations.push([`--font-${name}`, value]);
}

for (const [name, value] of Object.entries(tokens.type)) {
  const typeName = kebab(name);
  declarations.push([`--type-${typeName}-size`, `${value.size}px`]);
  declarations.push([`--type-${typeName}-line`, `${value.lineHeight}px`]);
  if ("weight" in value) declarations.push([`--type-${typeName}-weight`, `${value.weight}`]);
  if ("tracking" in value) declarations.push([`--type-${typeName}-tracking`, value.tracking]);
}

for (const [name, value] of Object.entries(tokens.motion)) {
  declarations.push([`--motion-${name}`, typeof value === "number" ? `${value}ms` : value]);
}

async function main(): Promise<void> {
  const css = `:root {\n${declarations.map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}\n`;
  await writeFile(resolve(process.cwd(), "src/app/tokens.css"), css);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
