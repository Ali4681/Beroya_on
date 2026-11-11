export interface TokenStore {
  getAccessToken(): string | null;
  saveAccessToken(token: string): void;
  clear(): void;
}
