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

// Functions that write data — sent as POST (text/plain body, to dodge
// the CORS preflight that Apps Script Web Apps can't answer).
var API_WRITE_FNS = [
  'saveDailyEntry', 'saveRawText', 'setGoals', 'setPin', 'clearPin', 'verifyPin'
];

var ALL_API_FNS = API_READ_FNS.concat(API_WRITE_FNS);

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
