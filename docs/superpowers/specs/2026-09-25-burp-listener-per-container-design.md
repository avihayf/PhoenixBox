# Header-free Burp highlighting: one Burp listener per marked container

> **Amended 2026-09-29** by `2026-09-29-highlighter-follows-open-tabs-design.md`: containers are no longer marked. With the Highlighter switch on, every container with an open tab has a listener, kept for 30 s after its last tab. The protocol below is unchanged; "marked containers" now means "open containers".

Status: approved 2026-09-25. Spans this repo and `PhoenixBox-Highlighter` (the Burp JAR).

## Why

PhoenixBox used to add `X-MAC-Container-Color` and `X-MAC-Container-Name` to requests sent to Burp. The Highlighter JAR read them, highlighted the request and stripped them. If the JAR was missing or too old, the headers reached the target site, which is why PhoenixBox made the user confirm the JAR version before sending the name.

New rule: **PhoenixBox never modifies a request for highlighting.** A container's identity is carried by **which Burp listener (IP:port) the request arrives on**. The JAR reads it with `InterceptedRequest.listenerInterface()`, e.g. `"127.0.0.1:18081"`.

## Feasibility (spiked 2026-09-25, Burp Pro 2026.8, Firefox 153)

- **Burp listeners change live.** `importProjectOptionsFromJson` adds or removes a proxy listener in about 90 ms, with no restart.
  - Listeners live in **project** options, under `proxy.request_listeners`.
  - `listenerInterface()` reported `127.0.0.1:8199` for a request sent through a spike listener.
  - **Every import recreates all listeners**, including the user's 8080. The port stays up, but its socket is replaced. So the JAR imports only when its set of listeners actually changes.
- **Firefox proxy failover works:** `proxy.onRequest` returning `[dead, fallback]` reached the fallback for fetches, page loads and retries after `failoverTimeout`. The exception was the very first request of a cold session. So failover is a backstop only (see Routing).
- **Burp's bundled JRE has no `jdk.httpserver`.** The control server is a small `ServerSocket` handler.

## User-facing behaviour

- The global Highlighter tile is removed. Each container row gets a **Highlighter button next to Promote**.
- **Marked means the container has its own Burp listener; unmarked means it doesn't.** No limit on the number of marks. Open tabs don't matter.
- In Burp, traffic arriving on a container's listener is highlighted in the container's colour. The Notes column shows **only the container name**.
- **Promote still decides what reaches Burp.** Marking changes which listener traffic arrives on, not whether it goes to Burp.
- **Pairing:** the JAR's Burp tab shows a pairing string. The user pastes it into the popup once. The popup shows the connection status and any per-container errors.
- **Optional pin:** a container's detail view can pin it to an exact `IP:port`, e.g. a listener the user built with special settings. The JAR adopts an existing listener at that address and never modifies or deletes it.

## Routing (PhoenixBox, `proxy.onRequest`)

"Burp route" means the proxy PhoenixBox already chose for the request (global or per-container, under the existing promote rules) has type `http`/`https` and the same host:port as the Burp preset.

| Existing rules pick the Burp route | Marked | Assignment confirmed by JAR | Proxy returned |
|---|---|---|---|
| yes | yes | yes | `[{…burp, host: A.ip, port: A.port, failoverTimeout: 1}, burp]` |
| yes | yes | no / unpaired / JAR unreachable | `burp` (unhighlighted) |
| yes | no | — | `burp` (as today) |
| no | any | — | unchanged |

- PhoenixBox uses an assignment only after the JAR has reported it `ok`.
- A failed heartbeat drops all assignments right away, so traffic returns to the preset.

## Address assignment (JAR)

Inputs: the preset `host:port`, the marked containers, each container's optional `pin` and optional `preferred` (last address it had), and Burp's current `request_listeners`.

**Automatic addresses** use the preset's IP and ports from **18080** upward. They avoid 8081–8090, which dev tools commonly use.

