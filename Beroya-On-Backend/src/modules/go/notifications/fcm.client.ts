import { createSign } from 'crypto';

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface FcmMessage {
  /**
   * Opaque device target from `goPushToken.token`:
   * - Driver (messaging 17+): Firebase Installation ID (FID)
   * - Customer (messaging 15): legacy FCM registration token
   */
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export type FcmTargetKind = 'fid' | 'token';

export type ResolvedFcmTarget = {
  kind: FcmTargetKind;
  value: string;
  /** True when length/shape did not clearly match FID vs registration token. */
  ambiguous?: boolean;
};

/**
 * Pick FCM HTTP v1 target field from the stored device value.
 * FID ≈ short, no `:`. Registration token ≈ long and/or contains `:`.
 */
export function resolveFcmTarget(raw: string): ResolvedFcmTarget {
  const value = raw.trim();
  if (!value) return { kind: 'token', value, ambiguous: true };

  const hasColon = value.includes(':');
  const long = value.length > 100;
  // Typical Installation ID is ~22 chars base64url without ':'.
  if (!hasColon && value.length <= 40) {
    return { kind: 'fid', value };
  }
  if (hasColon || long) {
    return { kind: 'token', value };
  }
  // Mid-length, no colon — guess by size, mark ambiguous for callers to WARN.
  return { kind: value.length <= 64 ? 'fid' : 'token', value, ambiguous: true };
}

/** HTTP v1 `message` object: exactly one of `fid` | `token`. */
export function fcmHttpMessage(
  target: ResolvedFcmTarget,
  message: Pick<FcmMessage, 'title' | 'body' | 'data'>,
) {
  const destination =
    target.kind === 'fid' ? { fid: target.value } : { token: target.value };
  return {
    ...destination,
    notification: { title: message.title, body: message.body },
    data: message.data,
  };
}

/** Drop stored rows that can never succeed again for this device target. */
export function isDeadFcmTargetError(error: string): boolean {
  if (error.includes('NOT_FOUND') || error.includes('UNREGISTERED')) return true;
  if (!error.includes('INVALID_ARGUMENT')) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes('registration token') ||
    lower.includes('not a valid fcm') ||
    lower.includes('message.token') ||
    lower.includes('message.fid') ||
    lower.includes('invalid registration') ||
    (lower.includes('fid') && lower.includes('invalid'))
  );
}

/** FCM HTTP v1. Returns null when credentials are missing so callers can skip. */
export async function sendFcm(
  creds: FcmCredentials | null,
  message: FcmMessage,
  fetchImpl = globalThis.fetch.bind(globalThis),
): Promise<{ ok: true; target: FcmTargetKind } | { ok: false; error: string; target?: FcmTargetKind }> {
  if (!creds) return { ok: false, error: 'FCM credentials are not configured' };
  const target = resolveFcmTarget(message.token);
  const access = await googleAccessToken(creds, fetchImpl);
  const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: fcmHttpMessage(target, message),
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text.slice(0, 500), target: target.kind };
  }
  return { ok: true, target: target.kind };
}

async function googleAccessToken(creds: FcmCredentials, fetchImpl: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: creds.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const assertion = `${header}.${payload}.${base64url(signer.sign(creds.privateKey))}`;
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM auth failed: ${(await response.text()).slice(0, 300)}`);
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('FCM auth returned no access token');
  return json.access_token;
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}
