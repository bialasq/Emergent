/** zlib CRC-32 (IEEE), matches Python zlib.crc32 for UTF-8 room codes. */
export function zlibCrc32(str) {
  let crc = -1 >>> 0;
  for (let i = 0; i < str.length; i++) {
    crc = (crc ^ str.charCodeAt(i)) >>> 0;
    for (let k = 0; k < 8; k++) {
      crc = ((crc >>> 1) ^ (0xedb88320 & (-(crc & 1) >>> 0))) >>> 0;
    }
  }
  return (crc ^ -1) >>> 0;
}
