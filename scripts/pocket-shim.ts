// OpenAI-compatible /v1/audio/speech -> pocket-tts /tts (multipart WAV) shim.
Bun.serve({
  port: Number(process.env.SHIM_PORT ?? 9005),
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/v1/audio/speech") return new Response("not found", { status: 404 });
    const body = (await req.json()) as { input: string };
    const form = new FormData();
    form.set("text", body.input);
    const upstream = await fetch(`${process.env.POCKET_URL ?? "http://localhost:9004"}/tts`, {
      method: "POST",
      body: form,
    });
    if (!upstream.ok) {
      return new Response(await upstream.text(), { status: upstream.status });
    }
    return new Response(upstream.body, {
      headers: { "content-type": "audio/wav" },
    });
  },
});
console.log(`pocket shim on :${process.env.SHIM_PORT ?? 9005}`);
