(function () {
  'use strict';

  var app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
<div id="netDot"><i></i><span id="netTxt" data-i18n="connecting">đang kết nối…</span></div>
<div id="hud" class="hidden"><div id="score">0</div><div id="bestHud">kỷ lục · —</div><div id="combo" aria-live="polite"></div></div>
<div id="runTag" class="hidden"><span id="runNo">ván 01</span><span id="runKj">霧朝</span><span id="runVn">sương sớm</span></div>
<div id="evBanner"><span class="kanji" id="evKanji">風</span><div><b id="evName"></b><i id="evDesc"></i><div id="evBar"><i id="evBarI"></i></div></div></div>
<div id="hint" class="hidden"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14l7-7 7 7"/></svg><span data-i18n="touchHint">chạm để vỗ cánh</span></div>
<div class="screen" id="titleScreen">
  <div class="kanjiBg" aria-hidden="true">飛</div>
  <div class="panel home-panel">
    <div class="home-primary">
      <div class="kana">CHUYẾN BAY BẦU TRỜI</div>
      <h1 data-i18n="title">SKY BIRD</h1>
      <div class="rule"><i></i><b></b><i></i></div>
      <p class="sub" data-i18n="subtitle">một chuyến bay qua trời hoa anh đào</p>
      <div class="hero-stats"><div class="hero-stat"><span class="stat-label">kỷ lục</span><span class="stat-value best" id="bestTitle" data-i18n="noRecord">chưa có</span></div><div class="hero-stat"><span class="stat-label">ván đã bay</span><span class="stat-value best" id="runsTitle"></span></div><div class="hero-stat coin-stat"><span class="stat-label">ví coin</span><span class="stat-value" id="coinWallet" aria-live="polite"><b id="coinCount">0</b> coin</span></div></div>
      <div class="selector"><div class="selLabel" data-i18n="bird">chim / cửa hàng</div><div class="selGrid" id="charGrid"></div><div id="shopMsg" class="shop-msg" aria-live="polite"></div></div>
      <div class="selector"><div class="selLabel" data-i18n="sky">trời</div><div class="selGrid" id="mapGrid"></div></div>
      <div class="home-actions"><button class="btn solid" id="startBtn" data-i18n="start">bắt đầu bay</button><br><button class="btn ghost" id="lbBtn" data-i18n="leaderboard">bảng thiên hạ</button><br><button class="btn ghost" id="settingsBtn" data-i18n="settings">cài đặt</button></div>
    </div>
    <aside class="home-side">
      <section class="rules-card" aria-labelledby="rulesTitle"><div class="rail-kicker">luật bay / fair play</div><h3 id="rulesTitle">Bay sạch, bay xa</h3><ul class="rules-list"><li><span class="rule-icon" aria-hidden="true">01</span><span>Chạm hoặc nhấn Space để vỗ cánh; vượt mỗi cặp ống được cộng 1 điểm.</span></li><li><span class="rule-icon" aria-hidden="true">02</span><span>Thu coin trên đường bay; cuối ván nhận thêm <b>1 coin / 10 điểm</b>, chỉ tính một lần.</span></li><li><span class="rule-icon" aria-hidden="true">03</span><span>Mỗi ván chỉ có một lượt hồi sinh hợp lệ; điểm online được máy chủ kiểm tra.</span></li></ul><div class="protection-status" id="protectionStatus"><i aria-hidden="true"></i><span>lớp bảo vệ phiên đang hoạt động</span></div></section>
      <div id="homeLeaderboard"><h3 data-i18n="onlineLeaderboard">bảng trực tuyến</h3><div class="lbWrap" id="homeLb"></div><div id="homeLbStatus" data-i18n="preparing">đang chuẩn bị…</div></div>
      <div id="localeSuggest" class="hidden"><span id="localeSuggestText"></span><button class="btn ghost" id="localeSuggestApply" data-i18n="apply">áp dụng</button><button class="btn ghost" id="localeSuggestDismiss" data-i18n="dismiss">bỏ qua</button></div>
      <div id="dataTools"><div class="selLabel" data-i18n="playerData">dữ liệu người chơi</div><button class="btn ghost" id="exportBtn" data-i18n="exportBackup">xuất backup</button><button class="btn ghost" id="importBtn" data-i18n="importBackup">nhập backup</button><input id="importFile" type="file" accept="application/json,.json" hidden><div id="dataMsg"></div></div>
      <div class="keys"><kbd>SPACE</kbd>hoặc chạm màn hình</div>
      <div id="authPanel"><div id="authState" data-i18n="offlineLogin">chơi offline — đăng nhập để lưu điểm online</div><button class="btn ghost" id="authOpen" data-i18n="login">đăng nhập</button><button class="btn ghost hidden" id="authLogout" data-i18n="logout">đăng xuất</button></div>
      <nav class="policy-links" aria-label="Chính sách website"><a href="privacy-policy.html">Privacy Policy</a><a href="terms-of-use.html">Terms of Use</a></nav>
    </aside>
  </div>
</div>
<div class="screen hidden" id="overScreen"><div class="panel"><div class="hanko" aria-hidden="true">終</div><div class="kana">旅の終わり</div><h2 data-i18n="complete">HOÀN TẤT</h2><div class="rows"><div class="row"><span data-i18n="score">điểm</span><span class="dots"></span><b id="finalScore">0</b></div><div class="row"><span data-i18n="record">kỷ lục</span><span class="dots"></span><b id="finalBest">0</b></div></div><div class="newbest hidden" id="newBest" data-i18n="newRecord">— kỷ lục mới —</div><div class="runLine" id="overRun"><span class="kj" id="overRunKj"></span><span id="overRunVn"></span></div><div class="nameRow" id="nameRow"><input id="nameInput" maxlength="10" placeholder="tên người bay" data-i18n-placeholder="namePlaceholder" autocomplete="off" spellcheck="false"><button class="btn solid small" id="sendBtn" data-i18n="submitScore">ghi danh</button></div><div class="lbWrap" id="miniLb"></div><div class="lbStatus" id="lbStatus"></div><div><button class="btn solid" id="retryBtn" data-i18n="retry">bay lại</button><br><button class="btn ghost" id="homeBtn" data-i18n="home">màn chính</button></div></div></div>
<div class="authModal hidden" id="authModal"><div class="authBox"><div class="kana">旅人</div><h2 data-i18n="authTitle">TÀI KHOẢN</h2><p class="sub" data-i18n="authSubtitle">Đăng nhập để ghi danh bảng thiên hạ</p><input id="authEmail" type="email" autocomplete="email" placeholder="email" data-i18n-placeholder="email"><input id="authPassword" type="password" autocomplete="current-password" placeholder="mật khẩu" data-i18n-placeholder="password"><div class="authActions"><button class="btn solid" id="emailLogin" data-i18n="login">đăng nhập</button><button class="btn ghost" id="emailSignup" data-i18n="signup">tạo tài khoản</button><button class="btn ghost" id="googleLogin" data-i18n="google">Google</button><button class="btn ghost" id="authClose" data-i18n="close">đóng</button></div><div id="authMsg"></div></div></div>
<div id="settingsOverlay"><div class="settingsCard"><div class="kana">設定</div><h2 data-i18n="settings">CÀI ĐẶT</h2><label for="languageSelect" data-i18n="language">ngôn ngữ</label><select id="languageSelect" aria-label="language"><option value="vi">Tiếng Việt</option><option value="en">English</option><option value="ja">日本語</option></select><label for="volumeRange" data-i18n="volume">âm lượng</label><div class="volumeControl"><input id="volumeRange" type="range" min="0" max="100" step="1" value="50" aria-label="volume"><output id="volumeValue">50%</output></div><button class="btn ghost" id="muteToggle" type="button" data-i18n="mute">tắt âm thanh</button><div><button class="btn ghost" id="settingsClose" data-i18n="close">đóng</button></div></div></div>
<div class="screen hidden" id="lbScreen"><div class="panel"><div class="kana">順位表</div><h2>BẢNG THIÊN HẠ</h2><div class="rule"><i></i><b></b><i></i></div><div class="lbWrap" id="fullLb"></div><div class="lbStatus" id="fullStatus"></div><div style="margin-top:12px"><button class="btn ghost" id="lbClose" data-i18n="close">đóng</button></div></div></div>
<button id="pauseBtn" aria-label="tạm dừng game">Ⅱ</button>
<div id="pauseOverlay"><div class="pauseCard"><div class="kana">休止</div><h2 data-i18n="pauseTitle"> TẠM DỪNG</h2><p data-i18n="pauseHint">Nhấn P hoặc nút tiếp tục để bay lại</p><button class="btn solid" id="resumeBtn" data-i18n="resume">tiếp tục</button></div></div>
<div id="reviveOverlay"><div class="reviveCard"><div class="kana">再生</div><h2 data-i18n="reviveTitle">HỒI SINH?</h2><p data-i18n="reviveHint">Xem quảng cáo hợp lệ để tiếp tục ván này một lần.</p><div id="reviveAdBox" data-i18n="adArea">khu vực quảng cáo</div><button class="btn solid" id="reviveAdBtn" data-i18n="watchAd">xem quảng cáo</button><button class="btn ghost" id="reviveSkip" data-i18n="endFlight">kết thúc ván</button><div id="reviveStatus"></div></div></div>
<div id="securityOverlay" role="alertdialog" aria-modal="true" aria-labelledby="securityTitle"><div class="securityCard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-3z"/><path d="M12 8v4M12 16h.01"/></svg><h2 id="securityTitle">Phiên chơi đã bị khóa</h2><p id="securityMessage">Phát hiện môi trường không an toàn. Hãy đóng công cụ debug và tải lại trang.</p></div></div>
`;
})();
