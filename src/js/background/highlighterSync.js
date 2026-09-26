/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Keeps the PhoenixBox Highlighter JAR in step with the containers marked for
 * highlighting, and tells the proxy handler which Burp listener each marked
 * container's traffic should go to.
 *
 * Every sync sends the full list of marks, so a lost request or a restart on
 * either side is repaired by the next one; a 30 s heartbeat also keeps the
 * JAR's lease alive. Only listeners the JAR reports as up are ever routed to.
 *
 * Decisions live in shared/highlighterSyncHelpers.js, which is unit tested.
 */

const HS = PhoenixBoxHighlighterSyncHelpers;

const HEARTBEAT_MS = 30_000;
const DEBOUNCE_MS = 300;
const REQUEST_TIMEOUT_MS = 5_000;
// How long a request from a just-marked container waits for its listener
// before going to the preset unhighlighted.
const FIRST_REQUEST_WAIT_MS = 500;

const highlighterSync = {
  /** @type {Set<string>} */
  marks: new Set(),
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
  _lastStatus: null,
  _inFlight: false,
  _again: false,
  /** Resolves when the next sync finishes; null when none is scheduled. */
  _nextSync: null,
  _resolveNextSync: null,

  async init() {
    await browser.storage.local.remove(HS.RETIRED_KEYS);

    const stored = await browser.storage.local.get({
      [HS.MARKS_KEY]: [],
      [HS.PINS_KEY]: {},
      [HS.LAST_ADDRESS_KEY]: {},
      [HS.PAIRING_KEY]: null,
      customProxyPresets: [],
    });
    this.marks = new Set(HS.sanitizeMarks(stored[HS.MARKS_KEY]));
    this.pins = stored[HS.PINS_KEY] || {};
    this.lastAddresses = stored[HS.LAST_ADDRESS_KEY] || {};
    this.pairing = this._readPairing(stored[HS.PAIRING_KEY]);
    this.burpPreset = HS.burpPresetFrom(stored.customProxyPresets);

    this._watchSettings();
    this._watchContainers();
    await this._loadIdentities();

    setInterval(() => this.schedule(0), HEARTBEAT_MS);
    this.schedule(0);
  },

  /**
   * The proxy for a request PhoenixBox has already routed. A marked container
   * going to the Burp preset is sent to its own listener instead, with the
   * preset as failover; everything else is returned unchanged.
   */
  async route(cookieStoreId, proxy) {
    if (!this.pairing || !this.marks.has(cookieStoreId) || !HS.isBurpRoute(proxy, this.burpPreset)) {
      return proxy;
    }

    let address = this.addresses.get(cookieStoreId);
    if (!address && this._nextSync) {
      await Promise.race([this._nextSync, new Promise((resolve) => setTimeout(resolve, FIRST_REQUEST_WAIT_MS))]);
      address = this.addresses.get(cookieStoreId);
    }
    return address ? HS.highlightedRoute(proxy, address) : proxy;
  },

  /** Coalesces bursts of changes (e.g. marking several containers) into one sync. */
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
    this._nextSync = null;
    this._resolveNextSync = null;

    try {
      await this._syncOnce();
    } catch (e) {
      LOG.warn("highlighterSync: sync failed", e);
    } finally {
      this._inFlight = false;
      if (resolve) resolve();
      if (this._again) {
        this._again = false;
        this.schedule(0);
      }
    }
  },

  async _syncOnce() {
    if (!this.pairing) {
      this.addresses = new Map();
      await this._writeStatus({ state: "unpaired" });
      return;
    }

    const endpoint = HS.controlEndpoint(this.pairing, this.burpPreset);
    const body = HS.buildSyncBody({
      burpPreset: this.burpPreset,
      marks: [...this.marks],
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
      return;
    }

    if (!response.ok) {
      this.addresses = new Map();
      const message = response.status === 401
        ? "Burp rejected the pairing token. Copy the pairing string from Burp's PhoenixBox tab again."
        : `The Highlighter refused the sync (HTTP ${response.status}).`;
      await this._writeStatus({ state: "error", message });
      return;
    }

    const parsed = HS.parseSyncResponse(await response.json().catch(() => null));
    if (!parsed) {
      this.addresses = new Map();
      await this._writeStatus({ state: "error", message: "The Highlighter's reply was not understood. Update the JAR." });
      return;
    }

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
   * On unpairing, tells the JAR to close every listener now rather than when
   * its lease runs out. Best effort: the lease still closes them if this fails.
   */
  async _closeListeners(pairing) {
    const endpoint = HS.controlEndpoint(pairing, this.burpPreset);
    await fetch(`http://${endpoint}/v1/sync`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${pairing.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(HS.buildSyncBody({ burpPreset: this.burpPreset, marks: [], identities: new Map() })),
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
   * disk, and wake every open popup, every 30 seconds for nothing.
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

      if (HS.MARKS_KEY in changes) {
        this.marks = new Set(HS.sanitizeMarks(changes[HS.MARKS_KEY].newValue));
        // An unmarked container stops being routed to its listener at once,
        // before the JAR has even been told to close it.
        for (const id of [...this.addresses.keys()]) {
          if (!this.marks.has(id)) this.addresses.delete(id);
        }
        resync = true;
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
      if (changed && this.marks.has(contextualIdentity.cookieStoreId)) this.schedule();
    };

    browser.contextualIdentities.onCreated.addListener(upsert);
    browser.contextualIdentities.onUpdated.addListener(upsert);
    browser.contextualIdentities.onRemoved.addListener(({ contextualIdentity }) => {
      if (!contextualIdentity) return;
      const id = contextualIdentity.cookieStoreId;
      this.identities.delete(id);
      this._forget(id).catch((e) => LOG.warn("highlighterSync: could not forget a deleted container", e));
    });
  },

  /** A deleted container loses its mark, pin and remembered address. */
  async _forget(id) {
    const stored = await browser.storage.local.get({
      [HS.MARKS_KEY]: [], [HS.PINS_KEY]: {}, [HS.LAST_ADDRESS_KEY]: {},
    });
    const marks = HS.sanitizeMarks(stored[HS.MARKS_KEY]);
    const pins = { ...stored[HS.PINS_KEY] };
    const last = { ...stored[HS.LAST_ADDRESS_KEY] };
    if (!marks.includes(id) && !(id in pins) && !(id in last)) return;

    delete pins[id];
    delete last[id];
    await browser.storage.local.set({
      [HS.MARKS_KEY]: marks.filter((m) => m !== id),
      [HS.PINS_KEY]: pins,
      [HS.LAST_ADDRESS_KEY]: last,
    });
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
