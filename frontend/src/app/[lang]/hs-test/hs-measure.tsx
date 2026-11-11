"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  overflowX: string;
  touchAction: string;
  overscrollBehaviorX: string;
  position: string;
  zIndex: string;
};

function snap(el: Element | null): Snapshot | null {
  if (!el) {
    return null;
  }
  const cs = getComputedStyle(el);
  return {
    overflowX: cs.overflowX,
    touchAction: cs.touchAction,
    overscrollBehaviorX: cs.overscrollBehaviorX,
    position: cs.position,
    zIndex: cs.zIndex,
  };
}

function RuleDump() {
  const [rules, setRules] = useState<string[]>([]);

  useEffect(() => {
    const found: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;
      try {
        cssRules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(cssRules)) {
        collect(rule, found);
      }
    }
    setRules(found);
  }, []);

  return (
    <pre className="mt-3 overflow-x-auto rounded-xl bg-heading/5 p-4 text-[12px] leading-5 text-heading">
      {rules.length === 0 ? "loading…" : rules.join("\n\n")}
    </pre>
  );
}

function collect(rule: CSSRule, out: string[]) {
  if (rule instanceof CSSStyleRule) {
    if (/\.h-scroll\b/.test(rule.selectorText)) {
      out.push(`${rule.selectorText} {\n${indent(rule.style.cssText)}\n}`);
    }
  } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
    const nested: string[] = [];
    for (const child of Array.from(rule.cssRules)) {
      collect(child, nested);
    }
    if (nested.length) {
      const header = rule instanceof CSSMediaRule ? `@media ${rule.conditionText}` : `@supports ${rule.conditionText}`;
      out.push(`${header} {\n${nested.map((block) => indent(block)).join("\n\n")}\n}`);
    }
  } else if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) {
    for (const child of Array.from((rule as CSSGroupingRule).cssRules)) {
      collect(child, out);
    }
  }
}

function indent(text: string) {
  return text
    .split(/;\s*/)
    .filter(Boolean)
    .map((line) => `  ${line.trim()};`)
    .join("\n");
}

export function HsMeasure() {
  const [a, setA] = useState<Snapshot | null>(null);
  const [b, setB] = useState<Snapshot | null>(null);

  useEffect(() => {
    setA(snap(document.getElementById("hs-a")));
    setB(snap(document.getElementById("hs-b")));
  }, []);

  return (
    <section className="shell mt-16 border-t border-line pt-10 pb-24">
      <h2 className="text-lg font-semibold text-heading">computed styles</h2>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-heading/5 p-4 text-[12px] leading-5 text-heading">
        {JSON.stringify({ a, b }, null, 2)}
      </pre>
      <h2 className="mt-10 text-lg font-semibold text-heading">CSSOM rules matching .h-scroll</h2>
      <RuleDump />
      <h2 className="mt-10 text-lg font-semibold text-heading">globals.css source (@utility h-scroll)</h2>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-heading/5 p-4 text-[12px] leading-5 text-heading">{`@utility h-scroll {
  position: relative;
  z-index: 1;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y;
  scrollbar-width: none;

  @media (hover: hover) and (pointer: fine) {
    cursor: grab;
    &:active { cursor: grabbing; }
  }

  &::-webkit-scrollbar { display: none; }
}`}</pre>
    </section>
  );
}
