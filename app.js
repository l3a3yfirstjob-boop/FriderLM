/*************************************************************
 * API BRIDGE (เชื่อมต่อ GitHub Pages -> Google Apps Script)
 *************************************************************/
var CONFIG_API = {
  GAS_EXEC_URL: 'https://script.google.com/macros/s/AKfycbxmWKT9b1phdfoDxvLRjq2v-2UOclfFO-0m_er7-DKmQUVfUWP85Iv6AzlUln4lfBt7/exec'
};

var google = {
  script: {
    run: {
      _success: null,
      _failure: null,
      withSuccessHandler: function (fn) {
        var inst = Object.create(this);
        inst._success = fn;
        return inst;
      },
      withFailureHandler: function (fn) {
        var inst = Object.create(this);
        inst._failure = fn;
        return inst;
      },
      _invoke: function (action, payload, isPost) {
        var self = this;
        var url = CONFIG_API.GAS_EXEC_URL;
        if (!url || url === 'YOUR_GAS_WEB_APP_URL_HERE') {
          console.warn('⚠️ ยังไม่ได้ตั้งค่า CONFIG_API.GAS_EXEC_URL ใน app.js');
          if (self._failure) self._failure(new Error('ยังไม่ได้ตั้งค่า Web App URL'));
          return;
        }

        var opts = {};
        if (isPost) {
          opts = {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: action }, payload || {}))
          };
        } else {
          var qs = '?action=' + encodeURIComponent(action);
          if (payload) {
            Object.keys(payload).forEach(function (k) {
              qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]);
            });
          }
          url += qs;
          opts = { method: 'GET', mode: 'cors' };
        }

        fetch(url, opts)
          .then(function (res) { return res.json(); })
          .then(function (resData) {
            if (resData && resData.error) {
              if (self._failure) self._failure(new Error(resData.error));
            } else {
              if (self._success) self._success(resData);
            }
          })
          .catch(function (err) {
            if (self._failure) self._failure(err);
          });
      },
      getDropdowns: function () { this._invoke('getDropdowns', null, false); },
      getPinStatus: function () { this._invoke('getPinStatus', null, false); },
      getGoals: function () { this._invoke('getGoals', null, false); },
      setGoals: function (goals) { this._invoke('setGoals', { goals: goals }, true); },
      setPin: function (oldPin, newPin) { this._invoke('setPin', { oldPin: oldPin, newPin: newPin }, true); },
      clearPin: function (oldPin) { this._invoke('clearPin', { oldPin: oldPin }, true); },
      verifyPin: function (pin) { this._invoke('verifyPin', { pin: pin }, true); },
      getHomeSummary: function () { this._invoke('getHomeSummary', null, false); },
      getDailyEntry: function (dateStr) { this._invoke('getDailyEntry', { dateStr: dateStr }, false); },
      saveDailyEntry: function (dateStr, payload) { this._invoke('saveDailyEntry', { dateStr: dateStr, payload: payload }, true); },
      getRawText: function (dateStr) { this._invoke('getRawText', { dateStr: dateStr }, false); },
      saveRawText: function (dateStr, rawText) { this._invoke('saveRawText', { dateStr: dateStr, rawText: rawText }, true); },
      getAnalysisPageData: function (dateStr) { this._invoke('getAnalysisPageData', { dateStr: dateStr }, false); },
      getMonthlyStats: function (month, year) { this._invoke('getMonthlyStats', { month: month, year: year }, false); },
      getLifetimeSummary: function () { this._invoke('getLifetimeSummary', null, false); }
    }
  }
};
