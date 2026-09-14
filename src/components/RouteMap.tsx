/**
 * Route diagram.
 *
 * Deliberately not a tile map. A farmer on a 2G connection at the edge of a village
 * does not need satellite imagery of a road they have driven their whole life — they
 * need to know how far along the truck is and which pickup is next. This is an inline
 * SVG: no tile requests, no API key, no blank grey square when the network drops.
 *
 * Coordinates are projected into the diagram's own box, so the shape of the route is
 * real even though the scale is not.
 */
interface Pt {
  lat: number;
  lng: number;
}

export function RouteMap({
  origin,
  destination,
  stops,
  current,
  progress,
  lang = "en",
}: {
  origin: Pt & { label: string };
  destination: Pt & { label: string };
  stops: Array<Pt & { label: string; mine: boolean }>;
  current: Pt | null;
  progress: number;
  lang?: "en" | "hi";
}) {
  const all = [origin, destination, ...stops, ...(current ? [current] : [])];

  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const W = 320;
  const H = 130;
  const PAD = 26;

  // Guard against a zero-extent box when every point coincides.
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;

  const x = (p: Pt) => PAD + ((p.lng - minLng) / spanLng) * (W - PAD * 2);
  const y = (p: Pt) => H - PAD - ((p.lat - minLat) / spanLat) * (H - PAD * 2);

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Route from ${origin.label} to ${destination.label}, ${progress}% complete`}
      >
        {/* the road, drawn as the dashed rule of a printed form */}
        <line
          x1={x(origin)}
          y1={y(origin)}
          x2={x(destination)}
          y2={y(destination)}
          stroke="var(--color-rule-strong)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        {/* the part already driven */}
        <line
          x1={x(origin)}
          y1={y(origin)}
          x2={x(origin) + (x(destination) - x(origin)) * (progress / 100)}
          y2={y(origin) + (y(destination) - y(origin)) * (progress / 100)}
          stroke="var(--color-keep)"
          strokeWidth="3"
        />

        {stops.map((s, i) => (
          <g key={i}>
            <line
              x1={x(s)}
              y1={y(s)}
              x2={x(origin) + (x(destination) - x(origin)) * 0.5}
              y2={y(origin) + (y(destination) - y(origin)) * 0.5}
              stroke="var(--color-rule)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={x(s)}
              cy={y(s)}
              r={s.mine ? 6 : 4}
              fill={s.mine ? "var(--color-pool)" : "var(--color-paper)"}
              stroke={s.mine ? "var(--color-pool)" : "var(--color-ink-3)"}
              strokeWidth="1.5"
            />
          </g>
        ))}

        <circle
          cx={x(origin)}
          cy={y(origin)}
          r="5"
          fill="var(--color-paper)"
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
        <rect
          x={x(destination) - 5}
          y={y(destination) - 5}
          width="10"
          height="10"
          fill="var(--color-keep)"
        />

        {current && progress < 100 && (
          <g>
            <circle
              cx={x(current)}
              cy={y(current)}
              r="8"
              fill="var(--color-keep)"
              opacity="0.18"
            />
            <circle
              cx={x(current)}
              cy={y(current)}
              r="4"
              fill="var(--color-keep)"
            />
          </g>
        )}

        <text
          x={x(origin)}
          y={y(origin) + 18}
          textAnchor="middle"
          fontSize="9"
          fill="var(--color-ink-2)"
        >
          {origin.label}
        </text>
        <text
          x={x(destination)}
          y={y(destination) - 11}
          textAnchor="middle"
          fontSize="9"
          fill="var(--color-keep)"
          fontWeight="600"
        >
          {destination.label}
        </text>
      </svg>

      <figcaption className="tnum mt-1 text-center text-[12px] text-[var(--color-ink-3)]">
        {lang === "hi"
          ? `रास्ता ${progress}% पूरा`
          : `${progress}% of the way`}
      </figcaption>
    </figure>
  );
}
