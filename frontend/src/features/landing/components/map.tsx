import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

type MapBaseProps = {
  width: number;
  height: number;
  step?: readonly [number, number];
  block?: readonly [number, number];
  origin?: readonly [number, number];
  parks?: readonly string[];
  river?: string;
  avenues?: readonly string[];
};

export function MapBase({
  width,
  height,
  step = [78, 72],
  block = [64, 58],
  origin = [-20, -26],
  parks = [],
  river,
  avenues = [],
}: MapBaseProps) {
  const cells: ReactNode[] = [];

  for (let y = origin[1], row = 0; y < height; y += step[1], row++) {
    for (let x = origin[0], col = 0; x < width; x += step[0], col++) {
      const park = parks.includes(`${col},${row}`);
      cells.push(
        <rect
          key={`${col}-${row}`}
          x={x}
          y={y}
          width={block[0]}
          height={block[1]}
          rx={Math.min(8, block[0] / 7)}
          className={park ? "fill-(--map-park)" : "fill-(--map-block)"}
        />,
      );
    }
  }

  return (
    <g>
      <rect width={width} height={height} className="fill-(--map-road)" />
      {cells}
      {river ? <path d={river} className="fill-(--map-water)" /> : null}
      {avenues.map((d) => (
        <g key={d} fill="none" strokeLinecap="round">
          <path d={d} strokeWidth={15} className="stroke-(--map-road-edge)" />
          <path d={d} strokeWidth={12} className="stroke-(--map-road)" />
        </g>
      ))}
    </g>
  );
}

type MapSvgProps = {
  width: number;
  height: number;
  className?: string;
  children?: ReactNode;
  base?: Omit<MapBaseProps, "width" | "height">;
};

export function MapSvg({ width, height, className, children, base }: MapSvgProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={cx("absolute inset-0 size-full", className)}
      aria-hidden="true"
      focusable="false"
    >
      <MapBase width={width} height={height} {...base} />
      {children}
    </svg>
  );
}

type RouteLineProps = {
  d: string;
  /** "reveal" draws when the enclosing [data-reveal] block is shown, "now" draws on mount (and replays in screen cyclers). */
  draw?: "reveal" | "now";
  delay?: number;
  tone?: "brand" | "muted";
  dashed?: boolean;
  width?: number;
};

export function RouteLine({ d, draw, delay, tone = "brand", dashed = false, width = 4.5 }: RouteLineProps) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {tone === "brand" ? <path d={d} strokeWidth={width * 2.2} className="stroke-brand/25" /> : null}
      <path
        d={d}
        pathLength={1}
        strokeWidth={tone === "brand" ? width : width * 0.8}
        strokeDasharray={dashed ? "0.012 0.018" : undefined}
        className={cx(
          tone === "brand" ? "stroke-brand-strong" : "stroke-muted/60",
          draw && !dashed && "route-draw",
          draw === "now" && !dashed && "route-draw-now replay",
        )}
        style={delay ? { animationDelay: `${delay}ms` } : undefined}
      />
    </g>
  );
}

export function PickupPin({ x, y, pulse = true }: { x: number; y: number; pulse?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {pulse ? (
        <circle r={9} className="animate-pulse-ring fill-brand/40 [transform-box:fill-box] origin-center" />
      ) : null}
      <circle r={8.5} className="fill-surface" />
      <circle r={5} className="fill-brand-strong" />
    </g>
  );
}

export function DestinationPin({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={1} rx={6} ry={2.2} className="fill-ink/20" />
      <path
        d="M0 0c-1.4-4.2-10-9.6-10-17.4a10 10 0 0 1 20 0C10-9.6 1.4-4.2 0 0Z"
        className="fill-heading"
      />
      <rect x={-3.6} y={-21} width={7.2} height={7.2} rx={1.8} className="fill-surface" />
    </g>
  );
}

export function StopDot({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={10} className="fill-surface stroke-heading" strokeWidth={2.2} />
      {label ? (
        <text y={3.6} textAnchor="middle" className="fill-heading text-[10px] font-bold">
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function ParkedCar({ x, y, rotate = 0, muted = false }: { x: number; y: number; rotate?: number; muted?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`} opacity={muted ? 0.55 : 1}>
      <rect x={-9} y={-5} width={18} height={10} rx={3.2} className="fill-heading/80" />
      <rect x={1.4} y={-3.8} width={4.2} height={7.6} rx={1.4} className="fill-surface" opacity={0.7} />
    </g>
  );
}

// Shared street layout for the 300×640 phone map.
// Road centre lines: x ∈ {33, 95, 157, 219, 281}, y ∈ {31, 87, 143, 199, 255, 311, 367, 423, 479, 535, 591}.
export const phoneMap = {
  width: 300,
  height: 640,
  base: {
    step: [62, 56],
    block: [52, 46],
    origin: [-24, -20],
    parks: ["3,5", "0,8", "4,1"],
    river:
      "M-10 112C60 96 110 150 175 128S270 84 310 96L310 120C270 112 240 158 175 162S60 126-10 140Z",
    avenues: ["M-10 600C80 540 170 480 310 380"],
  },
} as const;

type MapCarProps = {
  path: string;
  dur?: string;
  begin?: string;
  keyPoints?: string;
  keyTimes?: string;
  halo?: boolean;
};

export function MapCar({ path, dur = "10s", begin = "0s", keyPoints, keyTimes, halo = true }: MapCarProps) {
  return (
    <g>
      <animateMotion
        dur={dur}
        begin={begin}
        repeatCount="indefinite"
        rotate="auto"
        path={path}
        calcMode="linear"
        keyPoints={keyPoints}
        keyTimes={keyTimes}
      />
      {halo ? <circle r={15} className="fill-brand/20" /> : null}
      <rect x={-10} y={-5.6} width={20} height={11.2} rx={3.6} className="fill-heading" />
      <rect x={1.6} y={-4.2} width={4.8} height={8.4} rx={1.6} className="fill-brand" />
      <rect x={-7.6} y={-4} width={2.8} height={8} rx={1.1} className="fill-surface" opacity={0.55} />
    </g>
  );
}
