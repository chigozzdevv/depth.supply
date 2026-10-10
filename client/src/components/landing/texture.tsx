const marks = Array.from({ length: 23 }, () => "");
const movingSeeds = [4, 12, 20];
const streams = Array.from({ length: 6 }, () =>
  Array.from({ length: movingSeeds.length }, () => ""),
);

function rectangle(row: number, column: number, seed: number) {
  const width = seed % 3 === 0 ? 2 : 6;
  const height = seed % 4 === 0 ? 13 : 4;
  return `M${column * 18} ${row * 18}h${width}v${height}h-${width}z`;
}

for (let row = 0; row < 16; row++) {
  for (let column = 0; column < 14; column++) {
    const seed = (row * 31 + column * 17 + row * column * 3) % 23;
    marks[seed] += rectangle(row, column, seed);
  }
}

for (let row = 0; row < 49; row++) {
  for (let column = 0; column < 80; column++) {
    const tileRow = row % 16;
    const tileColumn = column % 14;
    const seed =
      (tileRow * 31 + tileColumn * 17 + tileRow * tileColumn * 3) % 23;
    const index = movingSeeds.indexOf(seed);

    if (index !== -1) {
      const phase = Math.floor(column / 7) % streams.length;
      streams[phase][index] += rectangle(row, column, seed);
    }
  }
}

export function Texture() {
  return (
    <div className="hero-texture" aria-hidden="true">
      <svg viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern
            id="hero-texture"
            width="252"
            height="288"
            patternUnits="userSpaceOnUse"
          >
            {marks.map((path, seed) =>
              movingSeeds.includes(seed) ? null : (
                <path
                  key={seed}
                  d={path}
                  fill={seed < 5 ? "#ed864a" : "#77756e"}
                  opacity={0.1 + seed / 48}
                />
              ),
            )}
          </pattern>
        </defs>
        <path d="M0 0h1440v800H0z" fill="url(#hero-texture)" />
        {streams.map((paths, phase) => (
          <g
            key={phase}
            className="texture-stream"
            style={{ animationDelay: `${(-phase * 16) / streams.length}s` }}
          >
            {paths.map((path, index) => (
              <path
                key={movingSeeds[index]}
                d={path}
                fill={movingSeeds[index] < 5 ? "#ed864a" : "#77756e"}
                opacity={0.1 + movingSeeds[index] / 48}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
