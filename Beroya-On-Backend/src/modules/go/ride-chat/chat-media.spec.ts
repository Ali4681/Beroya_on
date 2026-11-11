import { CHAT_MEDIA_FILE, decodeDataUrl, mp4DurationSec, sniffChatMedia } from './chat-media';

function box(type: string, ...parts: Buffer[]) {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

const ftyp = (major: string, ...compatible: string[]) =>
  box('ftyp', Buffer.from(major + '\0\0\0\0' + compatible.join(''), 'latin1'));

function mvhd(version: 0 | 1, timescale: number, duration: number) {
  const body = Buffer.alloc(version === 1 ? 112 : 100);
  body[0] = version;
  if (version === 1) {
    body.writeUInt32BE(timescale, 20);
    body.writeBigUInt64BE(BigInt(duration), 24);
  } else {
    body.writeUInt32BE(timescale, 12);
    body.writeUInt32BE(duration, 16);
  }
  return box('mvhd', body);
}

describe('chat media', () => {
  it('tells HEIC images from m4a audio by the ftyp brands', () => {
    const heic = ftyp('heic', 'mif1', 'heic');
    const audio = ftyp('M4A ', 'M4A ', 'mp42', 'isom');
    expect(sniffChatMedia(heic, 'IMAGE')).toEqual({ ext: 'heic', mime: 'image/heic' });
    expect(sniffChatMedia(heic, 'VOICE')).toBeNull();
    expect(sniffChatMedia(audio, 'VOICE')).toEqual({ ext: 'm4a', mime: 'audio/mp4' });
    expect(sniffChatMedia(audio, 'IMAGE')).toBeNull();
    expect(sniffChatMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'VOICE')).toBeNull();
  });

  it('reads the duration from mvhd v0 and v1, even when moov comes after mdat', () => {
    const head = ftyp('isom', 'isom', 'mp42');
    const mdat = box('mdat', Buffer.alloc(32));
    expect(mp4DurationSec(Buffer.concat([head, mdat, box('moov', mvhd(0, 44100, 44100 * 7))]))).toBe(7);
    expect(mp4DurationSec(Buffer.concat([head, box('moov', mvhd(1, 1000, 61500)), mdat]))).toBe(61.5);
    expect(mp4DurationSec(Buffer.concat([head, mdat]))).toBeNull();
    expect(mp4DurationSec(Buffer.concat([head, box('moov', mvhd(0, 1000, 0))]))).toBeNull();
  });

  it('only accepts base64 payloads and stored-file names', () => {
    expect(decodeDataUrl('data:audio/mp4;codecs=mp4a;base64,AAEC')).toEqual(Buffer.from([0, 1, 2]));
    expect(decodeDataUrl('not base64 at all!').length).toBe(0);
    expect(CHAT_MEDIA_FILE.test('5b1f0c2e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.m4a')).toBe(true);
    expect(CHAT_MEDIA_FILE.test('../../.env')).toBe(false);
    expect(CHAT_MEDIA_FILE.test('5b1f0c2e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.exe')).toBe(false);
  });
});
