export function assertNoDuplicateZipEntries(data: ArrayBuffer | Uint8Array): void {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralDirectory = findCentralDirectoryRange(bytes, view);
  if (!centralDirectory) {
    throw new Error("ZIP central directory could not be parsed.");
  }

  const seen = new Set<string>();
  let offset = centralDirectory.start;
  for (; offset <= centralDirectory.end - 46;) {
    if (readUInt32LE(view, offset) !== 0x02014b50) {
      throw new Error("ZIP central directory contains an invalid entry.");
    }
    const nameLength = readUInt16LE(view, offset + 28);
    const extraLength = readUInt16LE(view, offset + 30);
    const commentLength = readUInt16LE(view, offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const recordEnd = nameEnd + extraLength + commentLength;
    if (nameEnd > centralDirectory.end || recordEnd > centralDirectory.end) {
      throw new Error("ZIP central directory entry is truncated.");
    }
    const name = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(nameStart, nameEnd));
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

function findCentralDirectoryRange(bytes: Uint8Array, view: DataView): { start: number; end: number } | null {
  const minEocdLength = 22;
  const maxCommentLength = 0xffff;
  const searchStart = Math.max(0, bytes.length - minEocdLength - maxCommentLength);
  for (let offset = bytes.length - minEocdLength; offset >= searchStart; offset -= 1) {
    if (readUInt32LE(view, offset) !== 0x06054b50) continue;
    const commentLength = readUInt16LE(view, offset + 20);
    if (offset + minEocdLength + commentLength !== bytes.length) continue;
    const size = readUInt32LE(view, offset + 12);
    const start = readUInt32LE(view, offset + 16);
    const end = start + size;
    if (start > bytes.length || end > offset || end < start) return null;
    return { start, end };
  }
  return null;
}

function readUInt16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUInt32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}
