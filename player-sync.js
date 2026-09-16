(function () {
  'use strict';
  var env = window.SKY_ENV || {};
  var supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  var anonKey = String(env.SUPABASE_ANON_KEY || '');
  var client = null;
  var userId = '';
  var timer = null;
  var lastSnapshot = '';
  var syncing = false;
  var initialised = false;
  var KEYS = { name:'chimse.name', best:'chimse.best', runs:'chimse.runs', coins:'chimse.coins', unlocked:'chimse.unlocked-characters', char:'chimse.char', map:'chimse.map', lang:'chimse.lang', volume:'chimse.volume', mute:'chimse.mute' };
  function read(key, fallback) { try { var value = localStorage.getItem(key); return value === null ? fallback : value; } catch (_) { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) {} }
  function json(key, fallback) { try { var value = JSON.parse(read(key, JSON.stringify(fallback))); return value; } catch (_) { return fallback; } }
  function number(key, fallback, min, max) { var value = Number(read(key, fallback)); return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback; }
  function snapshot() {
    var unlocked = json(KEYS.unlocked, []); if (!Array.isArray(unlocked)) unlocked = [];
    var rawVolume=Number(read(KEYS.volume, 0.5));if(rawVolume<=1)rawVolume*=100;
    return { display_name: read(KEYS.name, '').slice(0, 32), best_score:number(KEYS.best, 0, 0, 100000), flights:number(KEYS.runs, 0, 0, 100000000), coins:number(KEYS.coins, 0, 0, 1000000), unlocked_characters:unlocked.filter(function (x) { return typeof x === 'string'; }).slice(0, 64), selected_character:read(KEYS.char, 'tit'), selected_map:read(KEYS.map, 'sakura'), language:read(KEYS.lang, 'vi').slice(0, 8), volume:Number.isFinite(rawVolume)?Math.max(0,Math.min(100,Math.round(rawVolume))):50, muted:read(KEYS.mute, 'false') === 'true' || read(KEYS.mute, 'false') === '1' };
  }
  function apply(profile) {
    if (!profile) return;
    write(KEYS.name, profile.display_name || ''); write(KEYS.best, profile.best_score || 0); write(KEYS.runs, profile.flights || 0); write(KEYS.coins, profile.coins || 0); write(KEYS.unlocked, JSON.stringify(Array.isArray(profile.unlocked_characters) ? profile.unlocked_characters : [])); write(KEYS.char, profile.selected_character || 'tit'); write(KEYS.map, profile.selected_map || 'sakura'); write(KEYS.lang, profile.language || 'vi'); write(KEYS.volume, profile.volume ?? 50); write(KEYS.mute, profile.muted ? 'true' : 'false');
    lastSnapshot = JSON.stringify(snapshot());
    window.dispatchEvent(new CustomEvent('sky-profile-sync', { detail: { profile: profile, source: 'cloud' } }));
  }
  function localProfile() { return snapshot(); }
  function upload(force) {
    if (!client || !userId || syncing) return Promise.resolve();
    var current = snapshot(), encoded = JSON.stringify(current);
    if (!force && encoded === lastSnapshot) return Promise.resolve();
    syncing = true;
    return client.from('player_profiles').upsert(Object.assign({ user_id: userId, updated_at: new Date().toISOString() }, current), { onConflict: 'user_id' }).then(function (result) { if (result.error) throw result.error; lastSnapshot = encoded; }).catch(function () {}).finally(function () { syncing = false; });
  }
  function load() {
    if (!client || !userId) return Promise.resolve();
    return client.from('player_profiles').select('*').eq('user_id', userId).maybeSingle().then(function (result) {
      if (result.error) throw result.error;
      if (result.data) apply(result.data); else return upload(true);
    }).catch(function () {});
  }
  function onSession(session) {
    var nextId = session && session.user && session.user.id || '';
    if (!nextId) { userId = ''; lastSnapshot = ''; if (timer) { clearInterval(timer); timer = null; } return; }
    userId = nextId; load().then(function () { if (!timer) timer = setInterval(function () { upload(false); }, 5000); });
  }
  function init() {
    if (initialised || !supabaseUrl || !anonKey || window.__SKY_E2E__) return;
    initialised = true;
    import('https://esm.sh/@supabase/supabase-js@2').then(function (mod) { if (!mod || !mod.createClient) throw new Error('supabase'); client = mod.createClient(supabaseUrl, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }); client.auth.onAuthStateChange(function (_, session) { onSession(session); }); return client.auth.getSession(); }).then(function (result) { onSession(result.data && result.data.session); });
    window.addEventListener('sky-profile-dirty', function () { upload(false); });
    window.addEventListener('beforeunload', function () { upload(false); });
  }
  window.SKY_PROFILE_SYNC = { init: init, markDirty: function () { window.dispatchEvent(new Event('sky-profile-dirty')); }, snapshot: snapshot };
  window.addEventListener('load', init, { once: true });
}());
