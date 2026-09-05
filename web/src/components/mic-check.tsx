import * as React from "react";
import { useIntl } from "react-intl";

/**
 * Compact mic check: device picker + live input level bar.
 * Pure client-side getUserMedia + AnalyserNode; nothing leaves the browser.
 * Idle (mic off) by default — activating requires an explicit user click.
 */
export function MicCheck() {
  const intl = useIntl();
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState<string>("");
  const [level, setLevel] = React.useState(0);
  const [active, setActive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // refs held outside state: the graph is imperative, re-renders only read `level`
  const streamRef = React.useRef<MediaStream | null>(null);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef(0);

  const stop = React.useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current = null;
    setLevel(0);
    setActive(false);
  }, []);

  const start = React.useCallback(
    async (id?: string) => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: id ? { deviceId: { exact: id } } : true,
        });
        streamRef.current = stream;
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          // peak deviation from the centerline, smoothed a little
          let peak = 0;
          for (let i = 0; i < buf.length; i += 4) {
            peak = Math.max(peak, Math.abs(buf[i]! - 128) / 128);
          }
          setLevel((prev) => prev * 0.6 + peak * 0.4);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        setActive(true);

        // enumerate after permission so labels are populated
        const list = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput",
        );
        setDevices(list);
        const current = stream.getAudioTracks()[0]?.getSettings().deviceId;
        setDeviceId(current ?? list[0]?.deviceId ?? "");
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? intl.formatMessage({ id: "setup.mic.denied" })
            : intl.formatMessage({ id: "setup.mic.error" }),
        );
      }
    },
    [intl],
  );

  React.useEffect(() => () => stop(), [stop]);

  const bars = 24;
  const lit = Math.round(level * bars);

  return (
    <div
      data-testid="mic-check"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-white px-4 py-3 ring-1 ring-hairline"
    >
      <button
        onClick={() => (active ? stop() : void start())}
        aria-pressed={active}
        className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
          active
            ? "bg-espresso text-cream"
            : "bg-cream ring-1 ring-hairline text-espresso hover:ring-persimmon/40"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${active ? "bg-persimmon orb-live" : "bg-espresso-faint"}`}
          aria-hidden
        />
        {intl.formatMessage({
          id: active ? "setup.mic.stop" : "setup.mic.start",
        })}
      </button>

      {/* compact level meter: segment bar, dark idle, persimmon when live */}
      <div
        className="flex h-4 flex-1 min-w-32 items-stretch gap-[3px]"
        role="meter"
        aria-valuenow={Math.round(level * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={intl.formatMessage({ id: "setup.mic.level" })}
      >
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className={`w-full rounded-[2px] transition-colors duration-100 ${
              i < lit
                ? i > bars - 5
                  ? "bg-persimmon-deep"
                  : "bg-persimmon"
                : "bg-espresso-faint/25"
            }`}
          />
        ))}
      </div>

      {devices.length > 0 && (
        <select
          value={deviceId}
          onChange={(e) => {
            const id = e.target.value;
            setDeviceId(id);
            if (active) void start(id);
          }}
          aria-label={intl.formatMessage({ id: "setup.mic.device" })}
          className="max-w-44 truncate rounded-full bg-cream px-3 py-1.5 text-xs text-espresso-soft ring-1 ring-hairline outline-none focus:ring-2 focus:ring-persimmon/50"
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || intl.formatMessage({ id: "setup.mic.defaultDevice" })}
            </option>
          ))}
        </select>
      )}

      {error && (
        <p role="alert" className="w-full text-xs text-persimmon-deep">
          {error}
        </p>
      )}
    </div>
  );
}
