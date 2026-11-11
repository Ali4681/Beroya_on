import type { AuthSession, Credentials } from "@/domain/entities/auth-session";
import type { AuthRepository } from "@/domain/ports/auth-repository";
import type { TokenStore } from "@/domain/ports/token-store";

export async function login(
  auth: AuthRepository,
  tokens: TokenStore,
  credentials: Credentials,
): Promise<AuthSession> {
  const session = await auth.login(credentials);
  tokens.saveAccessToken(session.accessToken);
  return session;
}
