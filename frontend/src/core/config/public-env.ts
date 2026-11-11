import { z } from "zod";

const publicEnvSchema = z.object({
  appName: z.string().min(1),
  siteUrl: z.url(),
  apiUrl: z.string().min(1),
  apiPrefix: z.string(),
  /** Absolute Go API base for browser CORS calls (public track). */
  goApiUrl: z.string().min(1),
});

export const publicEnv = publicEnvSchema.parse({
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Beroya On",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "/api/proxy",
  apiPrefix: process.env.NEXT_PUBLIC_API_PREFIX || "",
  goApiUrl:
    process.env.NEXT_PUBLIC_GO_API_URL || "http://localhost:8000/api/v1/go",
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
