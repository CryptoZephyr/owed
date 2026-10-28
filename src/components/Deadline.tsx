import { formatDay, formatDeadline } from "@/lib/format";
import s from "./deadline.module.css";

export function timeLeft(ms: number): string {
  if (ms <= 0) return "Deadline passed";
  const minutes = Math.floor(ms / 60000);
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

export function Deadline({ deadline, start, now = new Date(), label = "Reply due", compact }: {
  deadline: Date; start?: Date | null; now?: Date; label?: string; compact?: boolean;
}) {
  const left = deadline.getTime() - now.getTime();
  const from = start ?? null;
  const span = from ? deadline.getTime() - from.getTime() : 0;
  const pct = from && span > 0 ? Math.min(100, Math.max(0, ((now.getTime() - from.getTime()) / span) * 100)) : null;
  return <div className={s.deadline} data-compact={compact || undefined}>
    <p className={s.sentence}>{label} {formatDeadline(deadline)}</p>
    <p className={s.left} data-passed={left <= 0 || undefined}>{left > 0 ? <><span className={s.figure}>{timeLeft(left)}</span> <span className={s.unit}>left</span></> : <span className={s.figure}>{timeLeft(left)}</span>}</p>
    {pct !== null && from && <div className={s.timeline}>
      <div className={s.track} aria-hidden="true"><span className={s.now} style={{ left: `${pct}%` }} /></div>
      <div className={s.ends}><span>{formatDay(from)}</span><span>{formatDay(deadline)}</span></div>
    </div>}
  </div>;
}
