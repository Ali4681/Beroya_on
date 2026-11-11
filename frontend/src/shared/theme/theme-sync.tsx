"use client";

import { useLayoutEffect } from "react";

import { isTheme, THEME_STORAGE_KEY } from "./theme";

// React's dev remount resets <html> to the attributes it manages, dropping the
// ones set by the inline head script. Re-apply them before paint.
export function ThemeSync() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("js");

    if (root.hasAttribute("data-theme")) {
      return;
    }

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {}

    root.setAttribute(
      "data-theme",
      isTheme(saved) ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    );
  }, []);

  return null;
}
