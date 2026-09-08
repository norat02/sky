(function () {
  'use strict';
  var testMode = !!window.__SKY_E2E__;
  var ready = false;
  var booted = false;
  var lastHeartbeat = 0;
  var startedAt = Date.now();

  window.SKY_SECURITY_READY = true;
  window.SKY_SECURITY_VERSION = '1';
  window.SKY_SECURITY_HEARTBEAT = function () { lastHeartbeat = Date.now(); };

  function lock(reason) {
    if (testMode) return;
    window.SKY_SECURITY_BLOCKED = true;
    document.documentElement.classList.add('security-blocked');
    var overlay = document.getElementById('securityOverlay');
    if (overlay) {
      overlay.classList.add('show');
      var message = document.getElementById('securityMessage');
      if (message) message.textContent = reason || 'Hệ thống bảo vệ không hoạt động. Hãy tải lại ứng dụng.';
    }
    window.dispatchEvent(new CustomEvent('sky-security-blocked', { detail: { reason: reason } }));
  }

  function check() {
    if (testMode || window.SKY_SECURITY_BLOCKED) return;
    if (!window.SKY_SECURITY_READY || window.SKY_SECURITY_VERSION !== '1') {
      lock('Hệ thống chống hack đã bị thay đổi hoặc bị xóa. Không thể chơi.');
      return;
    }
    if (window.SKY_GAME_BOOTED === true) booted = true;
    if (!booted && Date.now() - startedAt > 5000) {
      lock('Game security runtime không khởi động. Không thể chơi.');
      return;
    }
    if (booted && lastHeartbeat && Date.now() - lastHeartbeat > 4000) lock('Anti-cheat heartbeat bị gián đoạn. Không thể chơi.');
    ready = true;
  }

  window.addEventListener('sky-security-ready', function () { ready = true; });
  setInterval(check, 1500);
  setTimeout(check, 5500);
}());
