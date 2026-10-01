# Highlighter: one switch, listeners follow open container tabs

Amends `2026-09-25-burp-listener-per-container-design.md`. The JAR protocol does not change.

## Why

Marking each container by hand, with a per-row button next to Promote, was a second control for something the user almost always wants for every container they are testing in. Now one switch, the Highlighter tile in the Burp / Proxy section, turns highlighting on for every container in use.

## Behaviour

- **On and paired**: every container (`firefox-container-*`) with at least one open tab has its own Burp listener. Several tabs of one container share one listener. Hidden and discarded tabs count as open. Default and private tabs never get a listener.
- A container whose last tab closes keeps its listener for a **15 s grace** (30 s until 2026-10-01). If a tab of it opens during that time (Ctrl+Shift+T, a new tab, a reopened window), the grace ends and the listener is reused unchanged. When the grace runs out, the next sync leaves the container out and the JAR closes its listener. The next time the container opens, it gets its old address back (sticky `highlighterLastAddress`).
- **Why the grace:** each change to the listener set makes Burp recreate every listener, the user's own included (JAR `ListenerManager`). The grace and the existing 300 ms debounce keep those changes rare. A session restore produces a single import.
- Closing the last window puts every container into the grace, like closing every tab. The immediate release on the last window is gone. The JAR's 30 s lease still covers a quit or a crash.
- **Off**: all graces are dropped, the JAR is told to `release` at once, and nothing is synced or sent until the switch is turned on again.
- **On, not paired**: PhoenixBox looks for the Highlighter and asks to pair (the switch replaces "something is marked" as the reason to look). Until it is paired, every container request through an HTTP(S) proxy carries the legacy `X-MAC-Container-Color` header.
- **First request of a container that just opened:** `route()` waits up to 1.5 s for the sync that opens its listener, then sends the request to the preset unhighlighted. Firefox's failover can't be used for a cold first request.
- A deleted container is dropped at once, with no grace.
- After a background restart, the open containers are rebuilt from `tabs.query`, and any grace in progress is lost.

## Storage

- New: `highlighterEnabled` (boolean).
- Retired: `highlighterContainerIds` (the marks).
- Migration, when `highlighterEnabled` is unset: the switch starts on if 3.0's `addContainerColorHeaderEnabled` was true or any marks exist. It is read before the retired keys are removed.

## UI

- The Highlighter tile toggles the switch. Its gear opens the pairing modal. Turning the switch on while unpaired also opens the modal, so the user sees the "click Allow in Burp" step.
- The per-row Highlighter button is removed.
- The container detail view shows the Burp listener, and its pin, whenever the switch is on.
