// キャラのビジュアル(ダミー)。画像ファイルは使わず、キャラ属性から
// エフェクター風のSVGを決定的に生成する。colorHex を基調色にする。

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) + amt
  let g = ((n >> 8) & 0xff) + amt
  let b = (n & 0xff) + amt
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export default function PedalAvatar({ character, size = 120 }) {
  if (!character) return null
  const c = character.colorHex || '#888888'
  const dark = shade(c, -50)
  const light = shade(c, 45)
  const w = size
  const h = size * 1.35
  return (
    <svg width={w} height={h} viewBox="0 0 100 135" role="img" aria-label={character.name}>
      <defs>
        <linearGradient id={`g-${character.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      {/* 筐体 */}
      <rect x="10" y="6" width="80" height="123" rx="8" fill={`url(#g-${character.id})`} stroke={dark} strokeWidth="2" />
      {/* 上部ラベルプレート */}
      <rect x="18" y="14" width="64" height="34" rx="4" fill="#1c1c22" opacity="0.85" />
      <text x="50" y="35" textAnchor="middle" fontSize="11" fontWeight="700" fill="#f4f4f6" fontFamily="sans-serif">
        {character.name}
      </text>
      {/* ノブ3つ */}
      {[28, 50, 72].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="62" r="7" fill="#101014" stroke={light} strokeWidth="1.5" />
          <line x1={cx} y1="62" x2={cx} y2="56" stroke={light} strokeWidth="1.6" />
        </g>
      ))}
      {/* フットスイッチ */}
      <circle cx="50" cy="92" r="10" fill="#0d0d10" stroke={light} strokeWidth="2" />
      {/* LED */}
      <circle cx="50" cy="112" r="3.5" fill={light} />
      {/* 底ゴム */}
      <rect x="16" y="123" width="68" height="5" rx="2" fill={dark} />
    </svg>
  )
}
