/*************************************************************
 * API SHIM — makes google.script.run keep working after the
 * frontend moves off script.google.com and onto GitHub Pages.
 *
 * scripts.html / copilot.html are UNCHANGED. Every existing call
 * like:
 *   google.script.run.withSuccessHandler(fn).withFailureHandler(fn2).getHomeSummary()
 * keeps working exactly as before — this file just re-implements
 * "google.script.run" on top of fetch() against the Apps Script
 * Web App, which now also serves a small JSON API (see code.gs).
 *
 * SETUP: paste your Web App /exec URL below after deploying.
 *************************************************************/

var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwgKpoNgy-JHuqw_CVlQ9bThHm7xxAP1jO1H1l-uCim_JGueIsGVdSCQxjBPgIjugTA8g/exec';

// Functions that only read data — sent as GET (?fn=...&args=...).
var API_READ_FNS = [
  'getHomeSummary', 'getDailyEntry', 'checkDateHasData', 'getAnalysisPageData',
  'getMonthlyStats', 'getLifetimeSummary', 'getDropdowns', 'getPinStatus',
  'getGoals', 'getRawText', 'getTrend', 'getModeRadarStats', 'getDeepAnalytics'
];

// Security-sensitive reads that must NEVER be served from the client cache —
// getPinStatus has to reflect the server's current lock state on every single
// check, or a PIN set after the first page load would silently never be
// enforced (exactly the bug this fixes). Still a normal GET call, just never
// cached or reused.
var API_NO_CACHE_FNS = ['getPinStatus'];

// Functions that write data — sent as POST (text/plain body, to dodge
// the CORS preflight that Apps Script Web Apps can't answer).
var API_WRITE_FNS = [
  'saveDailyEntry', 'saveRawText', 'setGoals', 'setPin', 'clearPin', 'verifyPin'
];

var ALL_API_FNS = API_READ_FNS.concat(API_WRITE_FNS);

/*************************************************************
 * CLIENT-SIDE READ CACHE
 * Keeps the JSON result of every successful read call in memory
 * for this browser tab session. Switching pages calls the same
 * loadX() functions as before, which still call google.script.run
 * — but a cache hit here returns instantly with no network request,
 * so tab-switching feels as fast as Co-Pilot (which never fetches
 * at all). Cache lives only in memory: closing/reloading the page
 * clears it naturally, no stale data carried across sessions.
 * Cleared automatically after any successful write, and manually
 * via window.__friderCache.clear() (wired to the refresh button
 * and pull-to-refresh gesture in app.js).
 *************************************************************/
var _friderReadCache_ = {};
window.__friderCache = {
  clear: function () { _friderReadCache_ = {}; }
};

function makeScriptRunner_() {
  var successHandler = null;
  var failureHandler = null;

  var runner = {
    withSuccessHandler: function (fn) { successHandler = fn; return runner; },
    withFailureHandler: function (fn) { failureHandler = fn; return runner; },
    withUserObject: function () { return runner; } // accepted but unused, matches google.script.run's shape
  };

  ALL_API_FNS.forEach(function (name) {
    runner[name] = function () {
      var args = Array.prototype.slice.call(arguments);
      var isWrite = API_WRITE_FNS.indexOf(name) !== -1;
      var noCache = API_NO_CACHE_FNS.indexOf(name) !== -1;

      if (!isWrite && !noCache) {
        var cacheKey = name + ':' + JSON.stringify(args);
        if (Object.prototype.hasOwnProperty.call(_friderReadCache_, cacheKey)) {
          if (successHandler) successHandler(_friderReadCache_[cacheKey]);
          return;
        }
      }

      var req;
      if (isWrite) {
        req = fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ fn: name, args: args })
        });
      } else {
        var url = APPS_SCRIPT_URL
          + '?fn=' + encodeURIComponent(name)
          + '&args=' + encodeURIComponent(JSON.stringify(args));
        req = fetch(url);
      }

      req.then(function (res) { return res.json(); })
        .then(function (json) {
          if (json && json.ok) {
            if (isWrite) {
              // data changed on the server — every cached read is now stale
              window.__friderCache.clear();
            } else if (!noCache) {
              _friderReadCache_[name + ':' + JSON.stringify(args)] = json.result;
            }
            if (successHandler) successHandler(json.result);
          } else {
            var err = new Error((json && json.error) || 'ไม่ทราบสาเหตุ');
            if (failureHandler) failureHandler(err); else console.error(name, err);
          }
        })
        .catch(function (err) {
          if (failureHandler) failureHandler(err); else console.error(name, err);
        });
    };
  });

  return runner;
}

// google.script.run must be a fresh chainable object every time it's
// accessed, same as the real one — a getter recreates it on each read.
window.google = window.google || {};
window.google.script = window.google.script || {};
Object.defineProperty(window.google.script, 'run', {
  get: function () { return makeScriptRunner_(); },
  configurable: true
});
