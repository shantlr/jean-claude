export function CountdownRing({
  startAt,
  endAt,
  now = 0,
  size = 28,
  strokeWidth = 2.5,
  className,
  color = 'currentColor',
}: {
  startAt: string;
  endAt: string;
  now?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
}) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const live = now >= start && now < end;

  let pct = 0;
  if (live) {
    pct = 1;
  } else {
    const tenMin = 10 * 60_000;
    const remain = start - now;
    pct = Math.max(0, Math.min(1, (tenMin - remain) / tenMin));
  }

  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ display: 'block' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="stroke-bg-3"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 600ms ease' }}
      />
      {live && (
        <circle cx={size / 2} cy={size / 2} r={3} fill={color}>
          <animate
            attributeName="opacity"
            values="1;0.3;1"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
}
