"use client";

import { Shell } from "@/features/desk/shell";
import type { ReactNode } from "react";

export default function ErpLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
