/**
 * pdf.js transfers the backing ArrayBuffer to its worker. A view on the caller's
 * buffer is detached after the first open, so a scan that opens twice needs a copy.
 */
export function copyArrayBuffer(bytes: ArrayBuffer): Uint8Array {
  return new Uint8Array(bytes).slice();
}
