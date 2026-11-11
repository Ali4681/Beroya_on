import { fcmHttpMessage, isDeadFcmTargetError, resolveFcmTarget } from './fcm.client';

describe('resolveFcmTarget', () => {
  it('maps short FID-like values to message.fid (Driver messaging 17)', () => {
    const fid = 'cKxY1AbCdEfGhIjKlMnOpQ';
    expect(fid.length).toBeLessThanOrEqual(40);
    expect(fid.includes(':')).toBe(false);
    expect(resolveFcmTarget(fid)).toEqual({ kind: 'fid', value: fid });
  });

  it('maps long registration tokens with colon to message.token (Customer messaging 15)', () => {
    const token =
      'dGVzdC1kZXZpY2U:APA91bFakeRegistrationTokenValueThatIsVeryLongAndLooksLikeLegacyFcm_' +
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_more_padding_to_exceed_one_hundred_chars';
    expect(token.includes(':')).toBe(true);
    expect(token.length).toBeGreaterThan(100);
    expect(resolveFcmTarget(token)).toEqual({ kind: 'token', value: token });
  });

  it('maps long tokens without colon to message.token', () => {
    const token = 'a'.repeat(140);
    expect(resolveFcmTarget(token)).toEqual({ kind: 'token', value: token });
  });

  it('trims whitespace before classifying', () => {
    expect(resolveFcmTarget('  shortFidValueHere123  ')).toEqual({
      kind: 'fid',
      value: 'shortFidValueHere123',
    });
  });

  it('marks mid-length no-colon values as ambiguous', () => {
    const mid = 'x'.repeat(50);
    const resolved = resolveFcmTarget(mid);
    expect(resolved.ambiguous).toBe(true);
    expect(resolved.kind).toBe('fid');
  });
});

describe('fcmHttpMessage', () => {
  const copy = { title: 'مرحبا', body: 'نص', data: { event: 'broadcast' } };

  it('sets fid only for Driver FID targets', () => {
    const body = fcmHttpMessage({ kind: 'fid', value: 'cKxY1AbCdEfGhIjKlMnOpQ' }, copy);
    expect(body).toEqual({
      fid: 'cKxY1AbCdEfGhIjKlMnOpQ',
      notification: { title: 'مرحبا', body: 'نص' },
      data: { event: 'broadcast' },
    });
    expect(body).not.toHaveProperty('token');
  });

  it('sets token only for Customer registration tokens', () => {
    const token = `device:APA91b${'x'.repeat(120)}`;
    const body = fcmHttpMessage({ kind: 'token', value: token }, copy);
    expect(body).toEqual({
      token,
      notification: { title: 'مرحبا', body: 'نص' },
      data: { event: 'broadcast' },
    });
    expect(body).not.toHaveProperty('fid');
  });
});

describe('isDeadFcmTargetError', () => {
  it('drops NOT_FOUND and UNREGISTERED', () => {
    expect(isDeadFcmTargetError('{"error":{"status":"NOT_FOUND"}}')).toBe(true);
    expect(isDeadFcmTargetError('UNREGISTERED')).toBe(true);
  });

  it('drops INVALID_ARGUMENT for bad registration token / fid', () => {
    expect(
      isDeadFcmTargetError(
        '400 INVALID_ARGUMENT The registration token is not a valid FCM registration token',
      ),
    ).toBe(true);
    expect(isDeadFcmTargetError('INVALID_ARGUMENT: Invalid value at message.token')).toBe(true);
    expect(isDeadFcmTargetError('INVALID_ARGUMENT: Invalid value at message.fid')).toBe(true);
  });

  it('keeps unrelated INVALID_ARGUMENT (e.g. payload)', () => {
    expect(isDeadFcmTargetError('INVALID_ARGUMENT: Invalid data key')).toBe(false);
  });
});
