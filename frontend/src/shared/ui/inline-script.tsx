"use client";

// Executes during HTML parsing on hard loads; on the client the type switches to
// text/plain so React never creates a live <script> (and never warns about it).
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
