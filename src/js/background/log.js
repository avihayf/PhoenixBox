/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const LOG_DEBUG = false;

// eslint-disable-next-line no-unused-vars
const LOG = {
  error(...args) { if (LOG_DEBUG) { console.error(...args); } },
  warn(...args)  { if (LOG_DEBUG) { console.warn(...args);  } },
};
