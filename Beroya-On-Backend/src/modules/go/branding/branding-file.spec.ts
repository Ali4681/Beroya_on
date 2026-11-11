import { decodeBrandingFile, sniff } from './branding-file';
import { isAppIconId, isAssetSlot } from './branding.constants';

describe('branding file sniff', () => {
  it('accepts PNG magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(sniff(png)).toBe('png');
  });

  it('accepts GIF header', () => {
    expect(sniff(Buffer.from('GIF89a....'))).toBe('gif');
  });

  it('rejects EXE MZ header', () => {
    expect(sniff(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it('accepts Lottie JSON', () => {
    const json = Buffer.from(JSON.stringify({ v: '5.7.4', fr: 30, layers: [] }));
    expect(sniff(json)).toBe('lottie');
  });

  it('rejects HTML disguised as json', () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect(sniff(html)).toBeNull();
  });

  it('rejects blocked extensions even with png payload', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(() => decodeBrandingFile(png.toString('base64'), 'payload.exe')).toThrow();
  });
});

describe('branding catalogs', () => {
  it('only allows bundled icon ids', () => {
    expect(isAppIconId('icon_03')).toBe(true);
    expect(isAppIconId('icon_20')).toBe(true);
    expect(isAppIconId('icon_21')).toBe(false);
  });

  it('only allows known asset slots', () => {
    expect(isAssetSlot('logo')).toBe(true);
    expect(isAssetSlot('login_top')).toBe(true);
    expect(isAssetSlot('home_top')).toBe(true);
    expect(isAssetSlot('account_top')).toBe(true);
    expect(isAssetSlot('../etc/passwd')).toBe(false);
  });
});
