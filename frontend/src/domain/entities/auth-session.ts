import type { User } from "@/domain/entities/user";

export type Credentials = {
  email: string;
  password: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: User;
};
