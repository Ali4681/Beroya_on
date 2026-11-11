export const queryKeys = {
  health: {
    status: ["health", "status"] as const,
  },
  auth: {
    me: ["auth", "me"] as const,
  },
} as const;
