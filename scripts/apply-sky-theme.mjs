import fs from 'node:fs';

const cssPath = 'styles.css';
const css = fs.readFileSync(cssPath, 'utf8');
const theme = `
/* Moonlit Arcade — Sky Bird visual system v2 */
:root {
  --paper: #080B1A;
  --paper2: #111936;
  --ink: #F8FAFF;
  --ink2: #AAB7D6;
  --red: #FF5C8A;
  --accent-cyan: #55D6FF;
  --accent-violet: #9B8CFF;
  --accent-green: #42E6A4;
  --accent-yellow: #FFD166;
  --danger: #FF6B6B;
  --surface-soft: rgba(255,255,255,.07);
  --border-soft: rgba(170,183,214,.22);
}
html, body { background: var(--paper); }
body { color: var(--ink); font-family: 'DM Sans', 'Inter', system-ui, sans-serif; }
.panel, .authBox, #settingsOverlay .settingsCard, #pauseOverlay .pauseCard, #reviveOverlay .reviveCard { background: linear-gradient(145deg, #151E42 0%, #0F1630 100%); border-color: rgba(170,183,214,.42); box-shadow: 10px 10px 0 rgba(4,6,18,.45), 0 24px 70px rgba(4,6,18,.28); }
.panel::before { border-color: rgba(85,214,255,.20); }
.kanjiBg { color: var(--accent-cyan); opacity: .08; }
.kana, #runKj, #evBanner .kanji, .runLine .kj, .lbRow .rank, .selCard .kj { color: var(--accent-cyan); }
#combo, .newbest, .lbRow.me .nm, .lbRow.me b { color: var(--red); }
.sub, .best, .selLabel, .keys, .row, #bestHud, #runNo, #authState, #authMsg, .lbEmpty, .lbStatus, #homeLbStatus, #dataMsg, #reviveStatus, #reviveOverlay p, #pauseOverlay p { color: var(--ink2); }
.rule i { background: var(--border-soft); }
.rule b { background: var(--red); box-shadow: 0 0 14px rgba(255,92,138,.65); }
.btn { min-height: 44px; border-radius: 12px; border-color: rgba(170,183,214,.45); }
.btn:focus-visible, .nameRow input:focus { outline-color: var(--accent-cyan); }
.btn.solid { background: linear-gradient(135deg, var(--red), #FF7A66); color: #170A1B; border-color: transparent; box-shadow: 0 6px 0 #9C315C, 0 12px 26px rgba(255,92,138,.22); }
.btn.solid:hover { box-shadow: 0 8px 0 #9C315C, 0 16px 32px rgba(255,92,138,.28); }
.btn.ghost { background: rgba(255,255,255,.035); color: var(--ink); border-color: var(--border-soft); }
.btn.ghost:hover { background: rgba(85,214,255,.12); border-color: var(--accent-cyan); color: var(--ink); }
.selCard, #coinWallet, #localeSuggest, .account-card, .account-stats>div, .shop-wallet { background: var(--surface-soft); border-color: var(--border-soft); }
.selCard.on { background: linear-gradient(135deg, var(--accent-violet), #6B5CE7); border-color: var(--accent-violet); }
.selCard.on .kj, .selCard.on .nm, .selCard.on .meta { color: #fff; }
#coinWallet b, .shop-wallet b { color: var(--accent-yellow); }
#netDot i { background: #73809F; }
#netDot.on i { background: var(--accent-green); box-shadow: 0 0 10px rgba(66,230,164,.75); }
#evBanner, #pauseBtn, #muteBtn { background: #151E42; border-color: var(--border-soft); box-shadow: 4px 6px 0 rgba(4,6,18,.45); }
#evBar { background: rgba(170,183,214,.18); }
#evBarI { background: linear-gradient(90deg, var(--accent-cyan), var(--accent-violet)); }
.hanko { background: var(--red); color: #170A1B; box-shadow: 4px 5px 0 rgba(4,6,18,.5); }
#securityOverlay { background: rgba(5,7,20,.94); color: var(--ink); }
#securityOverlay .securityCard { border-color: var(--accent-cyan); }
#securityOverlay svg { color: var(--accent-cyan); }
#reviveAdBox { border-color: rgba(85,214,255,.48); }
.policy-links a { color: var(--accent-cyan); }
.android-app .feature-panel, .android-app .authBox { background: linear-gradient(145deg, #162554, #0D1734); border-color: rgba(85,214,255,.35); }
.android-app .account-avatar { background: var(--accent-cyan); color: #07101F; }
.ios-app .feature-panel, .ios-app .authBox { background: linear-gradient(145deg, #241D50, #111936); border-color: rgba(155,140,255,.38); }
.ios-app .account-avatar { background: var(--accent-violet); color: #fff; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
`;
if (!css.includes('Moonlit Arcade — Sky Bird visual system v2')) fs.writeFileSync(cssPath, `${css.trimEnd()}\n${theme}`);

const gamePath = 'game.js';
let game = fs.readFileSync(gamePath, 'utf8');
const replacements = new Map([
  ["var INK='#eaf6ff',PAPER='#07111f',RED='#29add5',RED_L='#63d4f2';", "var INK='#F8FAFF',PAPER='#080B1A',RED='#FF5C8A',RED_L='#55D6FF';"],
  ["ground:'#e7dbbe'", "ground:'#202B52'"], ["mtn:'74,68,54'", "mtn:'22,30,62'"],
  ["ground:'#d9c4a0'", "ground:'#27345E'"], ["mtn:'84,60,40'", "mtn:'35,29,78'"],
  ["ground:'#d8dde2'", "ground:'#25345C'"], ["mtn:'90,100,115'", "mtn:'36,47,88'"],
  ["ground:'#2a2535'", "ground:'#121A3A'"], ["mtn:'30,35,55'", "mtn:'12,17,43'"],
  ["ground:'#c4c8be'", "ground:'#263452'"], ["mtn:'60,65,60'", "mtn:'28,40,70'"],
  ["ground:'#182b3d'", "ground:'#101D3D'"], ["mtn:'25,48,66'", "mtn:'15,28,65'"],
]);
for (const [from, to] of replacements) game = game.replaceAll(from, to);
fs.writeFileSync(gamePath, game);
console.log('Applied Moonlit Arcade theme to styles.css and game.js');
