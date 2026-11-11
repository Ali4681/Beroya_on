import type { AuthSession, Credentials } from "@/domain/entities/auth-session";
import type { User } from "@/domain/entities/user";

export interface AuthRepository {
  login(credentials: Credentials): Promise<AuthSession>;
  logout(): Promise<void>;
  me(signal?: AbortSignal): Promise<User>;
}
