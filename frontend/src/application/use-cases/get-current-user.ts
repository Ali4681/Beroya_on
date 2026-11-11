import type { AuthRepository } from "@/domain/ports/auth-repository";

export function getCurrentUser(auth: AuthRepository, signal?: AbortSignal) {
  return auth.me(signal);
}
