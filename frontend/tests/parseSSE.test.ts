import { describe, it, expect } from "vitest";
import { parseSSE } from "@/lib/parseSSE";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of it) out.push(v);
  return out;
}

describe("parseSSE", () => {
  it("yields one event per `\\n\\n`-separated chunk", async () => {
    const stream = streamFromChunks([
      'event: meta\ndata: {"language":"fr"}\n\n',
      'event: done\ndata: {}\n\n',
    ]);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([
      { name: "meta", data: { language: "fr" } },
      { name: "done", data: {} },
    ]);
  });

  it("handles events split across chunks", async () => {
    const stream = streamFromChunks([
      "event: mist",
      'ake\ndata: {"error_te',
      'xt":"x"}\n\nevent: done\ndata: {}\n\n',
    ]);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([
      { name: "mistake", data: { error_text: "x" } },
      { name: "done", data: {} },
    ]);
  });

  it("flushes the buffer when the stream ends without trailing \\n\\n", async () => {
    const stream = streamFromChunks(["event: done\ndata: {}"]);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ name: "done", data: {} }]);
  });

  it("preserves UTF-8 in data payloads", async () => {
    const stream = streamFromChunks(['event: m\ndata: {"d":"Démonstration"}\n\n']);
    const events = await collect(parseSSE(stream));
    expect((events[0].data as { d: string }).d).toBe("Démonstration");
  });
});
