import Link from "next/link";
import { Lockup } from "./Lockup";
import s from "./footer.module.css";

type Figure = { x: number; k: number; w: number; t: number; r: number; dx: number; extra?: "ponytail" | "folder" | "bun" | "beanie" | "hair" | "bag" | "hood" };

const queue: Figure[] = [
  { x: 40, k: 1.18, w: 15, t: 46, r: 9, dx: 0 },
  { x: 112, k: 1.08, w: 13, t: 50, r: 8.5, dx: 1, extra: "ponytail" },
  { x: 182, k: 1.14, w: 17, t: 44, r: 9.5, dx: -1, extra: "folder" },
  { x: 250, k: 1.02, w: 12.5, t: 52, r: 8, dx: 0, extra: "bun" },
  { x: 318, k: 1.1, w: 16, t: 47, r: 9, dx: 2, extra: "beanie" },
  { x: 386, k: 1.0, w: 14, t: 49, r: 8.5, dx: 0, extra: "hair" },
  { x: 452, k: 1.05, w: 15.5, t: 44, r: 9, dx: -2, extra: "bag" },
  { x: 516, k: 0.97, w: 13, t: 50, r: 8, dx: 1 },
  { x: 578, k: 1.0, w: 16, t: 46, r: 9, dx: 0, extra: "hood" },
  { x: 638, k: 0.93, w: 12.5, t: 51, r: 8, dx: 0, extra: "ponytail" },
  { x: 696, k: 0.95, w: 15, t: 45, r: 8.5, dx: -1 },
  { x: 752, k: 0.9, w: 13.5, t: 48, r: 8, dx: 1, extra: "bun" },
  { x: 806, k: 0.88, w: 14.5, t: 46, r: 8.5, dx: 0, extra: "bag" },
  { x: 858, k: 0.85, w: 12.5, t: 49, r: 7.8, dx: 0, extra: "hair" },
  { x: 908, k: 0.83, w: 14, t: 45, r: 8, dx: -1, extra: "beanie" },
  { x: 956, k: 0.8, w: 13, t: 47, r: 7.6, dx: 0 },
  { x: 1002, k: 0.78, w: 12, t: 49, r: 7.4, dx: 1, extra: "ponytail" },
  { x: 1046, k: 0.76, w: 13.5, t: 45, r: 7.6, dx: 0, extra: "folder" },
];

const ground = 128;
const n = (v: number) => Math.round(v * 10) / 10;

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`;
}

function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (!r) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  return `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}q${n(r)} 0 ${n(r)} ${n(r)}v${n(h - 2 * r)}q0 ${n(r)} ${n(-r)} ${n(r)}h${n(-(w - 2 * r))}q${n(-r)} 0 ${n(-r)} ${n(-r)}v${n(-(h - 2 * r))}q0 ${n(-r)} ${n(r)} ${n(-r)}Z`;
}

function figure({ x, k, w, t, r, dx, extra }: Figure): string[] {
  const W = w * k, top = ground - t * k, hx = x + dx * k, hr = r * k, neckTop = top - 7 * k, hy = neckTop - hr * 0.95;
  const torso = `M${n(x - W + 2 * k)} ${ground}L${n(x - W)} ${n(top + 10 * k)}Q${n(x - W)} ${n(top)} ${n(x - W + 9 * k)} ${n(top - k)}`
    + `L${n(x + W - 9 * k)} ${n(top - k)}Q${n(x + W)} ${n(top)} ${n(x + W)} ${n(top + 10 * k)}L${n(x + W - 2 * k)} ${ground}Z`;
  const parts = [torso, rect(hx - 3 * k, neckTop, 6 * k, 9 * k), ellipse(hx, hy, hr * 0.9, hr)];
  if (extra === "ponytail") parts.push(ellipse(hx, neckTop + 1 * k, 3.4 * k, 9 * k));
  if (extra === "bun") parts.push(ellipse(hx, hy - hr - 1.5 * k, 4.2 * k, 3.8 * k));
  if (extra === "beanie") parts.push(ellipse(hx, hy - hr * 0.35, hr * 0.98, hr * 0.85));
  if (extra === "hair") parts.push(rect(hx - hr * 1.02, hy - hr * 0.2, hr * 2.04, (neckTop - hy) + hr * 0.2 + 5 * k, 4 * k));
  if (extra === "folder") parts.push(rect(x + W - 2 * k, top + 13 * k, 6 * k, 22 * k, 1));
  if (extra === "bag") parts.push(rect(x - W - 7 * k, ground - 34 * k, 10 * k, 17 * k, 2 * k));
  if (extra === "hood") parts.push(ellipse(hx, hy + 2 * k, hr * 1.18, hr * 1.12), `M${n(hx - hr * 1.1)} ${n(hy + 3 * k)}L${n(x - W + 6 * k)} ${n(top + 2 * k)}L${n(x + W - 6 * k)} ${n(top + 2 * k)}L${n(hx + hr * 1.1)} ${n(hy + 3 * k)}Z`);
  return parts;
}

const people = queue.flatMap(figure);
const wall = "M1104 128V14Q1104 8 1110 8H1200V128Z";
const door = "M1136 128V40H1172V128Z";

function Links({ tone, label = "Footer" }: { tone: "ink" | "paper"; label?: string }) {
  return <nav aria-label={label} className={s.links} data-tone={tone}>
    <Link href="/docs/start/how-it-works">How it works</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link>
    <span className={s.paypal}>Payments by PayPal</span>
  </nav>;
}

export function SilhouetteFooter() {
  return <footer className={s.silhouette}>
    <svg className={s.art} viewBox="0 0 1200 128" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      <g fill="#1F2421">{[...people, wall].map((d, i) => <path key={i} d={d} />)}</g>
      <path d={door} fill="#F6F1E7" />
    </svg>
    <div className={s.block}>
      <div className={s.inner}>
        <Lockup tone="paper" />
        <p className={s.copy}>Every interviewed candidate hears back by a set date, or gets paid.</p>
        <Links tone="paper" />
      </div>
    </div>
  </footer>;
}

export function PlainFooter({ region = false }: { region?: boolean }) {
  const content = <div className={s.inner}><Lockup /><Links tone="ink" label={region ? "Plain footer links" : "Footer"} /></div>;
  if (region) return <section className={s.plain} aria-label="Plain footer example">{content}</section>;
  return <footer className={s.plain}>{content}</footer>;
}
