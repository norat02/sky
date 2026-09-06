(function () {
  'use strict';

  var native = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  var callbackScheme = (window.SKY_CONFIG && window.SKY_CONFIG.NATIVE_OAUTH_REDIRECT_SCHEME) || 'com.norat02.skybird';
  var callbackUrl = null;
  var callbackListeners = [];

  function notify(url) {
    if (!url) return;
    callbackUrl = url;
    callbackListeners.splice(0).forEach(function (listener) { listener(url); });
    window.dispatchEvent(new CustomEvent('sky-native-auth-callback', { detail: { url: url } }));
  }

  if (native) {
    var appPlugin = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (appPlugin && typeof appPlugin.addListener === 'function') {
      appPlugin.addListener('appUrlOpen', function (event) { notify(event && event.url); });
    }
  }

  window.SKY_NATIVE = {
    isNative: native,
    callbackScheme: callbackScheme,
    authRedirectUrl: function () { return callbackScheme + '://login-callback'; },
    getAuthCallback: function () { return callbackUrl; },
    onAuthCallback: function (listener) {
      if (callbackUrl) listener(callbackUrl);
      callbackListeners.push(listener);
      return function () { callbackListeners = callbackListeners.filter(function (item) { return item !== listener; }); };
    }
  };
}());
