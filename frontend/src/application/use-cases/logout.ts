import type { AuthRepository } from "@/domain/ports/auth-repository";
import type { TokenStore } from "@/domain/ports/token-store";

export async function logout(auth: AuthRepository, tokens: TokenStore) {
  try {
    await auth.logout();
  } finally {
    tokens.clear();
  }
}
