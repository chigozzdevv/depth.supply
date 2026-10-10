const glyphs = Array.from({ length: 19 }, () => "");

for (let row = 0; row < 22; row++) {
  for (let column = 0; column < 32; column++) {
    const seed = (row * 7 + column * 11 + row * column) % glyphs.length;
    const width = seed % 3 === 0 ? 3 : 6;
    const height = seed % 4 === 0 ? 8 : 3;
    glyphs[seed] +=
      `M${120 + column * 10} ${208 + row * 10}h${width}v${height}h-${width}z`;
  }
}

export function Cipher() {
  return (
    <svg
      className="privacy-cipher"
      viewBox="0 0 640 520"
      role="img"
      aria-label="Layered sheets of ciphertext illustrate encrypted trading data."
    >
      <defs>
        <linearGradient id="cipher-face" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#20201d" />
          <stop offset="1" stopColor="#0c0c0b" />
        </linearGradient>
        <linearGradient id="cipher-edge" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#e0dcd0" stopOpacity="0.48" />
          <stop offset="0.5" stopColor="#8d8a80" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ed864a" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id="cipher-shine">
          <stop stopColor="#ed864a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ed864a" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ed864a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="cipher-glow">
          <stop stopColor="#ed864a" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ed864a" stopOpacity="0" />
        </radialGradient>
        <pattern
          id="cipher-grid"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <path d="M4 4h3v8H4zM12 12h3v3h-3z" fill="#aaa69a" />
        </pattern>
        <clipPath id="cipher-front">
          <rect x="96" y="156" width="360" height="308" rx="8" />
        </clipPath>
      </defs>
      <ellipse cx="342" cy="386" rx="290" ry="168" fill="url(#cipher-glow)" />
      <g opacity="0.5">
        <rect
          x="208"
          y="44"
          width="334"
          height="332"
          rx="8"
          fill="url(#cipher-face)"
          stroke="url(#cipher-edge)"
        />
        <rect
          x="232"
          y="68"
          width="286"
          height="284"
          fill="url(#cipher-grid)"
          opacity="0.22"
        />
      </g>
      <g opacity="0.8">
        <rect
          x="152"
          y="100"
          width="334"
          height="332"
          rx="8"
          fill="url(#cipher-face)"
          stroke="url(#cipher-edge)"
        />
        <rect
          x="176"
          y="124"
          width="286"
          height="284"
          fill="url(#cipher-grid)"
          opacity="0.3"
        />
      </g>
      <rect
        x="96"
        y="156"
        width="360"
        height="308"
        rx="8"
        fill="url(#cipher-face)"
        stroke="url(#cipher-edge)"
      />
      <path
        d="M120 182h74M414 182h18"
        stroke="#d1ccbe"
        strokeOpacity="0.45"
        strokeWidth="2"
      />
      {glyphs.map((path, seed) => (
        <path
          key={seed}
          d={path}
          fill={seed < 3 ? "#ed864a" : "#b0ac9f"}
          opacity={0.16 + seed / 48}
        />
      ))}
      <g clipPath="url(#cipher-front)">
        <rect
          className="cipher-shine"
          x="96"
          y="156"
          width="120"
          height="308"
          fill="url(#cipher-shine)"
        />
      </g>
      <path
        d="M96 204v-40a8 8 0 0 1 8-8h44M404 464h44a8 8 0 0 0 8-8v-40"
        fill="none"
        stroke="#d79972"
        strokeOpacity="0.72"
      />
    </svg>
  );
}
