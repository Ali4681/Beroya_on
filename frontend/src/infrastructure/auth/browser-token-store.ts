import type { TokenStore } from "@/domain/ports/token-store";

const ACCESS_TOKEN_KEY = "beroya-on.accessToken";

export const browserTokenStore: TokenStore = {
  getAccessToken() {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  saveAccessToken(token) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },
  clear() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  },
};
