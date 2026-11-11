/**
 * FCM `data` must be a flat string map. Keeps top-level scalars (ride_id, …)
 * and lifts common nested navigation ids (level_id, reward_id).
 */
export function flattenPushData(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') return {};
  const obj = payload as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || typeof value === 'object') continue;
    out[key] = String(value);
  }
  const level = obj.level;
  if (level && typeof level === 'object' && level !== null && 'id' in level) {
    const id = (level as { id: unknown }).id;
    if (id != null) out.level_id = String(id);
  }
  const reward = obj.active_reward;
  if (reward && typeof reward === 'object' && reward !== null && 'id' in reward) {
    const id = (reward as { id: unknown }).id;
    if (id != null) out.reward_id = String(id);
  }
  return out;
}
