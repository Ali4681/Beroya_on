import { publicTrackSchema, type PublicTrack, type TrackViewState } from "./types";

export function resolveApiAssetUrl(apiBase: string, url: string | null | undefined) {
  if (!url) {
    return null;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const origin = new URL(apiBase).origin;
  return url.startsWith("/") ? `${origin}${url}` : `${apiBase.replace(/\/$/, "")}/${url}`;
}

export function mapsHref(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

export async function fetchPublicTrack(
  apiBase: string,
  token: string,
  signal?: AbortSignal,
): Promise<TrackViewState> {
  const url = `${apiBase.replace(/\/$/, "")}/public/track/${encodeURIComponent(token)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch {
    return { kind: "loading" };
  }

  if (response.status === 410) {
    return { kind: "ended" };
  }
  if (response.status === 404 || !response.ok) {
    return { kind: "invalid" };
  }

  const payload: unknown = await response.json();
  const parsed = publicTrackSchema.safeParse(payload);
  if (!parsed.success) {
    return { kind: "invalid" };
  }

  return { kind: "live", data: normalizeTrack(apiBase, parsed.data) };
}

function normalizeTrack(apiBase: string, data: PublicTrack): PublicTrack {
  if (!data.driver) {
    return data;
  }
  return {
    ...data,
    driver: {
      ...data.driver,
      avatar_url: resolveApiAssetUrl(apiBase, data.driver.avatar_url),
    },
  };
}
