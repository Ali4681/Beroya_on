import type { AuthSession, Credentials } from "@/domain/entities/auth-session";
import type { User } from "@/domain/entities/user";
import type { AuthRepository } from "@/domain/ports/auth-repository";
import type { ApiClient } from "@/infrastructure/http/api-client";
import { endpoints } from "@/infrastructure/http/endpoints";
import { sessionSchema, userSchema } from "@/infrastructure/http/schemas";

export class HttpAuthRepository implements AuthRepository {
  constructor(private readonly http: ApiClient) {}

  login(credentials: Credentials): Promise<AuthSession> {
    return this.http.post(endpoints.auth.login, {
      auth: false,
      body: credentials,
      schema: sessionSchema,
    });
  }

  async logout() {
    await this.http.post(endpoints.auth.logout);
  }

  me(signal?: AbortSignal): Promise<User> {
    return this.http.get(endpoints.auth.me, {
      signal,
      schema: userSchema,
    });
  }
}
