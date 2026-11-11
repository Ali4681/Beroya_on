import type { CSSProperties } from "react";

export function cssVars(vars: Record<`--${string}`, string | number>) {
  return vars as CSSProperties;
}

export function delay(ms: number) {
  return cssVars({ "--delay": `${ms}ms` });
}
