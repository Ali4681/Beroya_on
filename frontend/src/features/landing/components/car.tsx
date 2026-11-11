import { useId } from "react";

import { cx } from "@/shared/lib/cx";

export type CarKind = "sedan" | "suv" | "van" | "limo";

type CarShape = {
  body: string;
  windows: string[];
  wheels: [number, number];
  radius: number;
  seams: string[];
  driver: [number, number];
};

const shapes: Record<CarKind, CarShape> = {
  sedan: {
    body: "M22 72C16 72 13 68 13 62L13 55C13 50 16 47 22 46L62 42C72 36 84 26 96 22C104 20 138 19 148 21C158 23 172 34 184 42L214 46C224 47 229 53 229 60L229 64C229 69 226 72 221 72L202 72A20 20 0 0 0 162 72L80 72A20 20 0 0 0 40 72Z",
    windows: [
      "M70 43C79 36 88 29 98 26C104 24.6 114 24 120 24L120 43Z",
      "M126 43L126 24C134 24 142 24.4 147 25.6C156 28 166 35 175 43Z",
    ],
    wheels: [60, 182],
    radius: 16,
    seams: ["M123 46V69", "M168 47C170 55 170 63 168 69"],
    driver: [146, 34],
  },
  suv: {
    body: "M22 72C15 72 12 68 12 62L12 46C12 41 14 38 18 36L30 25C36 20 42 18 52 18L150 18C160 18 166 21 172 26L190 42L216 46C225 48 230 54 230 61L230 64C230 69 227 72 222 72L203 72A21 21 0 0 0 161 72L83 72A21 21 0 0 0 41 72Z",
    windows: [
      "M24 41L33 29C37 25.5 42 24 50 24L86 24L86 41Z",
      "M92 41L92 24L130 24L130 41Z",
      "M136 41L136 24L148 24C155 24 160 26 165 30L178 41Z",
    ],
    wheels: [62, 182],
    radius: 17,
    seams: ["M89 44V69", "M133 44V69"],
    driver: [152, 32],
  },
  van: {
    body: "M22 72C15 72 12 68 12 62L12 30C12 21 18 15 28 15L148 15C158 15 165 18 172 24L196 44L218 48C226 49.5 230 55 230 62L230 64C230 69 227 72 222 72L204 72A20 20 0 0 0 164 72L80 72A20 20 0 0 0 40 72Z",
    windows: [
      "M20 41L20 28C20 24 23 21 28 21L66 21L66 41Z",
      "M72 41L72 21L118 21L118 41Z",
      "M124 41L124 21L146 21C153 21 158 23 163 27.5L179 41Z",
    ],
    wheels: [60, 184],
    radius: 16,
    seams: ["M69 44V69", "M121 44V69"],
    driver: [146, 31],
  },
  limo: {
    body: "M20 72C13 72 10 68 10 62L10 56C10 51 13 48.5 19 48L64 44C74 37 86 29 100 26C108 24.5 146 24 156 25.5C166 27 178 36 190 44L222 48C230 49 234 55 234 61L234 64C234 69 231 72 226 72L210 72A20 20 0 0 0 170 72L76 72A20 20 0 0 0 36 72Z",
    windows: [
      "M72 45C81 38 92 31.5 102 29.5C108 28.4 116 28 122 28L122 45Z",
      "M128 45L128 28C138 28 148 28.3 154 29.4C163 31 172 37 181 45Z",
    ],
    wheels: [56, 190],
    radius: 16,
    seams: ["M125 48V69"],
    driver: [152, 37],
  },
};

type CarSideProps = {
  kind?: CarKind;
  paint?: string;
  className?: string;
  driver?: boolean;
  pinstripe?: boolean;
  shadow?: boolean;
};

export function CarSide({
  kind = "sedan",
  paint = "#c3cad5",
  className,
  driver = false,
  pinstripe = false,
  shadow = true,
}: CarSideProps) {
  const id = useId();
  const shape = shapes[kind];
  const ids = { shine: `${id}-shine`, glass: `${id}-glass`, floor: `${id}-floor` };
  const front = kind === "limo" ? 222 : kind === "van" ? 218 : 214;

  return (
    <svg viewBox="0 0 240 100" className={cx("overflow-visible", className)} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={ids.shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={ids.glass} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b3747" />
          <stop offset="0.55" stopColor="#121821" />
          <stop offset="1" stopColor="#3a4a5e" />
        </linearGradient>
        <radialGradient id={ids.floor} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#0d1017" stopOpacity="0.32" />
          <stop offset="1" stopColor="#0d1017" stopOpacity="0" />
        </radialGradient>
      </defs>

      {shadow ? <ellipse cx="121" cy="88" rx="112" ry="8" fill={`url(#${ids.floor})`} /> : null}

      <g className="car-drive">
        <path d={shape.body} fill={paint} />
        <path d={shape.body} fill={`url(#${ids.shine})`} />
        <path d={shape.body} fill="none" stroke="#0d1017" strokeOpacity="0.14" strokeWidth="1" />

        {shape.windows.map((d) => (
          <path key={d} d={d} fill={`url(#${ids.glass})`} />
        ))}
        <path
          d={shape.windows[0]}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.16"
          strokeWidth="1"
        />

        {driver ? (
          <g fill="#0b0e14" opacity="0.85">
            <circle cx={shape.driver[0]} cy={shape.driver[1]} r="4.2" />
            <path
              d={`M${shape.driver[0] - 8} ${shape.driver[1] + 12}c0-5 3.6-7.4 8-7.4s8 2.4 8 7.4Z`}
            />
          </g>
        ) : null}

        {shape.seams.map((d) => (
          <path key={d} d={d} fill="none" stroke="#0d1017" strokeOpacity="0.16" strokeWidth="1" />
        ))}

        {pinstripe ? (
          <path d={`M18 53H${front + 6}`} stroke="#22e0ee" strokeOpacity="0.75" strokeWidth="1.3" />
        ) : null}

        <path
          d={`M${front} 49.5L${front + 12} 51.5C${front + 13} 53.5 ${front + 12} 55.5 ${front + 10} 55.5L${front - 1} 54.5Z`}
          fill="#fff6d8"
        />
        <rect x={kind === "limo" ? 10 : 13} y="51" width="7" height="5" rx="2" fill="#ea5455" />

        {shape.wheels.map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="72" r={shape.radius} fill="#151820" />
            <g className="wheel-spin">
              <circle cx={cx} cy="72" r={shape.radius * 0.62} fill="#cdd3dc" />
              {[0, 72, 144, 216, 288].map((angle) => (
                <path
                  key={angle}
                  d={`M${cx} 72L${cx} ${72 - shape.radius * 0.56}`}
                  stroke="#8b94a3"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  transform={`rotate(${angle} ${cx} 72)`}
                />
              ))}
              <circle cx={cx} cy="72" r="3.2" fill="#6f7786" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}
