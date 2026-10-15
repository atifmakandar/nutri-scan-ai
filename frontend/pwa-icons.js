import { deflateSync } from 'node:zlib';

// Small deterministic PNG encoder using only Node's standard library. The mark
// stays in the central safe area, so the same artwork works as a maskable icon.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

export function iconPng(size) {
  const pixels = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const n = v > 0.33 && v < 0.68 && (
        (u > 0.31 && u < 0.38) || (u > 0.62 && u < 0.69)
        || (u > 0.37 && u < 0.63 && Math.abs(v - (u + 0.005)) < 0.055)
      );
      const leaf = ((u - 0.57) / 0.14) ** 2 + ((v - 0.245) / 0.055) ** 2 < 1;
      const color = n ? [255, 255, 255] : leaf ? [191, 227, 154] : [13, 81, 61];
      const offset = y * (1 + size * 3) + 1 + x * 3;
      pixels.set(color, offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2; // RGB, opaque background.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