An address is **unusable** when it:
1. equals the preset address,
2. overlaps a listener the JAR didn't create. A listener on all interfaces overlaps every IP on its port. Exception: a pin may adopt one.
3. equals the control server's address,
4. is already given to another container in this sync,
5. fails the probe on Burp's machine:
   - a **connect test**: anything answering means taken, which catches dev servers on `0.0.0.0`,
   - then a **bind test** with address reuse on, as Burp binds, to tell a usable address from one not on this machine. The connect test is what protects a `*:P` dev server, since it answers on `127.0.0.1` too.
   - Reuse must be on: a reuse-off bind fails while a just-closed listener's connections sit in TIME_WAIT, which stopped containers getting their old port back after a reload (found live 2026-09-26).
   - Addresses the JAR itself already listens on skip the probe, since they're ours.

Order for each container:
1. **pin** if set: adopt an existing user listener, use it if usable, otherwise error. Never falls back.
2. **preferred** if usable.
3. the lowest usable automatic port.

Containers are processed in a stable order: those keeping their current address first, then by id. Moving the preset onto a held address frees that container on the next sync.

## Control protocol (v1)

- **Transport:** HTTP/1.1 over TCP, served by the JAR.
- **Bind address:** copies the address mode of the first entry in `proxy.request_listeners`:
  - `loopback_only` → `127.0.0.1`
  - `specific_address` → that IP
  - `all_interfaces` → `0.0.0.0`
- **Port:** 8079, or the next port up to 8099 when something else answers on it. Always tried from 8079, so the pairing string survives reloads; the bind uses address reuse, since connections left in TIME_WAIT by earlier syncs would otherwise push it off 8079.
- **Pairing string:** `phx1:<host>:<port>:<token>`. The token is 32 random bytes, base64url, stored in Burp user preferences. The JAR tab can regenerate it.

Every request must:
- carry `Authorization: Bearer <token>` (constant-time compare), otherwise `401`,
- carry `Content-Type: application/json` on `POST`. That forces a CORS preflight on web pages, and preflights (`OPTIONS`) are always rejected with `405`,
- not carry an `Origin` other than `moz-extension://…`, otherwise `403`.

Bodies are limited to 64 KiB, with one request per connection (`Connection: close`).

### `GET /v1/status`
```json
{ "protocol": 1, "jar": "2.0.0", "listeners": 3 }
```

### `POST /v1/sync`
Request:
```json
{
  "protocol": 1,
  "preset": { "host": "127.0.0.1", "port": 8080 },
  "containers": [
    { "id": "firefox-container-3", "name": "Work", "color": "red",
      "pin": null, "preferred": "127.0.0.1:18080" }
  ]
}
```
- `color` is one of `blue cyan green yellow orange red pink magenta`, or `null`. PhoenixBox maps turquoise to cyan and purple to magenta; `toolbar` becomes `null`, which means no highlight.
- `name` is capped at 64 code points by PhoenixBox. The JAR re-caps it and strips control characters.

Response `200`:
```json
{
  "protocol": 1, "jar": "2.0.0",
  "assignments": {
    "firefox-container-3": { "status": "ok", "address": "127.0.0.1:18080" },
    "firefox-container-5": { "status": "error", "address": null,
                             "error": "192.168.10.5:8080 is in use by another program" }
  }
}
```

- The request is the **full desired state**. The JAR reconciles to it and imports only if its set of listeners changed.
- **Lease:** with no successful sync for 30 s, the JAR removes its listeners and forgets the assignments. It was 120 s until 2026-09-28; it was shortened so that quitting Firefox doesn't leave listeners open. PhoenixBox also sends `release` when its last window closes.
- PhoenixBox syncs:
  - on mark/unmark, pin change, container rename, recolour or delete,
  - on a preset change and on pairing,
  - at startup,
  - every 10 s, except while no browser window is open.
  - Changes are debounced by 300 ms.

## JAR lifecycle

- **On load:** remove any listeners recorded in `extensionData` as ours (leftovers from a crash), start the control server, and register the suite tab.
- **On unload:** remove our listeners, then stop the control server.
- Header stripping for `X-MAC-Container-*` stays as a backstop for older PhoenixBox versions.
- **Repeater menu:** "Send to Repeater (PhoenixBox)" is offered for a request whose note equals a container name the JAR has written. That set of names is persisted in `extensionData`.

## PhoenixBox storage

| Key | Meaning |
|---|---|
| `highlighterContainerIds` | marked containers (string[]) |
| `highlighterPins` | `{cookieStoreId: "ip:port"}` |
| `highlighterLastAddress` | `{cookieStoreId: "ip:port"}` for sticky assignment |
| `highlighterPairing` | `{host, port, token}` |

