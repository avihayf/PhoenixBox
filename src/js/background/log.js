/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const LOG_DEBUG = false;

// Errors always reach the background console. Gating them behind LOG_DEBUG
// meant every failure in a shipped build — a proxy that could not be
// reloaded, a scan that failed — left no trace anywhere to diagnose it.
// Warnings stay debug-only: several fire routinely (a tab closed mid-lookup).
// eslint-disable-next-line no-unused-vars
const LOG = {
  error(...args) { console.error(...args); },
  warn(...args)  { if (LOG_DEBUG) { console.warn(...args);  } },
};
