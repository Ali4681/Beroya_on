export type HealthStatus = {
  status: "ok" | "degraded" | "unknown";
  service?: string;
  checkedAt: string;
};
