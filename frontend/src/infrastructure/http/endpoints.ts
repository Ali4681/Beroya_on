import { publicEnv } from "@/core/config/public-env";

function withPrefix(path: string) {
  const prefix = publicEnv.apiPrefix.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return prefix ? `${prefix}${suffix}` : suffix;
}

export const endpoints = {
  health: withPrefix("/health"),
  auth: {
    login: withPrefix("/auth/login"),
    logout: withPrefix("/auth/logout"),
    me: withPrefix("/auth/me"),
  },
} as const;
