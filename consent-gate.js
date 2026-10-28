(function () {
  'use strict';

  var ads = window.adsbygoogle = window.adsbygoogle || [];
  ads.pauseAdRequests = 1;

  var config = window.SKY_ENV || {};
  var publisherId = String(config.ADSENSE_PUBLISHER_ID || '').trim().replace(/^ca-pub-/, '');
  var state = 'unknown';
  var mode = 'blocked';
  var listeners = [];
  var settled = false;

  /* Google ad crawlers must be able to load adsense.js, otherwise the page
     looks like it has no ad code and Google cannot match an ad to it.
     A crawler has no cookie jar and no personal data, and the CMP banner is
     not shown to it, so it is treated as "granted, non-personalized".
     The decision lives in memory only: it is never persisted, so a real
     visitor can never inherit it. The token list mirrors
     server/adsense-crawler.mjs and is checked by scripts/test-adsense-crawler.mjs. */
  var ADSENSE_CRAWLER_TOKENS = ['Mediapartners-Google', 'Google-Display-Ads-Bot', 'AdsBot-Google-Mobile', 'AdsBot-Google'];
  function isAdsenseCrawler(ua) {
    ua = String(ua || '');
    for (var i = 0; i < ADSENSE_CRAWLER_TOKENS.length; i++) {
      if (ua.indexOf(ADSENSE_CRAWLER_TOKENS[i]) !== -1) return true;
    }
    return false;
  }
  var isCrawler = isAdsenseCrawler(navigator.userAgent);

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
  else if (isCrawler) publish('granted', 'non-personalized');
  else {
    loadCmp();
    watchTcfApi();
  }
}());
