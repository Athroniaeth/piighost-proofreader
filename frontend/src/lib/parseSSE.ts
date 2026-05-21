export interface SSEEvent {
  name: string;
  data: unknown;
}

/**
 * Consume a fetch ReadableStream of SSE bytes and yield one parsed event
 * per `\n\n`-separated chunk. Tolerates events split across multiple
 * reads (buffered until a separator is seen) and flushes a final
 * unterminated event when the stream closes.
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>
): AsyncIterable<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      const trimmed = buffer.trim();
      if (trimmed.length > 0) {
        const ev = parseChunk(trimmed);
        if (ev) yield ev;
      }
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const ev = parseChunk(chunk);
      if (ev) yield ev;
    }
  }
}

function parseChunk(chunk: string): SSEEvent | null {
  let name = "message";
  let dataPart = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) dataPart += line.slice(5).trim();
  }
  if (!dataPart) return { name, data: {} };
  try {
    return { name, data: JSON.parse(dataPart) };
  } catch {
    return null;
  }
}
