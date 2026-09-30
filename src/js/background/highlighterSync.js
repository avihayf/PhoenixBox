/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * While the Highlighter switch is on, keeps the PhoenixBox Highlighter JAR in
 * step with the containers that have open tabs, and tells the proxy handler
 * which Burp listener each one's traffic should go to. Several tabs of one
 * container share a listener; after its last tab closes, a container keeps
 * its listener for a 30 s grace, so a quick reopen does not make Burp
 * recreate its listeners twice.
 *
 * Pairing is automatic: while unpaired and switched on (or when the user
 * presses Connect), PhoenixBox looks for Highlighter v2 on the Burp preset's
 * host and asks to pair; the user clicks Allow once in Burp. Until then,
 * containers use the legacy colour header (background/requestHeaders.js).
 *
 * Every sync sends the full set of open containers, so a lost request or a
 * restart on either side is repaired by the next one; a 10 s heartbeat also
 * keeps the JAR's lease alive. Only listeners the JAR reports as up are ever
 * routed to.
 *
 * Decisions live in shared/highlighterSyncHelpers.js, which is unit tested.
 */

const HS = PhoenixBoxHighlighterSyncHelpers;

// Also the JAR's liveness signal: it closes the listeners after 30 s without
// one, so a Firefox that quits or crashes leaves nothing open for long.
const HEARTBEAT_MS = 10_000;
// While the Highlighter can't be reached (Burp restarting, the JAR being
// reloaded), retry this often, so listeners come back within seconds rather
// than at the next heartbeat.
const RETRY_MS = 5_000;
const DEBOUNCE_MS = 300;
// A container's first tab: sync almost at once, since its first request is
// waiting, but still coalesce a burst (a restored session, a new window).
const OPEN_DEBOUNCE_MS = 50;
const REQUEST_TIMEOUT_MS = 5_000;
// How long a request from a just-opened container waits for its listener
// before going to the preset unhighlighted: Burp has to recreate its
// listeners first.
const FIRST_REQUEST_WAIT_MS = 1_500;
// Discovery: each probe gets this long; a miss is retried every minute, and
// every five after ten misses (an old JAR, or none, is not going to change).
const HELLO_TIMEOUT_MS = 1_000;
const DISCOVERY_RETRY_MS = 60_000;
const DISCOVERY_SLOW_RETRY_MS = 300_000;
const DISCOVERY_SLOW_AFTER = 10;
// While Burp shows the pairing prompt, ask again this often, for this long.
const PAIR_POLL_MS = 2_000;
const PAIR_WAIT_MS = 120_000;

