export const THEME_STORAGE_KEY = "beroya-theme";

export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

// Runs synchronously in <head> before first paint so the saved (or system)
// theme is applied without a flash.
export const themeInitScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.setAttribute("data-theme",t)}catch(e){d.setAttribute("data-theme","light")}d.classList.add("js")})()`;
