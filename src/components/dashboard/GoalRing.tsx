'use client';

export function GoalRing({
  pct, grade, size = 80,
}: {
  pct: number; grade: string; size?: number;
}) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  const strokeColor =
    grade === 'A' ? '#16a34a' :
    grade === 'B' ? '#2563eb' :
    grade === 'C' ? '#ca8a04' :
    grade === 'D' ? '#ea580c' : '#dc2626';
  const trackColor =
    grade === 'A' ? '#dcfce7' :
    grade === 'B' ? '#dbeafe' :
    grade === 'C' ? '#fef9c3' :
    grade === 'D' ? '#ffedd5' : '#fee2e2';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block mx-auto">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth="8" />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={strokeColor} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x={size/2} y={size/2 - 4} textAnchor="middle" fontSize="18" fontWeight="900" fill={strokeColor}>{grade}</text>
      <text x={size/2} y={size/2 + 13} textAnchor="middle" fontSize="10" fill="#94a3b8">{pct}%</text>
    </svg>
  );
}
