(function () {
  'use strict';

  var ads = window.adsbygoogle = window.adsbygoogle || [];
  ads.pauseAdRequests = 1;

  var config = window.SKY_CONFIG || {};
  var publisherId = String(config.ADSENSE_PUBLISHER_ID || '').trim().replace(/^ca-pub-/, '');
  var state = 'unknown';
  var mode = 'blocked';
  var listeners = [];
  var settled = false;

  function publish(nextState, nextMode) {
    if (settled && state === nextState && mode === nextMode) return;
    state = nextState;
    mode = nextMode;
    if (nextState === 'granted' || nextState === 'denied') settled = true;
    var detail = { state: state, mode: mode, personalized: mode === 'personalized' };
    window.SKY_CONSENT.state = state;
    window.SKY_CONSENT.mode = mode;
    window.SKY_CONSENT.personalized = detail.personalized;
    listeners.splice(0).forEach(function (resolve) { resolve(detail); });
    window.dispatchEvent(new CustomEvent('sky-consent-change', { detail: detail }));
  }

  function hasUserChoice(tcData) {
    return tcData && (tcData.eventStatus === 'tcloaded' || tcData.eventStatus === 'useractioncomplete');
  }

  function inspectTcData(tcData) {
    if (!hasUserChoice(tcData)) return;
    var gdprApplies = tcData.gdprApplies;
    var purposeOne = !!(tcData.purpose && tcData.purpose.consents && tcData.purpose.consents['1']);
    var vendorConsent = !!(tcData.vendor && tcData.vendor.consents && tcData.vendor.consents['755']);
    if (gdprApplies === false) publish('granted', 'personalized');
    else if (purposeOne && vendorConsent) publish('granted', 'personalized');
    else publish('denied', 'non-personalized');
  }

  function watchTcfApi() {
    if (typeof window.__tcfapi === 'function') {
      window.__tcfapi('addEventListener', 2, function (tcData, success) {
        if (success) inspectTcData(tcData);
      });
      return true;
    }
    return false;
  }

  function loadCmp() {
    if (!publisherId || window.__SKY_E2E__) return;
    if (document.querySelector('script[data-google-cmp]')) return;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://fundingchoicesmessages.google.com/i/pub-' + encodeURIComponent(publisherId) + '?ers=1';
    script.dataset.googleCmp = 'true';
    script.onload = function () {
      var started = Date.now();
      (function poll() {
        if (watchTcfApi()) return;
        if (Date.now() - started < 10000) setTimeout(poll, 100);
      }());
    };
    script.onerror = function () {
      publish('denied', 'blocked');
    };
    document.head.appendChild(script);
  }

  window.SKY_CONSENT = {
    state: state,
    mode: mode,
    personalized: false,
    isReady: function () { return state === 'granted' || state === 'denied'; },
    canRequestAds: function () { return state === 'granted' && mode !== 'blocked'; },
    wait: function (resolve) {
      if (window.SKY_CONSENT.isReady()) resolve({ state: state, mode: mode, personalized: mode === 'personalized' });
      else listeners.push(resolve);
    },
    refresh: function () { watchTcfApi(); }
  };

  if (window.__SKY_E2E__) publish('granted', 'non-personalized');
  else {
    loadCmp();
    watchTcfApi();
  }
}());
