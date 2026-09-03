# .agents/docs

Agent-facing operational documentation for the deep-interview monorepo.

## Index

| Doc | Contents |
| --- | --- |
| [screens/](screens/) | One file per screen: ASCII mockup, section inventory, CTAs, states, nav, key files |
| [user-flows.md](user-flows.md) | Mermaid diagrams + step lists: main flow, fast flow, error/recovery, coach loop |
| [stack.md](stack.md) | Native stack runbook: ports, start order, env files, config, tests |

## Screen docs

- [landing.md](screens/landing.md) - `/`
- [setup.md](screens/setup.md) - `/setup`
- [session-poll.md](screens/session-poll.md) - `/session/[id]`
- [prep-coach.md](screens/prep-coach.md) - `/prep`
- [live-room.md](screens/live-room.md) - `/interview/[id]`
- [report.md](screens/report.md) - `/report/[id]`
- [avatars.md](screens/avatars.md) - `/avatars`

## Update policy

**Whenever a screen UI changes, update its ASCII mockup in the same commit.**

Rules:

1. Any commit that changes layout, sections, CTAs, states, or navigation of a screen MUST also update the corresponding file in `screens/` (mockup, section inventory, states, key files as applicable).
2. `setup.md` documents the **iteration-2 state**; other screens document
   current state.
3. New screens get a new file in `screens/` plus entries in this index and in `user-flows.md`.
4. When a flow changes (new route, new status, new endpoint), update `user-flows.md` in the same commit.
5. Port numbers, commands, and config paths changed by infrastructure work must be reflected in `stack.md` in the same commit.
