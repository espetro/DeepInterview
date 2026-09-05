// tiny static server for the OPFS spike dir.
// usage: bun spikes/opfs-matrix/serve.ts [port]
// OPFS requires a secure context; localhost counts as one.
const port = Number(process.argv[2] ?? 8788);
const dir = import.meta.dir;

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/probe.html" : url.pathname;
    path = path.replace(/\.\./g, ""); // no traversal
    const file = Bun.file(dir + path);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "cache-control": "no-store" },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(
  `opfs-matrix spike server: http://localhost:${port}/ (probe.html, two-tabs.html)`,
);
