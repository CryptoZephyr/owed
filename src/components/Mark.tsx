const path = "M5.515 37.25H33.655L39.829 29.312A2.75 2.75 0 0 1 44.171 32.688L37.171 41.688A2.75 2.75 0 0 1 35 42.75H7.232A27 27 0 1 0 5.515 37.25Z";

export function Mark({ size = 20, tone = "ink", label }: { size?: number; tone?: "ink" | "paper"; label?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size}
    role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
    <path fill={tone === "ink" ? "#1F2421" : "#F6F1E7"} d={path} />
  </svg>;
}