The keys removed in migration are `highlighterHeadersEnabled`, `addContainerColorHeaderEnabled` and `highlighterJarAckVersion`. Marks start empty. Deleting a container removes its mark, pin and last address.

## Removed

- Both headers and all their gating: `COLOR_HEADER_NAME`, `NAME_HEADER_NAME`, the JAR-ack gate, `isHighlighterRoute`'s header use, and the ack UI and notices.
- The preset's "Turn on the Highlighter when this preset is selected" option.

## Verification

- **Unit tests:**
  - PhoenixBox: routing table, desired-state builder, pairing-string parser, failover list, migration.
  - JAR: address allocation (every unusable rule, pin/adopt, preferred, preset move), listener-config JSON round-trip touching only our entries, control-server auth rules.
- **Manual:**
  - Mark 3 of 20 containers: exactly 3 new Burp listeners.
  - Unmark: its listener disappears.
  - Requests are highlighted and named, and carry no `X-MAC-*` headers.
  - A dev server on `127.0.0.1:18080` makes the JAR skip to `18081`.
  - Unloading the JAR removes its listeners, and browsing continues via 8080.

## Addendum (2026-09-27): legacy mode and automatic pairing

This supersedes "never modifies a request" above, which now holds only while paired. The goal is compatibility with the **old JAR (v1.x)**; an old PhoenixBox with the new JAR is not supported.

### Two modes

| | PhoenixBox | New JAR |
|---|---|---|
| **Paired** (a pairing is stored) | Listeners only; adds **no** header. | Paired while a sync arrived within the lease and none said `release`. Reads and strips **no** `X-MAC-*` header. |
| **Not paired**, container marked | Adds only `X-MAC-Container-Color` (never the name) on requests through an HTTP(S) proxy (`legacyColorHeaderValue`). | Colours from the header, writes **no** note, and strips it at receive, at send, and in the all-tools backstop. |

"Paired" in PhoenixBox means a pairing is stored, not that Burp is currently reachable. So PhoenixBox never sends the header while paired, even when Burp is down.

Accepted risk: while paired, the new JAR passes `X-MAC-*` headers from other sources through, for example an unpaired second profile or saved Repeater requests.

### Automatic pairing (one Allow in Burp)

Spike, Firefox 153: an extension's background `fetch` sends `Origin: moz-extension://<uuid>` on **POST** but not on GET. So both new endpoints are POSTs that require that Origin; a web page's POST carries its own Origin and is refused.

- `POST /v1/hello` → `{"app":"phoenixbox-highlighter","protocol":1,"jar":…}`. Needs no token.
- `POST /v1/pair {client, label}` → `202 pending` (an Allow/Deny banner at the top of Burp's PhoenixBox tab, showing the label, Origin and client ID), then `200 {"status":"approved","token"}`.
  - Denied: `403`, remembered for 2 minutes.
  - Another request already waiting: `429`.
  - **One pairing at a time:** approving a new client replaces the previous one, whose token stops working, because two PhoenixBoxes would each sync their full state and overwrite each other's listeners. The token is stored in Burp preferences. The approved client must keep asking from the same Origin.
- `POST /v1/sync {"protocol":1,"release":true}` leaves paired mode at once. PhoenixBox sends it on Unpair. Revoking a client in Burp does the same, run off the UI thread.

PhoenixBox's side:
- **When it discovers:** only when containers are marked, or on Connect. Not after an explicit Unpair (`highlighterAutoPairPaused`) until Connect.
- **Where it probes:** the Burp preset's host. 8079 first, then 8080–8099 in parallel, skipping the preset's own port.
- **How often:** every 60 s, and every 5 min after 10 misses.
- **While Burp's prompt waits:** it polls every 2 s, for up to 2 min.
- **After a 401 on sync (revoked):** it drops the pairing and asks again.
- **New storage:** `highlighterClientId`, `highlighterConnectRequest`, `highlighterAutoPairPaused`.

The manual pairing string stays as a fallback.

Verified live, Burp Pro 2026.8 and Firefox 153:
- **Before Allow:** requests went via `:8080` carrying `X-MAC-Container-Color: red`. The site received no `X-MAC` header.
- **After Allow:** requests went via the container's listener `:18081` with no header.
- **After Unpair:** requests went via `:8080` with the header, stripped again. No new pairing prompt appeared.