const highlighterSync = {
  /** The Highlighter tile's switch. */
  enabled: false,
  /** Open tabs per container, and graces; see HS.createTabTracker. */
  tracker: HS.createTabTracker(),
  pins: {},
  lastAddresses: {},
  /** @type {{host: string, port: number, token: string}|null} */
  pairing: null,
  burpPreset: { ...HS.DEFAULT_BURP_PRESET },
  /** @type {Map<string, {name?: string, color?: string}>} */
  identities: new Map(),
  /** @type {Map<string, {host: string, port: number}>} confirmed by the JAR */
  addresses: new Map(),

  _timer: null,
  _graceTimer: null,
  _lastStatus: null,
  // Auto-pairing. Not persisted: after a restart PhoenixBox simply looks again.
  /** @type {{host: string, port: number, since: number}|null} waiting for Allow in Burp */
  _pendingPair: null,
  _denied: false,
  _autoPairPaused: false,
  _connectRequested: false,
  _discoveryMisses: 0,
  _nextDiscoveryAt: 0,
  _inFlight: false,
  _again: false,
  /** Resolves when the next sync finishes; null when none is scheduled. */
  _nextSync: null,
  _resolveNextSync: null,
  /** Resolves when the sync in flight finishes; null when none is. */
  _currentSync: null,
  /**
   * Containers whose first tab just opened and whose listener the next sync
   * asks for. Only their requests wait for it: waiting on every sync would
   * stall all browsing while the Highlighter can't be reached.
   * @type {Set<string>}
   */
  _justOpened: new Set(),

  async init() {
    const stored = await browser.storage.local.get({
      [HS.ENABLED_KEY]: null,
      // Read once, for the migration, before the retired keys go.
      [HS.MARKS_KEY]: [],
      addContainerColorHeaderEnabled: false,
      [HS.PINS_KEY]: {},
      [HS.LAST_ADDRESS_KEY]: {},
      [HS.PAIRING_KEY]: null,
      [HS.AUTO_PAIR_PAUSED_KEY]: false,
      customProxyPresets: [],
    });
    this._autoPairPaused = !!stored[HS.AUTO_PAIR_PAUSED_KEY];
    this.enabled = HS.initialEnabled(stored);
    if (stored[HS.ENABLED_KEY] !== this.enabled) {
      await browser.storage.local.set({ [HS.ENABLED_KEY]: this.enabled });
    }
    await browser.storage.local.remove(HS.RETIRED_KEYS);
    this.pins = stored[HS.PINS_KEY] || {};
    this.lastAddresses = stored[HS.LAST_ADDRESS_KEY] || {};
    this.pairing = this._readPairing(stored[HS.PAIRING_KEY]);
    this.burpPreset = HS.burpPresetFrom(stored.customProxyPresets);

    this._watchSettings();
    this._watchContainers();
    // Watch before listing, so a tab opened meanwhile is not missed.
    this._watchTabs();
    await Promise.all([this._loadIdentities(), this._loadTabs()]);

    setInterval(() => {
      if (this.enabled || this._pendingPair) this.schedule(0);
    }, HEARTBEAT_MS);
    this.schedule(0);
  },

  /**
   * The proxy for a request PhoenixBox has already routed. A container going
   * to the Burp preset is sent to its own listener instead, with the preset
   * as failover; everything else is returned unchanged.
   */
  async route(cookieStoreId, proxy) {
    if (!this.enabled || !this.pairing || !HS.isHighlightable(cookieStoreId) ||
        !HS.isBurpRoute(proxy, this.burpPreset)) {
      return proxy;
    }

    let address = this.addresses.get(cookieStoreId);
    const pending = this._nextSync || this._currentSync;
    if (!address && pending && this._justOpened.has(cookieStoreId)) {
      await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, FIRST_REQUEST_WAIT_MS))]);
      address = this.addresses.get(cookieStoreId);
    }
    return address ? HS.highlightedRoute(proxy, address) : proxy;
  },

  /** Coalesces bursts of changes (e.g. a restored session's tabs) into one sync. */
  schedule(delay = DEBOUNCE_MS) {
    if (!this._nextSync) {
      this._nextSync = new Promise((resolve) => { this._resolveNextSync = resolve; });
    }
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._run(), delay);
  },

  async _run() {
    if (this._inFlight) {
      this._again = true;
      return;
    }
    this._inFlight = true;
    const resolve = this._resolveNextSync;
    this._currentSync = this._nextSync;
    this._nextSync = null;
    this._resolveNextSync = null;
    // Answered by this sync, whatever its outcome; later requests don't wait.
    const opening = [...this._justOpened];

    let unreachable = false;
    try {
      unreachable = (await this._syncOnce()) === "unreachable";
    } catch (e) {
      LOG.warn("highlighterSync: sync failed", e);
    } finally {
      this._inFlight = false;
      for (const id of opening) this._justOpened.delete(id);
      this._currentSync = null;
      if (resolve) resolve();
      if (this._again) {
        this._again = false;
        this.schedule(0);
      } else if (unreachable && this.pairing) {
        this.schedule(RETRY_MS);
      }
    }
  },

  /** @returns {Promise<"unreachable"|undefined>} "unreachable" when the JAR could not be contacted at all. */
  async _syncOnce() {
    if (!this.pairing) {
      this.addresses = new Map();
      await this._autoPair();
      return;
    }
    // Switched off: the listeners were released when it was turned off.
    if (!this.enabled) {
      await this._writeStatus({ state: "off" });
      return;
    }

    const endpoint = HS.controlEndpoint(this.pairing, this.burpPreset);
    const body = HS.buildSyncBody({
      burpPreset: this.burpPreset,
      open: this._active(),
      identities: this.identities,
      pins: this.pins,
      lastAddresses: this.lastAddresses,
    });

    let response;
    try {
      response = await fetch(`http://${endpoint}/v1/sync`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.pairing.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Burp is closed, the JAR is not loaded, or the address is wrong. Stop
      // routing to listeners that may be gone.
      this.addresses = new Map();
      await this._writeStatus({ state: "error", message: `Can't reach the Highlighter at ${endpoint}. Is Burp running with the JAR loaded?` });
      return "unreachable";
    }

    if (response.status === 401) {
      // Revoked in Burp. Drop the pairing: containers go back to the
      // legacy colour header, and PhoenixBox asks to pair again.
      this.addresses = new Map();
      this._nextDiscoveryAt = 0;
      await browser.storage.local.set({ [HS.PAIRING_KEY]: null });
      return;
    }

    if (!response.ok) {
      this.addresses = new Map();
      await this._writeStatus({ state: "error", message: `The Highlighter refused the sync (HTTP ${response.status}).` });
      return;
    }

    const parsed = HS.parseSyncResponse(await response.json().catch(() => null));
    if (!parsed) {
      this.addresses = new Map();
      await this._writeStatus({ state: "error", message: "The Highlighter's reply was not understood. Update the JAR." });
      return;
    }

    // Turned off while this sync was in flight: route nothing to them.
    if (!this.enabled) return;
    this.addresses = parsed.addresses;
    await this._rememberAddresses(parsed.addresses);

    const assigned = {};
    for (const [id, address] of parsed.addresses) assigned[id] = HS.formatAddress(address);
    await this._writeStatus({
      state: "connected",
      jar: parsed.jar,
      addresses: assigned,
      errors: parsed.errors,
    });
  },

  /**
   * Looks for Highlighter v2 and asks to pair. Probes Burp only when there is
   * a reason: the switch is on, or the user pressed Connect.
   */
  async _autoPair() {
    const asked = this._connectRequested;
    this._connectRequested = false;

    if ((!this.enabled || this._autoPairPaused) && !asked && !this._pendingPair) {
      await this._writeStatus({ state: "unpaired" });
      return;
    }
    if (this._denied && !asked) {
      await this._writeStatus({ state: "denied" });
      return;
    }
    this._denied = false;
    if (!this._pendingPair && !asked && Date.now() < this._nextDiscoveryAt) {
      return; // keep the last status until the next attempt
    }

    let target = this._pendingPair;
    if (!target) {
      await this._writeStatus({ state: "searching" });
      const found = await this._discover();
      if (!found) {
        this._discoveryMisses++;
        this._nextDiscoveryAt = Date.now() +
          (this._discoveryMisses >= DISCOVERY_SLOW_AFTER ? DISCOVERY_SLOW_RETRY_MS : DISCOVERY_RETRY_MS);
        await this._writeStatus({ state: "legacy" });
        return;
      }
      this._discoveryMisses = 0;
      target = { ...found, since: Date.now() };
    }

    const reply = await this._requestPairing(target);
    switch (reply.state) {
    case "approved":
      this._pendingPair = null;
      // The storage watcher picks this up, and the first sync follows.
      await browser.storage.local.set({
        [HS.PAIRING_KEY]: { host: target.host, port: target.port, token: reply.token },
      });
      return;
    case "pending":
      if (Date.now() - target.since > PAIR_WAIT_MS) {
        this._pendingPair = null;
        this._nextDiscoveryAt = Date.now() + DISCOVERY_RETRY_MS;
        await this._writeStatus({ state: "legacy", message: "No answer in Burp. Press Connect to ask again." });
        return;
      }
      this._pendingPair = target;
      await this._writeStatus({ state: "awaiting" });
      this.schedule(PAIR_POLL_MS);
      return;
    case "denied":
      this._pendingPair = null;
      this._denied = true;
      await this._writeStatus({ state: "denied" });
      return;
    case "busy":
      this._pendingPair = null;
      this._nextDiscoveryAt = Date.now() + PAIR_POLL_MS * 5;
      await this._writeStatus({ state: "awaiting", message: "Burp is asking about another PhoenixBox first." });
      return;
    default:
      this._pendingPair = null;
      this._nextDiscoveryAt = Date.now() + DISCOVERY_RETRY_MS;
      await this._writeStatus({ state: "legacy" });
    }
  },

  /**
   * Finds Highlighter v2's control server on the Burp preset's host: the
   * default port first, then the rest of its range at once. Burp's own proxy
   * port is skipped, so the probe never lands in its proxy.
   */
  async _discover() {
    const host = this.burpPreset.host;
    const hello = async (port) => {
      try {
        const response = await fetch(`http://${HS.formatAddress({ host, port })}/v1/hello`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
          credentials: "omit",
          signal: AbortSignal.timeout(HELLO_TIMEOUT_MS),
        });
        return response.ok && HS.isHighlighterHello(await response.json().catch(() => null)) ? { host, port } : null;
      } catch {
        return null;
      }
    };

    const ports = HS.controlPorts().filter((port) => port !== this.burpPreset.port);
    const first = await hello(ports[0]);
    if (first) return first;
    const rest = await Promise.all(ports.slice(1).map(hello));
    return rest.find(Boolean) || null;
  },

  async _requestPairing(target) {
    try {
      const response = await fetch(`http://${HS.formatAddress(target)}/v1/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: await this._clientId(),
          label: `PhoenixBox ${browser.runtime.getManifest().version} (Firefox)`,
        }),
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return HS.parsePairReply(response.status, await response.json().catch(() => null));
    } catch {
      return { state: "error" };
    }
  },

  /** A random ID for this profile, created once, so Burp can tell PhoenixBox installs apart. */
  async _clientId() {
    const stored = await browser.storage.local.get({ [HS.CLIENT_ID_KEY]: null });
    if (HS.isValidClientId(stored[HS.CLIENT_ID_KEY])) return stored[HS.CLIENT_ID_KEY];

    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await browser.storage.local.set({ [HS.CLIENT_ID_KEY]: id });
    return id;
  },

  /**
   * On unpairing or switching off, tells the JAR to close every listener and
   * leave paired mode now, rather than when its lease runs out: unpaired,
   * PhoenixBox is about to send the legacy colour header, which the JAR only
   * strips while unpaired. Best effort: the lease still ends it if this fails.
   */
  async _closeListeners(pairing) {
    const endpoint = HS.controlEndpoint(pairing, this.burpPreset);
    await fetch(`http://${endpoint}/v1/sync`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${pairing.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ protocol: HS.PROTOCOL, release: true }),
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  },

  /** Sticky assignment: a container gets the same address back next time. */
  async _rememberAddresses(addresses) {
    let changed = false;
    const next = { ...this.lastAddresses };
    for (const [id, address] of addresses) {
      const formatted = HS.formatAddress(address);
      if (next[id] !== formatted) {
        next[id] = formatted;
        changed = true;
      }
    }
    if (changed) {
      this.lastAddresses = next;
      await browser.storage.local.set({ [HS.LAST_ADDRESS_KEY]: next });
    }
  },

  /**
   * Only writes when something changed: the heartbeat would otherwise write to
   * disk, and wake every open popup, every 10 seconds for nothing.
   */
  async _writeStatus(status) {
    const serialized = JSON.stringify(status);
    if (serialized === this._lastStatus) return;
    this._lastStatus = serialized;
    await browser.storage.local.set({ [HS.STATUS_KEY]: status });
  },

  _readPairing(value) {
    if (!value || typeof value !== "object") return null;
    const port = Number(value.port);
    if (typeof value.host !== "string" || !Number.isInteger(port) || typeof value.token !== "string") return null;
    return { host: value.host, port, token: value.token };
  },

  _watchSettings() {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      let resync = false;

      if (HS.ENABLED_KEY in changes) {
        const enabled = changes[HS.ENABLED_KEY].newValue === true;
        if (enabled !== this.enabled) {
          this.enabled = enabled;
          if (enabled) {
            // Switching on while unpaired is a reason to look for the Highlighter now.
            if (!this.pairing) this._nextDiscoveryAt = 0;
          } else {
            // Nothing is routed to a listener from now on, graces included,
            // and Burp closes them at once rather than at the lease's end.
            this.addresses = new Map();
            this.tracker.closedAt.clear();
            this._armGraceTimer();
            if (this.pairing) {
              this._closeListeners(this.pairing).catch(() => {});
            }
          }
          resync = true;
        }
      }
      if (HS.PINS_KEY in changes) {
        this.pins = changes[HS.PINS_KEY].newValue || {};
        resync = true;
      }
      if (HS.PAIRING_KEY in changes) {
        const previous = this.pairing;
        this.pairing = this._readPairing(changes[HS.PAIRING_KEY].newValue);
        this.addresses = new Map();
        if (previous && !this.pairing) {
          this._closeListeners(previous).catch(() => {});
        }
        resync = true;
      }
      if (HS.AUTO_PAIR_PAUSED_KEY in changes) {
        this._autoPairPaused = !!changes[HS.AUTO_PAIR_PAUSED_KEY].newValue;
      }
      if (HS.CONNECT_REQUEST_KEY in changes) {
        this._connectRequested = true;
        this._denied = false;
        this._pendingPair = null;
        resync = true;
      }
      if ("customProxyPresets" in changes) {
        this.burpPreset = HS.burpPresetFrom(changes.customProxyPresets.newValue);
        resync = true;
      }
      // Our own write; picked up without triggering another sync.
      if (HS.LAST_ADDRESS_KEY in changes) {
        this.lastAddresses = changes[HS.LAST_ADDRESS_KEY].newValue || {};
      }

      if (resync) this.schedule();
    });
  },

  /**
   * Tracks which containers have open tabs. Tabs keep being tracked while the
   * switch is off, so turning it on opens the right listeners at once. Closing
   * the last window is no different from closing every tab: each container
   * gets its grace. A quit or a crash is covered by the JAR's 30 s lease.
   */
  _watchTabs() {
    browser.tabs.onCreated.addListener((tab) => {
      if (!tab) return;
      if (HS.trackTab(this.tracker, tab.id, tab.cookieStoreId, Date.now(), HS.GRACE_MS) && this.enabled) {
        this._justOpened.add(tab.cookieStoreId);
        this.schedule(OPEN_DEBOUNCE_MS);
      }
      // A tab reopened during its container's grace ends it: no sync needed.
      this._armGraceTimer();
    });
    browser.tabs.onRemoved.addListener((tabId) => {
      if (HS.untrackTab(this.tracker, tabId, Date.now())) this._armGraceTimer();
    });
    if (browser.tabs.onReplaced) {
      browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
        HS.replaceTab(this.tracker, addedTabId, removedTabId);
      });
    }
  },

  async _loadTabs() {
    try {
      const now = Date.now();
      for (const tab of await browser.tabs.query({})) {
        HS.trackTab(this.tracker, tab.id, tab.cookieStoreId, now, HS.GRACE_MS);
      }
    } catch (e) {
      LOG.warn("highlighterSync: could not read tabs", e);
    }
  },

  /** The containers that should have a listener now. */
  _active() {
    return HS.activeContainers(this.tracker, Date.now(), HS.GRACE_MS);
  },

  /**
   * Wakes when the earliest grace ends, so the JAR closes that listener
   * within a moment of it, not at the next heartbeat.
   */
  _armGraceTimer() {
    clearTimeout(this._graceTimer);
    this._graceTimer = null;
    const at = HS.nextGraceExpiry(this.tracker, HS.GRACE_MS);
    if (at === null) return;
    this._graceTimer = setTimeout(() => {
      const active = new Set(this._active()); // drops the ended graces
      for (const id of [...this.addresses.keys()]) {
        if (!active.has(id)) this.addresses.delete(id);
      }
      this._armGraceTimer();
      if (this.enabled) this.schedule(0);
    }, Math.max(0, at - Date.now()));
  },

  _watchContainers() {
    if (!browser.contextualIdentities) return;

    const upsert = ({ contextualIdentity }) => {
      if (!contextualIdentity) return;
      const previous = this.identities.get(contextualIdentity.cookieStoreId);
      this.identities.set(contextualIdentity.cookieStoreId, {
        name: contextualIdentity.name,
        color: contextualIdentity.color,
      });
      const changed = !previous || previous.name !== contextualIdentity.name || previous.color !== contextualIdentity.color;
      if (changed && this.enabled && this._active().includes(contextualIdentity.cookieStoreId)) this.schedule();
    };

    browser.contextualIdentities.onCreated.addListener(upsert);
    browser.contextualIdentities.onUpdated.addListener(upsert);
    browser.contextualIdentities.onRemoved.addListener(({ contextualIdentity }) => {
      if (!contextualIdentity) return;
      const id = contextualIdentity.cookieStoreId;
      this.identities.delete(id);
      // Gone at once, no grace: its tabs are closing and it cannot come back.
      HS.forgetContainer(this.tracker, id);
      this.addresses.delete(id);
      this._armGraceTimer();
      if (this.enabled) this.schedule();
      this._forget(id).catch((e) => LOG.warn("highlighterSync: could not forget a deleted container", e));
    });
  },

  /** A deleted container loses its pin and remembered address. */
  async _forget(id) {
    const stored = await browser.storage.local.get({ [HS.PINS_KEY]: {}, [HS.LAST_ADDRESS_KEY]: {} });
    const pins = { ...stored[HS.PINS_KEY] };
    const last = { ...stored[HS.LAST_ADDRESS_KEY] };
    if (!(id in pins) && !(id in last)) return;

    delete pins[id];
    delete last[id];
    await browser.storage.local.set({ [HS.PINS_KEY]: pins, [HS.LAST_ADDRESS_KEY]: last });
  },

  async _loadIdentities() {
    try {
      const identities = await browser.contextualIdentities.query({});
      for (const identity of identities) {
        this.identities.set(identity.cookieStoreId, { name: identity.name, color: identity.color });
      }
    } catch (e) {
      LOG.warn("highlighterSync: could not read containers", e);
    }
  },
};

highlighterSync.init().catch((e) => LOG.error("highlighterSync: init failed", e));
