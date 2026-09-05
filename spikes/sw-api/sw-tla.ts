addEventListener("install", () => {});
addEventListener("message", (e) => {
  console.info("[tla] msg", e.data);
});
self.postMessage?.("boot");
