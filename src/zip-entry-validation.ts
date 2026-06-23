export function assertNoDuplicateZipEntries(data: ArrayBuffer | Uint8Array): void {
  const buffer = data instanceof Uint8Array
    ? Buffer.from(data)
    : Buffer.from(new Uint8Array(data));
  const centralDirectory = findCentralDirectoryRange(buffer);
  if (!centralDirectory) {
    throw new Error("ZIP central directory could not be parsed.");
  }

  const seen = new Set<string>();
  let offset = centralDirectory.start;
  for (; offset <= centralDirectory.end - 46;) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("ZIP central directory contains an invalid entry.");
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const recordEnd = nameEnd + extraLength + commentLength;
    if (nameEnd > centralDirectory.end || recordEnd > centralDirectory.end) {
      throw new Error("ZIP central directory entry is truncated.");
    }
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    if (seen.has(name)) {
      throw new Error(`ZIP archive contains duplicate entry: ${name}`);
    }
    seen.add(name);
    offset = recordEnd;
  }
  if (offset !== centralDirectory.end) {
    throw new Error("ZIP central directory did not parse completely.");
  }
}

function findCentralDirectoryRange(buffer: Buffer): { start: number; end: number } | null {
  const minEocdLength = 22;
  const maxCommentLength = 0xffff;
  const searchStart = Math.max(0, buffer.length - minEocdLength - maxCommentLength);
  for (let offset = buffer.length - minEocdLength; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + minEocdLength + commentLength !== buffer.length) continue;
    const size = buffer.readUInt32LE(offset + 12);
    const start = buffer.readUInt32LE(offset + 16);
    const end = start + size;
    if (start > buffer.length || end > offset || end < start) return null;
    return { start, end };
  }
  return null;
}
