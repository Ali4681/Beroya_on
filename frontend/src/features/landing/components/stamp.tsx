import type { IconNode } from "lucide";
import { createElement, useId, type CSSProperties } from "react";

import { cx } from "@/shared/lib/cx";

export type StampShape = "circle" | "rect" | "hex" | "burst" | "oval";
export type StampTone = "teal" | "cyan" | "red" | "orange" | "green" | "ink";

type StampProps = {
  shape: StampShape;
  tone: StampTone;
  label: string;
  icon?: IconNode;
  glyph?: string;
  top?: string;
  bottom?: string;
  seed?: number;
  texture?: boolean;
  className?: string;
  style?: CSSProperties;
};

const boxes: Record<StampShape, [number, number]> = {
  circle: [140, 140],
  burst: [140, 140],
  hex: [140, 140],
  rect: [168, 116],
  oval: [176, 124],
};

function polygon(midX: number, midY: number, radius: number, points: number) {
  return Array.from({ length: points }, (_, index) => {
    const angle = ((-90 + (360 / points) * index) * Math.PI) / 180;
    return `${(midX + radius * Math.cos(angle)).toFixed(2)},${(midY + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

function burst(midX: number, midY: number, outer: number, inner: number, spikes: number) {
  return Array.from({ length: spikes * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = ((-90 + (180 / spikes) * index) * Math.PI) / 180;
    return `${(midX + radius * Math.cos(angle)).toFixed(2)},${(midY + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

function Emblem({ icon, glyph, x, y, size }: { icon?: IconNode; glyph?: string; x: number; y: number; size: number }) {
  if (glyph) {
    return (
      <text x={x} y={y + size * 0.36} textAnchor="middle" fill="currentColor" stroke="none" fontSize={size * 1.05} fontWeight={700}>
        {glyph}
      </text>
    );
  }

  if (!icon) {
    return null;
  }

  return (
    <svg
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  );
}

export function Stamp({
  shape,
  tone,
  label,
  icon,
  glyph,
  top = "BEROYA · PASSPORT",
  bottom = "★  ★  ★",
  seed = 3,
  texture = true,
  className,
  style,
}: StampProps) {
  const id = useId();
  const [width, height] = boxes[shape];
  const ids = { filter: `${id}-ink`, top: `${id}-top`, bottom: `${id}-bottom` };
  const round = shape === "circle" || shape === "burst";
  const midX = width / 2;
  const midY = height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cx("block mix-blend-multiply dark:mix-blend-normal", className)}
      style={{ color: `var(--stamp-${tone})`, ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {texture ? (
          <filter id={ids.filter} x="-4%" y="-4%" width="108%" height="108%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed={seed} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 2.55" result="speckle" />
            <feComposite in="rough" in2="speckle" operator="in" />
          </filter>
        ) : null}
        {round ? (
          <>
            <path id={ids.top} d={`M${midX - 53.5} ${midY}A53.5 53.5 0 0 1 ${midX + 53.5} ${midY}`} />
            <path id={ids.bottom} d={`M${midX - 59.5} ${midY}A59.5 59.5 0 0 0 ${midX + 59.5} ${midY}`} />
          </>
        ) : null}
      </defs>

      <g filter={texture ? `url(#${ids.filter})` : undefined} fill="none" stroke="currentColor">
        {shape === "circle" ? (
          <>
            <circle cx={midX} cy={midY} r={64} strokeWidth={2.8} />
            <circle cx={midX} cy={midY} r={49} strokeWidth={1.2} />
          </>
        ) : null}
        {shape === "burst" ? (
          <>
            <polygon points={burst(midX, midY, 67, 61.5, 22)} strokeWidth={2.2} strokeLinejoin="round" />
            <circle cx={midX} cy={midY} r={49} strokeWidth={1.2} />
          </>
        ) : null}
        {shape === "hex" ? (
          <>
            <polygon points={polygon(midX, midY, 66, 6)} strokeWidth={2.8} strokeLinejoin="round" />
            <polygon points={polygon(midX, midY, 57, 6)} strokeWidth={1.1} strokeLinejoin="round" />
          </>
        ) : null}
        {shape === "rect" ? (
          <>
            <rect x={4} y={4} width={width - 8} height={height - 8} rx={14} strokeWidth={2.8} />
            <rect x={12} y={12} width={width - 24} height={height - 24} rx={8} strokeWidth={1.1} strokeDasharray="3 3" />
          </>
        ) : null}
        {shape === "oval" ? (
          <>
            <ellipse cx={midX} cy={midY} rx={midX - 4} ry={midY - 4} strokeWidth={2.8} />
            <ellipse cx={midX} cy={midY} rx={midX - 13} ry={midY - 13} strokeWidth={1.1} />
          </>
        ) : null}

        <g stroke="none" fill="currentColor">
          {round ? (
            <>
              <text fontSize={8.6} fontWeight={600} letterSpacing={2.2}>
                <textPath href={`#${ids.top}`} startOffset="50%" textAnchor="middle">
                  {top}
                </textPath>
              </text>
              <text fontSize={8} fontWeight={600} letterSpacing={2}>
                <textPath href={`#${ids.bottom}`} startOffset="50%" textAnchor="middle">
                  {bottom}
                </textPath>
              </text>
              <circle cx={midX - 56.5} cy={midY} r={1.8} />
              <circle cx={midX + 56.5} cy={midY} r={1.8} />
            </>
          ) : (
            <>
              <text x={midX} y={shape === "hex" ? 38 : 30} textAnchor="middle" fontSize={7.4} fontWeight={600} letterSpacing={2}>
                {top}
              </text>
              <text
                x={midX}
                y={height - (shape === "hex" ? 30 : 22)}
                textAnchor="middle"
                fontSize={7}
                fontWeight={600}
                letterSpacing={2}
              >
                {bottom}
              </text>
            </>
          )}

          <text
            x={midX}
            y={midY + (round ? 27 : shape === "hex" ? 25 : 22)}
            textAnchor="middle"
            fontSize={round ? 13 : 12.5}
            fontWeight={700}
          >
            {label}
          </text>
        </g>

        <Emblem icon={icon} glyph={glyph} x={midX} y={midY - (round ? 9 : shape === "hex" ? 8 : 7)} size={round ? 26 : 22} />
      </g>
    </svg>
  );
}
