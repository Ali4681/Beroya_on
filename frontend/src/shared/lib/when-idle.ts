/** Runs the callback once the browser is idle (or after a short wait where it cannot tell). Returns a cancel function. */
export function whenIdle(callback: () => void) {
  if ("requestIdleCallback" in window) {
    const id = requestIdleCallback(callback, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 300);
  return () => clearTimeout(id);
}
