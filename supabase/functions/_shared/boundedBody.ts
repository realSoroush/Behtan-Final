/** Bound memory while reading chunked requests; Content-Length is only a hint. */
export class PayloadTooLargeError extends Error {}
export async function readBoundedText(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await req.body?.cancel();
    throw new PayloadTooLargeError('Payload too large');
  }
  const reader = req.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  const text: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError('Payload too large');
      }
      text.push(decoder.decode(part.value, { stream: true }));
    }
    text.push(decoder.decode());
    return text.join('');
  } finally {
    reader.releaseLock();
  }
}
