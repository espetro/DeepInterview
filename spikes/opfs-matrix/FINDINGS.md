# OPFS matrix spike findings (Phase 1.3 + 1.4)

Spike artifacts:

- `probe.html`: self-contained capability matrix (OPFS, SyncAccessHandle in doc vs worker, Web Locks, persistence, SQLite WASM VFS flags).
- `two-tabs.html`: two-tab locking experiment with scenarios and a log panel.
- `serve.ts`: `bun spikes/opfs-matrix/serve.ts` → http://localhost:8788 (localhost is a secure context, OPFS works).

## Expected matrix (from docs, as of 2026-09)

Sources: MDN, caniuse (mdn-api_filesystemfilehandle_createsyncaccesshandle and friends).

| Capability | Chrome/Edge | Firefox | Safari/WebKit |
|---|---|---|---|
| OPFS (`getDirectory`) | yes (102+) | yes (111+) | yes (15.2+) |
| `createSyncAccessHandle` (dedicated worker only) | yes (102+ / Edge 102+) | yes (111+) | yes (15.2+) |
| `createSyncAccessHandle` `mode: "readwrite-unsafe"` | no (flagged/behind flag as of FF 157, Chrome ~155) | no | no (unknown in TP) |
| Web Locks API | yes (69+) | yes (96+) | yes (15.4+) |
| `navigator.locks.query` | yes | yes | yes (15.4+) |
| `storage.persist()` | yes | yes | yes |
| OPFS inside WKWebView (ElectroBun macOS) | n/a | n/a | expected yes (WebKit 15.2+ engine), **must verify in Phase 3 wrapper spike** |

Key docs facts:

- `createSyncAccessHandle` is **dedicated-worker-only** and OPFS-only in all engines. The document itself can never open one; that's why both the probe and the two-tab page do sync writes inside a spawned Worker.
- Default mode is exclusive: a second `createSyncAccessHandle` on the same file (same or different agent) rejects with `NoModificationAllowedError` until the first closes. The `mode: "readwrite-unsafe"` escape hatch is not shipped anywhere yet, so cross-context single-writer enforcement is engine-native for sync handles.
- OPFS requires a secure context. `http://localhost` qualifies; a file:// page or plain-LAN http does not.

## Observed results (fill per browser)

Run `probe.html` in each browser and copy the table here.

### Chrome (version: ___ )

| Capability | Result | Detail |
|---|---|---|
| OPFS | | |
| createSyncAccessHandle (document) | | expected: unavailable/rejected (worker-only) |
| createSyncAccessHandle (worker) | | |
| Web Locks | | |
| storage.estimate / persist | | |
| SQLite WASM VFS flags (SAB/COOP+COEP) | | |

### Firefox (version: ___ )

(same rows)

### Safari (version: ___ )

(same rows)

### WKWebView via wrapper (Phase 3)

(same rows)

## Two-tab locking experiment (Phase 1.4)

Run `two-tabs.html` in two side-by-side tabs; scenarios:

1. **plain write, no lock**: async `createWritable()` in two tabs both succeed; last-writer-wins clobbers content. No engine serialization on the async API.
2. **write under Web Lock**: `navigator.locks.request("di-opfs-lock", {ifAvailable:true}, ...)` serializes across tabs; second tab sees `lock === null` or queues (drop `ifAvailable` for blocking wait).
3. **contention burst**: rapid worker sync writes from both tabs; the losing side gets `NoModificationAllowedError` while the other tab holds an open sync handle (exclusive default mode).
4. **lock query**: `navigator.locks.query()` shows held/pending per lock name across tabs.

### Observed (fill in)

- Chrome two tabs: ___
- Firefox two tabs: ___
- Safari two tabs: ___

### Conclusion + recommendation for the SW-hosted db

The database lives in the Service Worker (Option C architecture: SW hosts the API + OPFS SQLite). Recommended locking strategy:

1. **Engine-level exclusion as the base layer**: keep exactly one open `createSyncAccessHandle` per db file, owned by one worker inside the SW. Sync handles are exclusive by default, so a second opener (another tab's rogue worker, a second SW instance) fails loudly with `NoModificationAllowedError` rather than corrupting. Treat that error as "lock contention, retry via the coordinator" not as fatal.
2. **Web Locks as the coarse coordinator**: all tabs and the SW acquire `navigator.locks.request("di-db", ...)` before any write transaction (or, simpler, before touching OPFS at all). Web Locks are shared across same-origin contexts including the SW's clients, so they serialize tab-vs-tab and tab-vs-SW access cleanly. Do not use `ifAvailable:true` for writes; queue (blocking) so writes serialize naturally.
3. **Single-writer design wins anyway**: with the SW owning the db, tabs never write OPFS directly; they `postMessage`/fetch to the SW. Then the two-tab problem reduces to SW-internal serialization (one sync handle, sequential transaction queue), and Web Locks are only needed as a belt-and-suspenders guard against pre-SW pages or multi-SW edge cases (e.g. an old SW version mid-update).
4. WebKit caveat for ElectroBun/WKWebView: Web Locks and sync handles both exist in modern WebKit, but `locks.query` and error shapes may differ slightly; verify in the Phase 3 wrapper spike before shipping the installer path.

Bottom line: **engine-native sync-handle exclusivity + Web Locks ("di-db") held around every transaction, db owned by the SW, tabs talk to the SW only.** This is what sqlite-wasm's `opfs-sahpool` backend effectively assumes (one pool owner), and it avoids needing the unshipped `readwrite-unsafe` mode.
