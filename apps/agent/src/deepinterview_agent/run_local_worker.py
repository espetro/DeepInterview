"""Local prod worker launcher.

Same as ``deepinterview_agent.worker.main`` but with the tunings an 8GB
Mac needs in dev mode: a raised load threshold (local load flaps past the
SDK default) and one idle process. Kept as a Python module (not a /tmp
script) so ``scripts/run-local-prod.sh`` has a stable, committed entrypoint.
"""

from livekit.agents import WorkerOptions, cli

from deepinterview_agent.core.config import get_settings
from deepinterview_agent.core.observability import init_observability
from deepinterview_agent.worker import entrypoint, prewarm


def main() -> None:
    settings = get_settings()
    init_observability(settings)
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            ws_url=settings.livekit_url,
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
            shutdown_process_timeout=settings.shutdown_process_timeout_sec,
            load_threshold=1.01,
            num_idle_processes=1,
            initialize_process_timeout=60,
            port=8089,
        )
    )


if __name__ == "__main__":
    main()
