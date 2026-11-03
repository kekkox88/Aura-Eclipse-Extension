
// Tigro Vault account manager: persistent credential overrides, legacy settings fallback.
var TIGRO_VAULT_KEYS = ["eclipseUrl","qobuzPersonalToken1","qobuzPersonalAppId1","qobuzPersonalAppSecret1","qobuzPersonalToken2","qobuzPersonalAppId2","qobuzPersonalAppSecret2","qobuzPersonalToken3","qobuzPersonalAppId3","qobuzPersonalAppSecret3","eclipseUrl2","eclipseUrl3"];
function tigroVaultSetting(key){
  if(TIGRO_VAULT_KEYS.indexOf(key)<0)return myspoti.settings.get(key);
  try{var v=myspoti.storage.get('tigro_vault_account_v1_'+key);if(typeof v==='string'&&v.length>0)return v;}catch(e){}
  return myspoti.settings.get(key);
}
var AURA_DEV_LOGS = function(){ try { var v=myspoti.settings.get('devLogs'); return v===true || String(v)==='true'; }catch(e){return false;} };
var AURA_DEV_WRITE = function(m){if(!AURA_DEV_LOGS())return;try{var t=String(m).replace(/https?:\/\/[^\s'"<>]+/g,'[URL]').replace(/(arl|token|authorization|cookie|secret|session|password)\s*[:=]\s*[^\s,;]+/gi,'$1=[redacted]');myspoti.log('[Aura DEV] '+t.slice(0,300));}catch(e){}};

// ArchiveTune JioSaavn isolated final fallback (Mauro / solidsnakeater): DES decoder preserved.
var AURA_JIOSAAVN = (function(){
  var B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function base64ToBytes(b64) {
    var clean = String(b64 || '').replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (clean.length % 4 !== 0) clean += '=';
    var out = [];
    for (var i = 0; i < clean.length; i += 4) {
      var c0 = B64_STD.indexOf(clean.charAt(i));
      var c1 = B64_STD.indexOf(clean.charAt(i + 1));
      var c2 = clean.charAt(i + 2) === '=' ? -1 : B64_STD.indexOf(clean.charAt(i + 2));
      var c3 = clean.charAt(i + 3) === '=' ? -1 : B64_STD.indexOf(clean.charAt(i + 3));
      if (c0 < 0 || c1 < 0) break;
      var n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
      out.push((n >> 16) & 255);
      if (c2 >= 0) out.push((n >> 8) & 255);
      if (c3 >= 0) out.push(n & 255);
    }
    return out;
  }

  function bytesToBase64(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i] & 255;
      var has1 = i + 1 < bytes.length;
      var has2 = i + 2 < bytes.length;
      var b1 = has1 ? (bytes[i + 1] & 255) : 0;
      var b2 = has2 ? (bytes[i + 2] & 255) : 0;
      var n = (b0 << 16) | (b1 << 8) | b2;
      out += B64_STD.charAt((n >> 18) & 63);
      out += B64_STD.charAt((n >> 12) & 63);
      out += has1 ? B64_STD.charAt((n >> 6) & 63) : '=';
      out += has2 ? B64_STD.charAt(n & 63) : '=';
    }
    return out;
  }

  function hexToBytes(hex) {
    var s = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
    var out = [];
    for (var i = 0; i + 1 < s.length; i += 2) {
      out.push(parseInt(s.substring(i, i + 2), 16) & 255);
    }
    return out;
  }

  function b64urlFromHex(hex) {
    return bytesToBase64(hexToBytes(hex))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function randomHex(byteCount) {
    var s = '';
    for (var i = 0; i < byteCount; i++) {
      var b = Math.floor(Math.random() * 256);
      s += (b < 16 ? '0' : '') + b.toString(16);
    }
    return s;
  }

  function bytesToUtf8(bytes) {
    var out = '';
    var i = 0;
    while (i < bytes.length) {
      var b0 = bytes[i++] & 255;
      if (b0 < 0x80) {
        out += String.fromCharCode(b0);
      } else if ((b0 & 0xe0) === 0xc0 && i < bytes.length) {
        var b1 = bytes[i++] & 255;
        out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      } else if ((b0 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
        var c1 = bytes[i++] & 255;
        var c2 = bytes[i++] & 255;
        out += String.fromCharCode(((b0 & 0x0f) << 12) | ((c1 & 0x3f) << 6) | (c2 & 0x3f));
      } else if ((b0 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
        var d1 = bytes[i++] & 255;
        var d2 = bytes[i++] & 255;
        var d3 = bytes[i++] & 255;
        var cp = (((b0 & 0x07) << 18) | ((d1 & 0x3f) << 12) | ((d2 & 0x3f) << 6) | (d3 & 0x3f)) - 0x10000;
        out += String.fromCharCode(0xd800 + ((cp >> 10) & 0x3ff), 0xdc00 + (cp & 0x3ff));
      }
    }
    return out;
  }

  function pkcePair() {
    var verifier = b64urlFromHex(randomHex(32));
    var challenge = b64urlFromHex(myspoti.util.sha256(verifier));
    return { verifier: verifier, challenge: challenge };
  }

  // ── Pure-JS DES-ECB Decryptor for JioSaavn (`SaavnService.kt`, key "38346591")

  var DES_IP = [
    58,50,42,34,26,18,10,2, 60,52,44,36,28,20,12,4,
    62,54,46,38,30,22,14,6, 64,56,48,40,32,24,16,8,
    57,49,41,33,25,17,9,1,  59,51,43,35,27,19,11,3,
    61,53,45,37,29,21,13,5, 63,55,47,39,31,23,15,7
  ];
  var DES_FP = [
    40,8,48,16,56,24,64,32, 39,7,47,15,55,23,63,31,
    38,6,46,14,54,22,62,30, 37,5,45,13,53,21,61,29,
    36,4,44,12,52,20,60,28, 35,3,43,11,51,19,59,27,
    34,2,42,10,50,18,58,26, 33,1,41,9,49,17,57,25
  ];
  var DES_E = [
    32,1,2,3,4,5,     4,5,6,7,8,9,
    8,9,10,11,12,13,  12,13,14,15,16,17,
    16,17,18,19,20,21,20,21,22,23,24,25,
    24,25,26,27,28,29,28,29,30,31,32,1
  ];
  var DES_P = [
    16,7,20,21,29,12,28,17, 1,15,23,26,5,18,31,10,
    2,8,24,14,32,27,3,9,    19,13,30,6,22,11,4,25
  ];
  var DES_PC1 = [
    57,49,41,33,25,17,9,  1,58,50,42,34,26,18,
    10,2,59,51,43,35,27,  19,11,3,60,52,44,36,
    63,55,47,39,31,23,15, 7,62,54,46,38,30,22,
    14,6,61,53,45,37,29,  21,13,5,28,20,12,4
  ];
  var DES_PC2 = [
    14,17,11,24,1,5,   3,28,15,6,21,10,
    23,19,12,4,26,8,   16,7,27,20,13,2,
    41,52,31,37,47,55, 30,40,51,45,33,48,
    44,49,39,56,34,53, 46,42,50,36,29,32
  ];
  var DES_SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
  var DES_SBOX = [
    [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7, 0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8, 4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0, 15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
    [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10, 3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5, 0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15, 13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
    [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8, 13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1, 13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7, 1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
    [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15, 13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9, 10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4, 3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
    [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9, 14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6, 4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14, 11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
    [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11, 10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8, 9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6, 4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
    [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1, 13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6, 1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2, 6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
    [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7, 1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2, 7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8, 2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
  ];

  function desBytesToBits(bytes, offset, len) {
    var bits = [];
    for (var i = 0; i < len; i++) {
      var b = bytes[offset + i] & 255;
      for (var bit = 7; bit >= 0; bit--) bits.push((b >> bit) & 1);
    }
    return bits;
  }

  function desBitsToBytes(bits) {
    var out = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] & 1);
      out.push(b);
    }
    return out;
  }

  function desPermute(bits, table) {
    var out = new Array(table.length);
    for (var i = 0; i < table.length; i++) out[i] = bits[table[i] - 1];
    return out;
  }

  function desRotLeft28(arr, n) {
    return arr.slice(n).concat(arr.slice(0, n));
  }

  function desSubkeys(asciiKey8) {
    var keyBytes = [];
    for (var i = 0; i < 8; i++) keyBytes.push(asciiKey8.charCodeAt(i) & 255);
    var k56 = desPermute(desBytesToBits(keyBytes, 0, 8), DES_PC1);
    var c = k56.slice(0, 28);
    var d = k56.slice(28, 56);
    var subkeys = [];
    for (var r = 0; r < 16; r++) {
      c = desRotLeft28(c, DES_SHIFTS[r]);
      d = desRotLeft28(d, DES_SHIFTS[r]);
      subkeys.push(desPermute(c.concat(d), DES_PC2));
    }
    return subkeys;
  }

  var SAAVN_SUBKEYS = null;

  function desDecryptBlock(blockBits, subkeys) {
    var perm = desPermute(blockBits, DES_IP);
    var l = perm.slice(0, 32);
    var r = perm.slice(32, 64);
    for (var round = 15; round >= 0; round--) {
      var expR = desPermute(r, DES_E);
      var k = subkeys[round];
      var sOut = [];
      for (var s = 0; s < 8; s++) {
        var off = s * 6;
        var b0 = expR[off] ^ k[off];
        var b1 = expR[off + 1] ^ k[off + 1];
        var b2 = expR[off + 2] ^ k[off + 2];
        var b3 = expR[off + 3] ^ k[off + 3];
        var b4 = expR[off + 4] ^ k[off + 4];
        var b5 = expR[off + 5] ^ k[off + 5];
        var row = (b0 << 1) | b5;
        var col = (b1 << 3) | (b2 << 2) | (b3 << 1) | b4;
        var val = DES_SBOX[s][row * 16 + col];
        sOut.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
      }
      var f = desPermute(sOut, DES_P);
      var nextR = new Array(32);
      for (var x = 0; x < 32; x++) nextR[x] = l[x] ^ f[x];
      l = r;
      r = nextR;
    }
    return desPermute(r.concat(l), DES_FP);
  }

  function saavnDecryptUrl(encryptedBase64) {
    if (!encryptedBase64) return '';
    var cipher = base64ToBytes(encryptedBase64);
    if (!cipher.length || cipher.length % 8 !== 0) return '';
    if (!SAAVN_SUBKEYS) SAAVN_SUBKEYS = desSubkeys('38346591');
    var plainBytes = [];
    for (var off = 0; off < cipher.length; off += 8) {
      var blk = desDecryptBlock(desBytesToBits(cipher, off, 8), SAAVN_SUBKEYS);
      var dec = desBitsToBytes(blk);
      for (var j = 0; j < 8; j++) plainBytes.push(dec[j]);
    }
    var pad = plainBytes[plainBytes.length - 1];
    if (pad >= 1 && pad <= 8) {
      var validPad = true;
      for (var p = 1; p <= pad; p++) {
        if (plainBytes[plainBytes.length - p] !== pad) {
          validPad = false;
          break;
        }
      }
      if (validPad) plainBytes.length -= pad;
    }
    return bytesToUtf8(plainBytes).trim();
  }


var pauseUntil=0;
function txt(x){return String(x==null?'':x);}
function norm(x){return txt(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function artist(t){return txt(t.artist||(t.artists&&t.artists[0]&&(typeof t.artists[0]==='string'?t.artists[0]:t.artists[0].name))||'');}
function jget(url,ms,headers){
 try{
  var r=myspoti.http.request({url:url,method:'GET',headers:headers||{},timeout:ms});
  if(!r||r.error||r.ok===false||Number(r.status||0)>=400)return null;
  var body=r.body;
  return typeof body==='string'?JSON.parse(body):(body&&typeof body==='object'?body:null);
 }catch(e){return null;}
}
function resolve(track,deadline){
 if(Date.now()<pauseUntil||deadline-Date.now()<2000)return null;
 var q=(artist(track)+' '+txt(track.title)).trim();if(!q)return null;
 var api='https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&p=1&n=10&q='+encodeURIComponent(q);
 var data=jget(api,Math.min(2700,deadline-Date.now()-500),{'X-Forwarded-For':'49.36.0.1','X-Real-IP':'49.36.0.1','Accept-Language':'en-IN,en;q=0.9'});
 if(!data||!Array.isArray(data.results)){AURA_DEV_WRITE('[WHALE268] JioSaavn SEARCH: risposta assente/non valida; pausa temporanea 30s');pauseUntil=Date.now()+30000;return null;} AURA_DEV_WRITE('[WHALE268] JioSaavn SEARCH: risultati='+data.results.length);
 var best=null,score=-1, t=norm(track.title),a=norm(artist(track));
 for(var i=0;i<data.results.length;i++){var x=data.results[i],mi=x.more_info||{},enc=mi.encrypted_media_url||x.encrypted_media_url;if(!enc)continue;
 var pa=mi.artistMap&&mi.artistMap.primary_artists;var names=Array.isArray(pa)?pa.map(function(p){return p&&p.name||'';}).join(' '):'';var xt=norm(x.title||x.song),xa=norm(names||mi.music||x.subtitle);
 var sc=(xt===t?70:xt.indexOf(t)>=0&&t.length>3?40:0)+(a&&xa.indexOf(a)>=0?30:0);
 if(sc>score){score=sc;best={enc:enc,high:String(mi['320kbps']).toLowerCase()==='true'};}
 }
 if(!best||score<65){AURA_DEV_WRITE('[WHALE268] JioSaavn MATCH: nessun candidato affidabile; score=' + score);return null;} AURA_DEV_WRITE('[WHALE268] JioSaavn MATCH: accettato; variante320_dichiarata='+ (best.high?'si':'no'));
 var url=saavnDecryptUrl(best.enc);if(!/^https?:\/\//i.test(url)){AURA_DEV_WRITE('[WHALE268] JioSaavn URL: decodifica non valida');return null;}url=url.replace(/^http:/i,'https:');
 // Replace only an actual bitrate suffix; never relabel an unchanged URL as 320.
 function variantUrl(base,rate){
  var m=base.match(/_(12|48|96|160|320)(\.mp4)(?=\?|#|$)/i);
  return m?base.replace(/_(12|48|96|160|320)(\.mp4)(?=\?|#|$)/i,'_'+rate+'$2'):null;
 }
 var variants=[];
 if(best.high){var u320=variantUrl(url,320);if(u320)variants.push({url:u320,kbps:320});else AURA_DEV_WRITE('[WHALE268] JioSaavn 320: suffisso bitrate assente nell URL decifrato');}
 var u160=variantUrl(url,160);
 if(u160)variants.push({url:u160,kbps:160});
 else {AURA_DEV_WRITE('[WHALE268] JioSaavn 160: suffisso bitrate assente; provo URL originale senza attribuire bitrate');variants.push({url:url,kbps:0});}
 for(var k=0;k<variants.length;k++){
  if(deadline-Date.now()<1100){AURA_DEV_WRITE('[WHALE268] JioSaavn: budget insufficiente per variante '+variants[k].kbps);break;}
  var v=variants[k];
  try{
   var r=myspoti.http.request({url:v.url,method:'GET',timeout:Math.min(2100,deadline-Date.now()-250),headers:{Range:'bytes=0-41',Accept:'audio/*,*/*'}});
   var status=Number(r&&r.status||0),ct='';
   if(r&&r.headers){for(var h in r.headers)if(h.toLowerCase()==='content-type')ct=String(r.headers[h]||'').toLowerCase();}
   if(r&&!r.error&&(status===200||status===206)&&ct.indexOf('text/html')<0&&ct.indexOf('application/json')<0&&ct.indexOf('text/plain')<0){
    var body=typeof r.body==='string'?r.body:'';
    if(body.substring(4,8)==='ftyp'||ct.indexOf('audio/')===0||ct.indexOf('mp4')>=0||ct.indexOf('octet-stream')>=0){
     AURA_DEV_WRITE('[WHALE268] JioSaavn URL: HTTP='+status+' tipo='+(ct||'ND')+' variante_richiesta='+(v.kbps||'originale')+'kbps; bitrate_effettivo=NON_VERIFICATO');
     return {url:v.url,provider:'JioSaavn',format:'m4a',kbps:v.kbps||0};
    }
   }
   AURA_DEV_WRITE('[WHALE268] JioSaavn URL: variante='+v.kbps+' HTTP='+status+' tipo='+(ct||'ND')+' errore='+(r&&r.error?String(r.error).slice(0,90):'nessuno')+' non valida');
  }catch(e){AURA_DEV_WRITE('[WHALE268] JioSaavn URL: variante='+v.kbps+' eccezione='+String(e).slice(0,110));}
 }
AURA_DEV_WRITE('[WHALE268] JioSaavn URL: nessuna variante validata');return null;
}
return {resolve:resolve,reset:function(){pauseUntil=0;}};
})();

var AURA_ECLIPSE_ULTRAMAX = null;

// NetEase fast adapter: isolated from Aura session verification and ArchiveTune UI.
var NETEASE_FAST = (function () {
  var SEARCH = 'https://music.163.com/api/cloudsearch/pc';
  var STREAM = 'https://music-api.gdstudio.xyz/api.php';
  var matchCache = {}, cacheKeys = [];
  // Kaizen: short negative URL cooldown for repeated requests to the same NetEase ID.
  // No successful audio URL is cached here (URLs may expire).
  var urlMisses = {}, URL_MISS_MS = 20000;
  var TTL = 20 * 60 * 1000;
  var MISS_TTL = 30 * 1000; // A missing NetEase result is transient; retry after 30 seconds.
  function clearMatchCache() { matchCache = {}; cacheKeys = []; urlMisses = {}; }
  function norm(v) { return String(v || '').toLowerCase().replace(/\([^)]*\)|\[[^]]*\]/g, ' ').replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function request(url, ms) {
    try {
      var r = myspoti.http.request({url:url,method:'GET',headers:{'Accept':'application/json'},timeout:ms});
      if (!r || r.error || r.ok === false || Number(r.status || 0) >= 400) return null;
      var v = r.body;
      if (typeof v === 'string') return JSON.parse(v);
      return v && typeof v === 'object' ? v : null;
    } catch(e) { return null; }
  }
  function artistOf(track) {
    if (track.artist) return typeof track.artist === 'string' ? track.artist : (track.artist.name || '');
    var aa = track.artists || [];
    return aa.length ? (typeof aa[0] === 'string' ? aa[0] : (aa[0] && aa[0].name) || '') : '';
  }
  function resolve(track, forDownload, compressedOnly) {
    if (!track || !track.title) return null;
    var title = norm(track.title), rawArtist = artistOf(track), artist = norm(rawArtist);
    if (!title || !artist) return null;
    var targetMs = Number(track.durationMs || (track.duration && track.duration * 1000) || 0);
    var key = title + '|' + artist + '|' + Math.round(targetMs / 1000);
    var start = Date.now(), cache = matchCache[key], matches = null, searchMs = 0, fromCache = false;
    if (cache && start - cache.at < (cache.matches && cache.matches.length ? TTL : MISS_TTL)) { matches = cache.matches; fromCache = true; }
    if (!matches) {
      var query = String(track.title) + ' ' + rawArtist;
      var data = request(SEARCH + '?s=' + encodeURIComponent(query) + '&type=1&limit=8&offset=0', 1700);
      var songs = data && data.result && data.result.songs;
      if (!Array.isArray(songs) || !songs.length) { AURA_DEV_WRITE('[WHALE268] NetEase SEARCH: prima ricerca senza risultati, provo mirror');
        var mirror = request(STREAM + '?types=search&source=netease&name=' + encodeURIComponent(query) + '&count=8&pages=1', 1500);
        songs = Array.isArray(mirror) ? mirror : (mirror && mirror.result && mirror.result.songs);
      }
      matches = [];
      if (Array.isArray(songs)) {
        for (var i=0;i<songs.length;i++) {
          var x=songs[i]; if (!x || !x.id || norm(x.name || x.title) !== title) continue;
          var aa=Array.isArray(x.ar) ? x.ar : (x.artists || []);
          var xa=norm(aa.map(function(y){return typeof y==='string'?y:(y&&y.name)||'';}).join(' '));
          if (!xa || (xa.indexOf(artist)<0 && artist.indexOf(xa)<0)) continue;
          var dur=Number(x.dt || x.duration || 0);
          if (targetMs && dur && Math.abs(targetMs-dur)>4000) continue;
          matches.push({id:x.id,duration:dur});
          if (matches.length>=2) break;
        }
      }
      searchMs = Date.now() - start; AURA_DEV_WRITE('[WHALE268] NetEase MATCH: candidati_ammessi='+matches.length+' ricerca_ms='+searchMs);
      // Keep one entry per key: repeated searches must not evict a newer cache hit.
      if (!Object.prototype.hasOwnProperty.call(matchCache, key)) cacheKeys.push(key);
      matchCache[key] = {at:Date.now(),matches:matches};
      while (cacheKeys.length > 100) {
        var oldest = cacheKeys.shift();
        if (oldest !== key) delete matchCache[oldest];
      }
    }
    for (var j=0;j<matches.length;j++) {
      var candidateId = String(matches[j].id);
      var lastMiss = urlMisses[candidateId] || 0;
      if (lastMiss && Date.now() - lastMiss < URL_MISS_MS) {AURA_DEV_WRITE('[WHALE268] NetEase URL: negativo in cache, nuova richiesta saltata');continue;}
      if (lastMiss) delete urlMisses[candidateId];
      var urlStart=Date.now();
      var requestedBr=compressedOnly ? 320 : 999;
      var d=request(STREAM + '?types=url&source=netease&id=' + encodeURIComponent(candidateId) + '&br=' + requestedBr, 1900); AURA_DEV_WRITE('[WHALE268] NetEase URL: risposta='+(d?'presente':'assente')+' br_richiesto='+requestedBr);
      var url=d && String(d.url || '');
      if (!/^https:\/\//i.test(url)) {
        AURA_DEV_WRITE('NetEase FAST: URL assente/non HTTPS per id=' + candidateId +
          ' (risposta=' + (d ? 'presente' : 'vuota') + ')');
        urlMisses[candidateId] = Date.now();
        // Bounded negative cache: avoid retaining old IDs indefinitely.
        var missIds = Object.keys(urlMisses);
        if (missIds.length > 80) {
          for (var mi=0;mi<missIds.length;mi++) {
            if (Date.now() - urlMisses[missIds[mi]] >= URL_MISS_MS) delete urlMisses[missIds[mi]];
          }
          missIds = Object.keys(urlMisses);
          if (missIds.length > 80) delete urlMisses[missIds[0]];
        }
        continue;
      }
      var br=Number(d.br || 0), size=Number(d.size || 0);
      if (size && br && targetMs>65000 && size*8/(br*1000)<48) continue;
      var extFlac=/\.flac(?:[?#]|$)/i.test(url), extMp3=/\.mp3(?:[?#]|$)/i.test(url);
      var fmt=String(d.format || d.type || d.codec || '').toLowerCase();
      var flac=extFlac || fmt==='flac';
      var mp3=extMp3 || fmt==='mp3';
      if (compressedOnly) AURA_DEV_WRITE('[COLIBRI278] NetEase codec: format='+ (fmt || 'assente')+' estensione='+(extMp3?'mp3':extFlac?'flac':'non indicata')+' bitrate_dichiarato='+ (Number(d.br||d.kbps||0)||'assente')+'; nessuna deduzione dal solo bitrate');
      if (!flac && !mp3) {
        AURA_DEV_WRITE('NetEase FAST: codec non verificabile per id=' + candidateId +
          ' format=' + (fmt || '?') + ' (URL presente)');
        // Bitrate alone does not prove the codec; reject ambiguous URLs.
        continue;
      }
      var bits=Number(d.bitDepth || d.bit_depth || d.bits || 0);
      var rate=Number(d.sampleRate || d.sample_rate || d.samplingRate || 0);
      var kbps=Number(d.kbps || 0) || (br>0 ? br : 0);
      if (kbps>10000) kbps=Math.round(kbps/1000);
      return {url:url,provider:'NetEase',format:flac?'flac':'mp3',
        duration:matches[j].duration || targetMs,isrcMatched:false,
        bitDepth:bits,sampleRate:rate,kbps:kbps,
        neteaseDiagnostic:{searchMs:searchMs,urlMs:Date.now()-urlStart,cached:fromCache,
          format:flac?'FLAC':'MP3',bits:bits,rate:rate,kbps:kbps,
          codecEvidence:extFlac||extMp3?'URL extension':'API format'}};
    }
    return null;
  }
  return {resolve:resolve,clearCache:clearMatchCache};
})();

var LAST_QOBUZ_POOL = (function () {
var personalOnly = false;
/*
 * BitChord Hi-Res — estensione per Myspoti (API 1)
 * Aggiornamento 3.0 dell'estensione "Eljohnzc Lossless": stesso id, nuovo
 * servizio. Punta all'addon BitChord Hi-Res (id dev.akira.bitchord-hires,
 * "juanjob hi res", https://bitchord-hires-addon.vercel.app).
 * ---------------------------------------------------------------------------
 * Il servizio espone:
 *   GET /search?q=<testo>  -> { tracks: [ { id, title, artist, album,
 *                                        artworkURL, format, audioQuality,
 *                                        source, duration (solo Deezer) } ] }
 *                             Gli id hanno la fonte davanti: dz:<id> (Deezer,
 *                             metadati), ia:<item> (Internet Archive), e in
 *                             generale <sigla>:<id> per le altre fonti.
 *   GET /stream/<id>       -> { url: "https://…/file.flac", codec: "flac",
 *                               bitDepth, sampleRate, provider, quality }
 *                             oppure 404 {"error":"not available in this addon"}
 *   GET /health            -> { providers: [ { provider, reachable, ms } ] }
 *   GET <url>              -> il file FLAC (Range e HEAD supportati)
 *
 * Com'è fatto l'addon, e come lo gestisce l'estensione:
 *  - Deezer è solo un catalogo: per i suoi id /stream risponde sempre 404.
 *    L'estensione impara quali fonti sanno servire audio (cache 6 h) e salta
 *    le altre, così un brano commerciale torna subito su Spotify;
 *  - Internet Archive serve FLAC veri (16/24-bit) ma non dichiara artista,
 *    album né durata: l'abbinamento si regge sul titolo (anche nel formato
 *    "Artista - Titolo") e il nome del file fa da secondo controllo;
 *  - l'item di Internet Archive a volte mappa un altro brano e a volte è un
 *    concerto intero: il nome del file e la dimensione rispetto alla durata
 *    di Spotify scartano i casi sbagliati;
 *  - la ricerca non dà ISRC: l'abbinamento sta su titolo, artista, album,
 *    durata (l'ISRC si usa se prima o poi comparirà).
 *
 * Myspoti non conosce gli addon: conosce gli hook. Questa estensione fa ponte:
 *   audio-source     -> l'URL del FLAC da riprodurre
 *   download-source  -> l'URL del FLAC da scaricare
 *   status           -> dice se il servizio risponde, così Myspoti può saltarlo
 *
 * Tutto è sincrono (Rhino, niente promise): i callback restituiscono il valore.
 */

var DEFAULT_BASE = 'https://bitchord-hires-addon.vercel.app';
var PROVIDER = 'Qobuz Hi-Res';

/* --- Qobuz, via API ufficiale con pool di token condivisi --------------- */
var QOBUZ_API = 'https://www.qobuz.com/api.json/0.2/';
var QOBUZ_PREFIX = 'qz:';
var TOKENS_KEY = 'qobuz_tokens';
var TOKEN_DEAD_MS = 20 * 60 * 1000;   // un token che risponde 401 si riprova dopo
var POOL_TTL_MS = 6 * 60 * 60 * 1000; // un pool remoto si rilegge ogni 6 ore
var POOL_TIMEOUT = 3500;
var FAST_TIMEOUT = 3000;                      // primo tentativo: Qobuz di solito risponde in meno di 1 s

/*
 * Il pool condiviso: stesso elenco (token + app_id + app_secret) che usa
 * l'estensione Eclipse "echo-qobuz-extension" nella sua versione 1.0.1.
 * Sono token di account altrui, messi lì dal suo autore: possono smettere di
 * funzionare da un giorno all'altro, per questo si ruota e si accetta anche
 * un token personale dalle impostazioni.
 */
var SHARED_TOKENS = [
  { token: 'LXcX98uaBz8NPoRZsigyB6TfCemNotzeG7oVwy5XZHPKXNeLMXJUPyEGAM6c5qUpBWnkqmRaRUbJGup9oSsh_w', appId: '312369995', appSecret: 'e79f8b9be485692b0e5f9dd895826368' },
  { token: '7W1P_bimeouwcLTVKjV1UGr_MJp4psetcljd1awOU9QksKi9AmHKvf6MtIdvzP0HuLLENvmM2pJErjSuE_3N3g', appId: '312369995', appSecret: 'e79f8b9be485692b0e5f9dd895826368' },
  { token: 'O97vZDyvXmYhLPfbn07D8Y4SFN02DyRrYb3Pe3rQXWnw1HosDl9vfQTGRQEo2zkkcwP9ADc3L20nYNaI0l7E4g', appId: '312369995', appSecret: 'e79f8b9be485692b0e5f9dd895826368' }
];
var QOBUZ_APP = { appId: '798273057', appSecret: 'abb21364945c0583309667d13ca3d93a' };
var PROBE_KEY = 'probe';
var PROVIDERS_KEY = 'providers';
var CACHE_KEY = 'matches_qz_lean';

var TTL_MATCH_MS = 14 * 24 * 60 * 60 * 1000; // l'elenco dei candidati vale 14 giorni
var KEEP_ANSWER_MS = 9 * 60 * 1000;           // quanto una risposta resta buona (Myspoti ne tiene 10)
var MIN_LEFT_MS = 60 * 1000;                  // sotto questo margine il token sta per scadere
var RETRY_MS = 5000;                          // richiesta identica entro questo tempo = un nuovo tentativo
var MAX_CACHE = 600;                          // brani ricordati al massimo
var MAX_TRIES = 3;                            // id provati per un brano: alcune edizioni rispondono 502
var MAX_CANDIDATES = 5;                       // candidati tenuti per brano
var TIMEOUT = 6000;                           // ms per richiesta
var MAX_QUERIES = 3;                          // ricerche provate per brano
var PROVIDER_TTL_MS = 6 * 60 * 60 * 1000;     // quanto si ricorda che una fonte non serve audio
var MAX_MB_PER_SECOND = 1.6;                  // tetto di dimensione di un FLAC (24/192 ≈ 1,2 MB/s)
var FORMAT_HI = 27;                           // FLAC 24-bit (Qobuz riporta al 16-bit se non c'è)
var FORMAT_CD = 6;                            // FLAC 16-bit / 44.1 kHz
var MAX_TOKEN_TRIES = 6;                      // token provati per una chiamata

/* Risposte tenute in memoria per la durata dell'app: id Spotify -> risposta. */
var answers = {};

/*
 * Tempo massimo di una chiamata di hook (Myspoti la abbandona a 15 s per
 * audio-source, 30 s per download-source): ogni richiesta HTTP usa quello che
 * resta, così l'estensione risponde sempre "non ce l'ho" in tempo.
 */
var deadline = 0;

function now() {
  return new Date().getTime();
}

function startBudget(seconds) {
  deadline = now() + seconds * 1000;
}

function leftMs() {
  return deadline ? deadline - now() : TIMEOUT * 2;
}

/** Il timeout da passare a http: il minore fra il desiderato e quello che resta. */
function timeoutFor(ms) {
  return Math.max(250, Math.min(ms || TIMEOUT, Math.max(250, leftMs() - 200)));
}

/**
 * Il servizio da interrogare: l'indirizzo scritto nelle impostazioni (avanzato)
 * oppure quello predefinito. Serve a sopravvivere alla morte di un addon: se il
 * fornitore dà una nuova chiave, si incolla qui senza rifare l'estensione.
 */
function base() {
  var v = trim(String(setting('serverUrl', '')));
  if (!v) return DEFAULT_BASE;
  v = v.replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
  return v;
}

/**
 * L'addon restituisce id con la fonte davanti: `dz:3135553` (Deezer),
 * `ia:un-item` (Internet Archive), `qz:…`, `td:…`. Non tutte le fonti sanno
 * davvero servire audio (Deezer qui dà solo metadati), quindi la fonte si
 * impara dalle risposte e si ricorda per qualche ora.
 */
function providerOf(id) {
  var m = /^([a-z]{1,8}):/.exec(String(id || ''));
  return m ? m[1] : '';
}

function providers() {
  var all = myspoti.storage.get(PROVIDERS_KEY);
  return (all && typeof all === 'object') ? all : {};
}

/**
 * Le fonti che possono servire audio. Deezer qui dà solo metadati (l'addon non
 * ha un account che scarichi FLAC); le altre sì. Serve solo a non sprecare sonde.
 */
function isAudioProvider(id) {
  var name = providerOf(id);
  return name !== 'dz';
}

/** False quando questa fonte ha già risposto "non ho audio" da poco. */
function providerUsable(id) {
  var name = providerOf(id);
  if (!name) return true; // id senza prefisso: si prova
  var e = providers()[name];
  if (!e || e.ok) return true;
  return (now() - (e.at || 0)) > PROVIDER_TTL_MS;
}

function markProvider(id, ok) {
  var name = providerOf(id);
  if (!name) return;
  var all = providers();
  var before = all[name];
  if (before && !!before.ok === !!ok && (now() - (before.at || 0)) < 60000) return;
  all[name] = { ok: !!ok, at: now() };
  try {
    myspoti.storage.set(PROVIDERS_KEY, all);
  } catch (e) {
    AURA_DEV_WRITE('storage piena: ' + e);
  }
}

/* ------------------------------------------------------------------ */
/* Piccole utilità                                                     */
/* ------------------------------------------------------------------ */

function trim(s) {
  return String(s == null ? '' : s).replace(/^\s+|\s+$/g, '');
}

function indexOf(arr, value) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === value) return i;
  }
  return -1;
}

/** GET che non lancia: il corpo in testo, o null (stato non 2xx, rete assente). */
var httpErr = ''; // ultimo errore di rete: net | busy | down (letto per mettere in pausa BitChord)
var retryHint = 0; // millisecondi suggeriti dal server con Retry-After (429)
function retryAfterMs(r) {
  try {
    var h = r && r.headers, v = 0;
    if (h) for (var k in h) if (String(k).toLowerCase() === 'retry-after') v = Number(h[k]);
    return isFinite(v) && v > 0 ? Math.min(v * 1000, 600000) : 0;
  } catch (e) { return 0; }
}
function httpText(url, timeoutMs) {
  try {
    var r = myspoti.http.get(url, { timeout: timeoutFor(timeoutMs) });
    if (!r || !r.ok) {
      httpErr = r && Number(r.status) === 429 ? 'busy' : (r && Number(r.status) >= 500 ? 'down' : httpErr);
      if (httpErr === 'busy') retryHint = retryAfterMs(r);
      AURA_DEV_WRITE('FALLBACK: HTTP ' + (r && r.status || 'rete') +
        ', tipo=' + (httpErr || 'not-found') + ', residuo=' + Math.max(0,leftMs()) + 'ms');
      return null;
    }
    return r.body;
  } catch (e) {
    httpErr = 'net';
    AURA_DEV_WRITE('http: ' + e);
    return null;
  }
}

/** La risposta intera (anche 4xx), o null se la richiesta non parte. */
function httpRaw(url, timeoutMs) {
  try {
    var r = myspoti.http.get(url, { timeout: timeoutFor(timeoutMs) });
    return r || null;
  } catch (e) {
    AURA_DEV_WRITE('http: ' + e);
    return null;
  }
}

/** GET JSON che non lancia: l'oggetto, o null. */
function httpJson(url, timeoutMs) {
  var body = httpText(url, timeoutMs);
  if (body === null) return null;
  try {
    return JSON.parse(body);
  } catch (e) {
    return null;
  }
}

/** Dimensione in byte da una HEAD, 0 se non si sa (solo per la barra dei download). */
function sizeOf(url) {
  try {
    var r = myspoti.http.request({ url: url, method: 'HEAD', timeout: timeoutFor(4000) });
    if (!r || !r.ok) return 0;
    var h = r.headers || {};
    var raw = h['content-length'];
    var n = raw ? parseInt(String(raw).split(',')[0], 10) : 0;
    return n > 0 ? n : 0;
  } catch (e) {
    AURA_DEV_WRITE('HEAD: ' + e);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Normalizzazione dei testi (titoli, artisti, album)                  */
/* ------------------------------------------------------------------ */

/* Rhino non ha String.prototype.normalize: le lettere accentate si piegano qui. */
var FOLD = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'ā': 'a', 'ă': 'a', 'ą': 'a',
  'ç': 'c', 'ć': 'c', 'č': 'c', 'ĉ': 'c', 'ċ': 'c',
  'ď': 'd', 'đ': 'd',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e', 'ĕ': 'e', 'ė': 'e', 'ę': 'e', 'ě': 'e',
  'ĝ': 'g', 'ğ': 'g', 'ġ': 'g', 'ģ': 'g', 'ĥ': 'h', 'ħ': 'h',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ĩ': 'i', 'ī': 'i', 'ĭ': 'i', 'į': 'i', 'ı': 'i',
  'ĵ': 'j', 'ķ': 'k', 'ĺ': 'l', 'ļ': 'l', 'ľ': 'l', 'ŀ': 'l', 'ł': 'l',
  'ñ': 'n', 'ń': 'n', 'ņ': 'n', 'ň': 'n',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o', 'ō': 'o', 'ő': 'o',
  'ŕ': 'r', 'ŗ': 'r', 'ř': 'r',
  'ś': 's', 'ŝ': 's', 'ş': 's', 'š': 's', 'ß': 'ss',
  'ţ': 't', 'ť': 't', 'ŧ': 't',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ũ': 'u', 'ū': 'u', 'ŭ': 'u', 'ů': 'u', 'ű': 'u', 'ų': 'u',
  'ŵ': 'w', 'ý': 'y', 'ÿ': 'y', 'ŷ': 'y', 'ź': 'z', 'ż': 'z', 'ž': 'z',
  'æ': 'ae', 'œ': 'oe', 'ð': 'd', 'þ': 'th'
};

function fold(s) {
  var s2 = String(s == null ? '' : s).toLowerCase();
  var out = '';
  for (var i = 0; i < s2.length; i++) {
    var c = s2.charAt(i);
    out += FOLD[c] ? FOLD[c] : c;
  }
  return out;
}

/** True quando il testo ha almeno una lettera latina (a-z, anche accentata). */
function hasLatin(s) {
  var t = String(s == null ? '' : s).toLowerCase();
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i);
    if ((c >= 'a' && c <= 'z') || FOLD[c]) return true;
  }
  return false;
}

/**
 * Vero quando il testo è scritto in un'altra scrittura (giapponese, cirillico,
 * greco, arabo, coreano…): il servizio localizza i nomi, per cui un titolo o un
 * artista "straniero" non è un errore ma una traduzione.
 */
function isForeign(s) {
  var t = trim(s);
  if (!t) return false;
  return !hasLatin(t);
}

/**
 * Forma confrontabile: minuscolo, senza accenti, via i "(feat. …)", i "[…]" e i
 * suffissi di versione ("- 2011 Remaster", "- Radio Edit"), solo lettere e cifre.
 */
function norm(s) {
  var out = fold(s);
  out = out.replace(/\((?:feat|ft|featuring|with|con)\b[^)]*\)/g, ' ');
  out = out.replace(/\[(?:feat|ft|featuring|with|con)\b[^\]]*\]/g, ' ');
  out = out.replace(/\s+-\s+.*$/, ' ');
  out = out.replace(/\b(?:feat|ft|featuring)\.?\s+.*$/, ' ');
  out = out.replace(/&/g, ' and ');
  out = out.replace(/[^a-z0-9]+/g, ' ');
  return trim(out);
}

function tokensOf(s) {
  if (!s) return [];
  var parts = String(s).split(' ');
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i]) out.push(parts[i]);
  }
  return out;
}

/** Quanto due testi condividono le parole: 0 (niente) … 1 (le stesse). */
function overlap(a, b) {
  var ta = tokensOf(a);
  var tb = tokensOf(b);
  if (!ta.length || !tb.length) return 0;
  var hit = 0;
  for (var i = 0; i < ta.length; i++) {
    if (indexOf(tb, ta[i]) >= 0) hit++;
  }
  return hit / Math.max(ta.length, tb.length);
}

/* ------------------------------------------------------------------ */
/* Impostazioni                                                        */
/* ------------------------------------------------------------------ */

function setting(key, fallback) {
  var v = tigroVaultSetting(key);
  return (v === undefined || v === null) ? fallback : v;
}

function streamEnabled() {
  var v = setting('streamEnabled', true);
  return v !== false && String(v) !== 'false';
}

function backupEnabled() {
  var v = setting('bitchordBackup', true);
  return v !== false && String(v) !== 'false';
}

function qualityLogsOn() {
  var v = setting('qualityLogs', false);
  return v !== false && String(v) !== 'false';
}

/** Log dedicato alla verifica della qualità (si spegne dalle impostazioni). */
function qlog(msg) {
  if (!qualityLogsOn()) return;
  AURA_DEV_WRITE('[QUALITÀ] ' + msg);
}

function qualityLabel(bitDepth, sampleRate) {
  if (!bitDepth && !sampleRate) return 'sconosciuta';
  var khz = sampleRate ? (Math.round(sampleRate / 100) / 10) + ' kHz' : '? kHz';
  return (bitDepth || '?') + '-bit / ' + khz;
}

function isHiResQuality(bitDepth, sampleRate) {
  return bitDepth > 16 || sampleRate > 48000;
}

function preferHiRes() {
  var v = setting('preferHiRes', true);
  return v !== false && String(v) !== 'false';
}

/** Tolleranza in secondi tra la durata Spotify e quella del candidato. */
function toleranceSec() {
  var v = String(setting('tolerance', ''));
  if (v.indexOf('Rigorosa') === 0) return 3;
  if (v.indexOf('Permissiva') === 0) return 15;
  return 6;
}

/* ------------------------------------------------------------------ */
/* Abbinamento del brano                                               */
/* ------------------------------------------------------------------ */

/** Chiave stabile di un brano Spotify (id se c'è, altrimenti titolo/artista/durata). */
function matchKey(track) {
  if (track.id) return 'id:' + track.id;
  return 'x:' + norm(track.artist) + '|' + norm(track.title) + '|' + Math.round((track.durationMs || 0) / 1000);
}

function isMyspotiTrack(track) {
  if (!track || !track.title) return false;
  if (track.id) return true;
  return String(track.uri || '').indexOf('spotify:track:') === 0;
}

function readCache(key) {
  var all = myspoti.storage.get(CACHE_KEY);
  if (!all || typeof all !== 'object') return null;
  var e = all[key];
  if (!e || !e.ids || !e.ids.length) return null;
  if (e.at && now() - e.at > TTL_MATCH_MS) return null;
  return e;
}

function writeCache(key, entry) {
  var all = myspoti.storage.get(CACHE_KEY);
  if (!all || typeof all !== 'object') all = {};
  all[key] = entry;
  var keys = [];
  for (var k in all) {
    if (all.hasOwnProperty(k)) keys.push(k);
  }
  if (keys.length > MAX_CACHE) {
    keys.sort(function (a, b) { return (all[a].at || 0) - (all[b].at || 0); });
    for (var i = 0; i < keys.length - MAX_CACHE; i++) delete all[keys[i]];
  }
  try {
    myspoti.storage.set(CACHE_KEY, all);
  } catch (e) {
    AURA_DEV_WRITE('storage piena: ' + e);
  }
}

function isrcOf(track) {
  var v = track.isrc;
  return v ? String(v).toLowerCase() : '';
}

function durationSec(candidate) {
  var d = candidate.duration;
  if (d === undefined || d === null) return 0;
  var n = Number(d);
  if (isNaN(n) || n <= 0) return 0;
  // Alcune risposte danno i millisecondi: oltre un'ora e mezza in secondi è sospetto.
  return n > 5400 ? Math.round(n / 1000) : n;
}

function trackDurationSec(track) {
  var ms = Number(track.durationMs || 0);
  return ms > 0 ? ms / 1000 : 0;
}

/** Scarto di durata in secondi (Infinity quando uno dei due non la dichiara). */
function durationDelta(candidate, track) {
  var want = trackDurationSec(track);
  var got = durationSec(candidate);
  if (!want || !got) return Infinity;
  return Math.abs(want - got);
}

function durationOk(candidate, track) {
  var delta = durationDelta(candidate, track);
  return delta === Infinity || delta <= toleranceSec();
}

/** -30 … 22: la durata del candidato rispetto a quella del brano. */
function durationScore(candidate, track) {
  var delta = durationDelta(candidate, track);
  if (delta === Infinity) return 0;
  if (delta <= 1.5) return 22;
  if (delta <= 3) return 16;
  if (delta <= 6) return 8;
  if (delta <= 12) return -6;
  return -30;
}

/** 0 … 60: quanto il titolo del candidato somiglia a quello cercato. */
function titleScore(candidate, track) {
  var want = norm(track.title);
  var got = norm(candidate.title);
  if (!want || !got) return 0;
  if (want === got) return 60;
  if (got.indexOf(want) === 0 || want.indexOf(got) === 0) return 46;
  if (got.indexOf(want) >= 0 || want.indexOf(got) >= 0) return 34;
  return Math.round(32 * overlap(want, got));
}

/** 0 … 30: l'artista del candidato è uno degli artisti del brano. */
function artistScore(candidate, track) {
  var got = norm(candidate.artist);
  if (!got) return 0;
  var wanted = [];
  if (track.artists && track.artists.length) {
    for (var i = 0; i < track.artists.length; i++) wanted.push(track.artists[i]);
  }
  if (track.artist) wanted.push(track.artist);
  var best = 0;
  for (var j = 0; j < wanted.length; j++) {
    var n = norm(wanted[j]);
    if (!n) continue;
    var s = 0;
    if (n === got) s = 30;
    else if (got.indexOf(n) >= 0 || n.indexOf(got) >= 0) s = 24;
    else s = Math.round(22 * overlap(n, got));
    if (s > best) best = s;
  }
  return best;
}

/**
 * Internet Archive non dichiara l'artista e mette tutto nel titolo
 * ("Glenn Miller - In the Mood", "Für Elise - Wilhelm Kempff"): si prova anche
 * a spezzare il titolo sul trattino e a scambiarne le due parti.
 */
function splitTitle(candidate) {
  var title = String(candidate.title == null ? '' : candidate.title);
  var at = title.indexOf(' - ');
  if (at < 0) return null;
  return { left: trim(title.slice(0, at)), right: trim(title.slice(at + 3)) };
}

/** Il candidato "raddrizzato": artista preso dal titolo quando manca. */
function variantsOf(candidate) {
  var out = [candidate];
  var missingArtist = !trim(candidate.artist);
  if (missingArtist) {
    var parts = splitTitle(candidate);
    if (parts) {
      out.push({ item: null, title: parts.right, artist: parts.left, album: candidate.album, duration: candidate.duration, audioQuality: candidate.audioQuality, id: candidate.id, source: candidate.source, swapped: true });
      out.push({ item: null, title: parts.left, artist: parts.right, album: candidate.album, duration: candidate.duration, audioQuality: candidate.audioQuality, id: candidate.id, source: candidate.source, swapped: true });
    }
  }
  return out;
}

/**
 * Quanto il titolo più corto è contenuto nell'altro: 0 … 1. Serve per fidarsi
 * dei candidati di Internet Archive, che non dichiarano artista né album.
 */
function titleCoverage(candidate, track) {
  var a = tokensOf(norm(track && track.title));
  var b = tokensOf(norm(candidate && candidate.title));
  if (!a.length || !b.length) return 0;
  var small = a.length <= b.length ? a : b;
  var big = a.length <= b.length ? b : a;
  var hit = 0;
  for (var i = 0; i < small.length; i++) {
    if (indexOf(big, small[i]) >= 0) hit++;
  }
  return hit / small.length;
}

/** 0, 8 o 12: quanto l'album del candidato somiglia a quello del brano. */
function albumScore(candidate, track) {
  var want = norm(track.album);
  var got = norm(candidate.album);
  if (!want || !got) return 0;
  if (want === got) return 12;
  if (want.indexOf(got) >= 0 || got.indexOf(want) >= 0) return 8;
  return 0;
}

/** "24-bit / 96 kHz" -> 24 (0 se non lo dice). */
function bitDepthOf(candidate) {
  var m = /(\d{1,2})\s*-\s*bit/i.exec(String(candidate.audioQuality || ''));
  return m ? parseInt(m[1], 10) : 0;
}

/** "24-bit / 96 kHz" -> 96000 (0 se non lo dice). */
function sampleRateOf(candidate) {
  var m = /\/\s*([\d.]+)\s*kHz/i.exec(String(candidate.audioQuality || ''));
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * 1000);
}

/**
 * Valuta un candidato: null se non è lo stesso brano, altrimenti
 * { item, score, hiRes }. Regole d'accettazione, dalla più sicura:
 *   1. ISRC identico;
 *   2. titolo e artista buoni, durata nella tolleranza;
 *   3. titolo molto buono e artista localizzato (album o durata quasi uguale);
 *   4. album identico e durata quasi uguale, con titolo o artista localizzati;
 *   5. album identico, titolo e artista discreti.
 * Fuori da queste, meglio Spotify che la canzone sbagliata.
 */
function evaluate(rawCandidate, track, hiResBias) {
  if (!rawCandidate || rawCandidate.id === undefined || rawCandidate.id === null) return null;
  var variants = variantsOf(rawCandidate);
  var best = null;
  for (var vi = 0; vi < variants.length; vi++) {
    var ev = evaluateOne(variants[vi], track, hiResBias);
    if (ev && (!best || ev.score > best.score)) best = ev;
  }
  return best;
}

/* Protezione conservativa contro edizioni chiaramente diverse.
 * Non considera remaster/deluxe come registrazioni diverse e non altera
 * la corrispondenza se l'ISRC e' identico. */
function editionFlags(title) {
  var t = fold(title || '');
  var flags = {};
  flags.live = /\b(?:live|dal vivo|en vivo|concert|unplugged)\b/.test(t);
  flags.acoustic = /\b(?:acoustic|acustic[oa]|acustico|acustica)\b/.test(t);
  flags.remix = /\b(?:remix|club mix|dance mix|extended mix)\b/.test(t);
  flags.instrumental = /\b(?:instrumental|karaoke)\b/.test(t);
  flags.demo = /\b(?:demo|rough mix)\b/.test(t);
  return flags;
}
function incompatibleEdition(candidate, track) {
  var a = editionFlags((candidate.title || '') + ' ' + (candidate.version || ''));
  var b = editionFlags(track.title || '');
  var kinds = ['live','acoustic','remix','instrumental','demo'];
  for (var i=0;i<kinds.length;i++) if (a[kinds[i]] !== b[kinds[i]]) return true;
  return false;
}

function evaluateOne(c, track, hiResBias) {
  var wantIsrc = isrcOf(track);
  var isrcMatched = !!(wantIsrc && c.isrc && String(c.isrc).toLowerCase() === wantIsrc);
  // Non rifiutare due edizioni con lo stesso ISRC: il catalogo le identifica come medesima registrazione.
  if (!isrcMatched && incompatibleEdition(c, track)) return null;

  var t = titleScore(c, track);
  var a = artistScore(c, track);
  var alb = albumScore(c, track);
  var delta = durationDelta(c, track);
  var ok = durationOk(c, track);
  var foreign = isForeign(c.title) || isForeign(c.artist);

  var accept = false;
  if (isrcMatched) accept = true;
  else if (!ok) accept = false;
  else if (t >= 30 && a >= 20) accept = true;
  else if (t >= 46 && a >= 8) accept = true;
  else if (t >= 46 && foreign && alb >= 8 && delta <= 2.5) accept = true;
  else if (alb >= 12 && delta <= 2 && foreign) accept = true;
  else if (alb >= 12 && t >= 34 && a >= 8) accept = true;
  // Internet Archive non dichiara artista né album: si accetta solo un titolo
  // quasi identico (almeno due parole nel titolo di Spotify), senza metadati
  // che contraddicano. La guardia sul nome del file controlla il resto.
  else if (t >= 46 && titleCoverage(c, track) >= 0.75 &&
           tokensOf(norm(track.title)).length >= 2 &&
           (!trim(c.artist) || a >= 8) && (!trim(c.album) || alb >= 8)) accept = true;
  if (!accept) return null;

  var hiRes = bitDepthOf(c) >= 24;
  var score = t + a + durationScore(c, track) + alb;
  // Il 24-bit è un tie-breaker, non un motivo per scegliere un'altra edizione.
  if (hiRes) score += (hiResBias === undefined ? (preferHiRes() ? 6 : 0) : hiResBias);
  if (isrcMatched) score += 100;
  return { item: c, score: score, hiRes: hiRes, isrcMatched: isrcMatched };
}

/** I candidati accettati per una ricerca, dal punteggio più alto. */
function rankCandidates(list, track, hiResBias) {
  var out = [];
  if (!list || !list.length) return out;
  for (var i = 0; i < list.length; i++) {
    var ev = evaluate(list[i], track, hiResBias);
    if (ev) out.push(ev);
  }
  out.sort(function (x, y) { return y.score - x.score; });
  return out;
}

/** La ricerca del solo addon BitChord (per le sonde di stato). */

/**
 * Le tracce per una ricerca: prima Qobuz (catalogo commerciale, FLAC 16/24-bit),
 * poi l'addon BitChord (Internet Archive). Si uniscono: l'abbinamento sceglie.
 */
function searchTracks(query, backup) {
  if (backup) {
    var j = httpJson(base() + '/search?q=' + encodeURIComponent(query));
    return (j && j.tracks && j.tracks.length) ? j.tracks : [];
  }
  return qobuzEnabled() ? qobuzSearchTracks(query) : [];
}

/**
 * Il titolo senza le code di versione: "Bohemian Rhapsody - Remastered 2011"
 * -> "Bohemian Rhapsody", "Get Lucky (feat. …)" -> "Get Lucky". Cambia molto:
 * il servizio risponde con edizioni diverse a seconda di come si cerca.
 */
function cleanTitle(title) {
  var out = String(title == null ? '' : title);
  out = out.replace(/\s*\((?:feat|ft|featuring|with|con|remaster(?:ed)?|deluxe|bonus|live|version|edit|mix)[^)]*\)/gi, '');
  out = out.replace(/\s*\[(?:feat|ft|featuring|with|con|remaster(?:ed)?|deluxe|bonus|live)[^\]]*\]/gi, '');
  out = out.replace(/\s+-\s+.*$/, '');
  out = out.replace(/\s+(?:feat|ft|featuring)\.?\s+.*$/i, '');
  return trim(out) || trim(title);
}

/** Le ricerche da provare, dalla più precisa alla più larga (senza doppioni). */
function queriesFor(track, backup) {
  var title = track.title;
  var clean = cleanTitle(title);
  var artist = track.artist;
  var out = [];
  var seen = {};

  function add(q) {
    var t = trim(q);
    if (!t || seen[t]) return;
    seen[t] = true;
    out.push(t);
  }

  var isrc = isrcOf(track);
  if (isrc && !backup) add(isrc.toUpperCase());
  if (artist && clean) add(artist + ' ' + clean);
  if (artist && title) add(artist + ' ' + title);
  if (clean && artist) add(clean + ' ' + artist);
  if (clean && track.album) add(clean + ' ' + track.album);
  if (clean) add(clean);
  if (title) add(title);
  return out;
}

/* ------------------------------------------------------------------ */
/* Qobuz: pool di token condivisi                                      */
/* ------------------------------------------------------------------ */

/* MD5 in JavaScript puro, solo per stringhe ASCII (le firme di Qobuz). */
function md5hex(input) {
  function toBytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }
  function add32(a, b) { return (a + b) & 0xffffffff; }
  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

  var bytes = toBytes(input);
  var bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  var lo = bitLen & 0xffffffff;
  var hi = Math.floor(bitLen / 4294967296) & 0xffffffff;
  for (var b = 0; b < 4; b++) bytes.push((lo >>> (8 * b)) & 0xff);
  for (var b2 = 0; b2 < 4; b2++) bytes.push((hi >>> (8 * b2)) & 0xff);

  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (var i = 0; i < bytes.length; i += 64) {
    var x = [];
    for (var j = 0; j < 16; j++) {
      x.push(bytes[i + j * 4] | (bytes[i + j * 4 + 1] << 8) | (bytes[i + j * 4 + 2] << 16) | (bytes[i + j * 4 + 3] << 24));
    }
    var a = a0, bb = b0, c = c0, d = d0;
    a = ff(a, bb, c, d, x[0], 7, -680876936); d = ff(d, a, bb, c, x[1], 12, -389564586);
    c = ff(c, d, a, bb, x[2], 17, 606105819); bb = ff(bb, c, d, a, x[3], 22, -1044525330);
    a = ff(a, bb, c, d, x[4], 7, -176418897); d = ff(d, a, bb, c, x[5], 12, 1200080426);
    c = ff(c, d, a, bb, x[6], 17, -1473231341); bb = ff(bb, c, d, a, x[7], 22, -45705983);
    a = ff(a, bb, c, d, x[8], 7, 1770035416); d = ff(d, a, bb, c, x[9], 12, -1958414417);
    c = ff(c, d, a, bb, x[10], 17, -42063); bb = ff(bb, c, d, a, x[11], 22, -1990404162);
    a = ff(a, bb, c, d, x[12], 7, 1804603682); d = ff(d, a, bb, c, x[13], 12, -40341101);
    c = ff(c, d, a, bb, x[14], 17, -1502002290); bb = ff(bb, c, d, a, x[15], 22, 1236535329);
    a = gg(a, bb, c, d, x[1], 5, -165796510); d = gg(d, a, bb, c, x[6], 9, -1069501632);
    c = gg(c, d, a, bb, x[11], 14, 643717713); bb = gg(bb, c, d, a, x[0], 20, -373897302);
    a = gg(a, bb, c, d, x[5], 5, -701558691); d = gg(d, a, bb, c, x[10], 9, 38016083);
    c = gg(c, d, a, bb, x[15], 14, -660478335); bb = gg(bb, c, d, a, x[4], 20, -405537848);
    a = gg(a, bb, c, d, x[9], 5, 568446438); d = gg(d, a, bb, c, x[14], 9, -1019803690);
    c = gg(c, d, a, bb, x[3], 14, -187363961); bb = gg(bb, c, d, a, x[8], 20, 1163531501);
    a = gg(a, bb, c, d, x[13], 5, -1444681467); d = gg(d, a, bb, c, x[2], 9, -51403784);
    c = gg(c, d, a, bb, x[7], 14, 1735328473); bb = gg(bb, c, d, a, x[12], 20, -1926607734);
    a = hh(a, bb, c, d, x[5], 4, -378558); d = hh(d, a, bb, c, x[8], 11, -2022574463);
    c = hh(c, d, a, bb, x[11], 16, 1839030562); bb = hh(bb, c, d, a, x[14], 23, -35309556);
    a = hh(a, bb, c, d, x[1], 4, -1530992060); d = hh(d, a, bb, c, x[4], 11, 1272893353);
    c = hh(c, d, a, bb, x[7], 16, -155497632); bb = hh(bb, c, d, a, x[10], 23, -1094730640);
    a = hh(a, bb, c, d, x[13], 4, 681279174); d = hh(d, a, bb, c, x[0], 11, -358537222);
    c = hh(c, d, a, bb, x[3], 16, -722521979); bb = hh(bb, c, d, a, x[6], 23, 76029189);
    a = hh(a, bb, c, d, x[9], 4, -640364487); d = hh(d, a, bb, c, x[12], 11, -421815835);
    c = hh(c, d, a, bb, x[15], 16, 530742520); bb = hh(bb, c, d, a, x[2], 23, -995338651);
    a = ii(a, bb, c, d, x[0], 6, -198630844); d = ii(d, a, bb, c, x[7], 10, 1126891415);
    c = ii(c, d, a, bb, x[14], 15, -1416354905); bb = ii(bb, c, d, a, x[5], 21, -57434055);
    a = ii(a, bb, c, d, x[12], 6, 1700485571); d = ii(d, a, bb, c, x[3], 10, -1894986606);
    c = ii(c, d, a, bb, x[10], 15, -1051523); bb = ii(bb, c, d, a, x[1], 21, -2054922799);
    a = ii(a, bb, c, d, x[8], 6, 1873313359); d = ii(d, a, bb, c, x[15], 10, -30611744);
    c = ii(c, d, a, bb, x[6], 15, -1560198380); bb = ii(bb, c, d, a, x[13], 21, 1309151649);
    a = ii(a, bb, c, d, x[4], 6, -145523070); d = ii(d, a, bb, c, x[11], 10, -1120210379);
    c = ii(c, d, a, bb, x[2], 15, 718787259); bb = ii(bb, c, d, a, x[9], 21, -343485551);
    a0 = add32(a0, a); b0 = add32(b0, bb); c0 = add32(c0, c); d0 = add32(d0, d);
  }
  function word(n) {
    var s = '';
    for (var i = 0; i < 4; i++) {
      var byte = (n >>> (8 * i)) & 0xff;
      s += ('0' + byte.toString(16)).slice(-2);
    }
    return s;
  }
  return word(a0) + word(b0) + word(c0) + word(d0);
}

/**
 * La firma che Qobuz vuole per getFileUrl: md5 della concatenazione
 * "trackgetFileUrl" + "format_id<N>" + "intentstream" + "track_id<ID>" +
 * timestamp + app_secret. Senza firma l'API risponde 400.
 */
function qobuzSign(ts, trackId, formatId, appSecret) {
  return md5hex('trackgetFileUrl' + 'format_id' + formatId + 'intentstream' +
    'track_id' + trackId + ts + appSecret);
}

/** I token personali scritti nelle impostazioni: più d'uno, separati da virgole. */

/** Qobuz acceso? (Con i token condivisi funziona anche senza token personali.) */
function qobuzEnabled() {
  var v = setting('qobuzEnabled', true);
  return v !== false && String(v) !== 'false';
}

/** Quanti token del pool possono ancora funzionare (non segnati come morti). */
function userTokens() {
  var entries = [];
  for (var i = 1; i <= 3; i++) {
    var token = trim(String(setting('qobuzPersonalToken' + i, '') || ''));
    var appId = trim(String(setting('qobuzPersonalAppId' + i, '') || ''));
    var appSecret = trim(String(setting('qobuzPersonalAppSecret' + i, '') || ''));
    if (!token || !appId || !appSecret) continue;
    if (!/^[0-9]+$/.test(appId) || !/^[0-9a-f]{32}$/i.test(appSecret)) continue;
    entries.push({token:token,appId:appId,appSecret:appSecret});
  }
  return entries;
}
function usableTokens() {
  var pool = tokenPool();
  var n = 0;
  for (var i = 0; i < pool.length; i++) {
    if (!pool[i].deadUntil || pool[i].deadUntil <= now()) n++;
  }
  return n;
}

/** L'indirizzo base dell'API (modificabile per specchi o per i test). */
function qobuzApi() {
  var custom = trim(String(setting('qobuzApi', '') || ''));
  if (!custom) return QOBUZ_API;
  return custom.charAt(custom.length - 1) === '/' ? custom : custom + '/';
}

/** Il pool salvato in storage (quello remoto, quando c'è), o null. */
function storedPool() {
  var saved = myspoti.storage.get(TOKENS_KEY);
  if (!saved || !saved.list || !saved.list.length) return null;
  if (saved.at && now() - saved.at > POOL_TTL_MS) return null;
  return saved;
}

/**
 * Il pool in uso: prima i token personali, poi il pool remoto (se configurato e
 * ancora fresco), poi quello condiviso scritto qui dentro. Ogni voce ha anche
 * lo stato "morto" per un po', così non si riprova un token appena rifiutato.
 */
function tokenPool() {
  var dead = myspoti.storage.get('qobuz_dead') || {};
  var out = [];
  var seen = {};

  function add(entry, source) {
    if (!entry || !entry.token || seen[entry.token]) return;
    seen[entry.token] = true;
    var at = dead[entry.token] || 0;
    out.push({
      token: entry.token,
      appId: String(entry.appId || QOBUZ_APP.appId),
      appSecret: String(entry.appSecret || QOBUZ_APP.appSecret),
      source: source,
      deadUntil: at && (now() - at) < TOKEN_DEAD_MS ? at + TOKEN_DEAD_MS : 0
    });
  }

  // I token personali vengono prima del pool condiviso. Senza app_id/app_secret
  // si usa l'app dei token pubblici (798273057).
  var mine = userTokens();
  for (var u = 0; u < mine.length; u++) add(mine[u], 'user');

  var saved = storedPool();
  if (saved) {
    for (var i = 0; i < saved.list.length; i++) add(saved.list[i], 'pool');
  }
  for (var j = 0; j < SHARED_TOKENS.length; j++) add(SHARED_TOKENS[j], 'shared');
  return out;
}

function markTokenDead(token) {
  var dead = myspoti.storage.get('qobuz_dead') || {};
  dead[token] = now();
  var keys = [];
  for (var k in dead) if (dead.hasOwnProperty(k)) keys.push(k);
  if (keys.length > 40) {
    keys.sort(function (a, b) { return dead[a] - dead[b]; });
    for (var i = 0; i < keys.length - 40; i++) delete dead[keys[i]];
  }
  try {
    myspoti.storage.set('qobuz_dead', dead);
  } catch (e) {
    AURA_DEV_WRITE('storage piena: ' + e);
  }
}

/**
 * Rilegge il pool da un indirizzo, se l'utente ne ha indicato uno: il formato
 * accettato è quello dell'estensione Echo, un array di {token, app_id,
 * app_secret}, ma va bene anche {tokens: [...]} o un array di sole stringhe.
 */
function refreshPool(force) {
  var url = trim(String(setting('poolUrl', '') || ''));
  if (!url) return false;
  var saved = storedPool();
  if (!force && saved) return true;
  if (leftMs() < 2500) return false;
  var j = httpJson(url, POOL_TIMEOUT);
  var list = [];
  if (j) {
    var raw = j.tokens || j.data || j.accounts || j;
    if (raw && raw.length) {
      for (var i = 0; i < raw.length; i++) {
        var one = raw[i];
        if (!one) continue;
        if (typeof one === 'string') {
          if (one.length >= 20) list.push({ token: one });
          continue;
        }
        var token = one.token || one.user_auth_token || one.userAuthToken;
        if (!token) continue;
        var appId = one.app_id || one.appId || QOBUZ_APP.appId;
        var secret = one.app_secret || one.appSecret;
        if (!secret) {
          secret = String(appId) === '312369995' ? SHARED_TOKENS[0].appSecret : QOBUZ_APP.appSecret;
        }
        list.push({ token: String(token), appId: String(appId), appSecret: String(secret) });
      }
    }
  }
  if (!list.length) {
    AURA_DEV_WRITE('pool: niente da leggere da ' + url);
    return false;
  }
  try {
    myspoti.storage.set(TOKENS_KEY, { list: list, at: now() });
  } catch (e) {
    AURA_DEV_WRITE('storage piena: ' + e);
  }
  AURA_DEV_WRITE('pool: ' + list.length + ' token da ' + url);
  return true;
}


/**
 * Una chiamata all'API Qobuz, provando i token del pool a rotazione.
 *
 * Il token viaggia nella query (`user_auth_token`), non in un'intestazione: è
 * l'unico modo che Qobuz accetta allo stesso modo da tutti i client, e nel
 * sandbox di Myspoti non si dipende dal supporto delle intestazioni.
 *
 * Restituisce { status, body, entry } oppure null se nessun token risponde.
 * 401/403 = quel token è morto (o l'account ha perso l'abbonamento): si passa
 * al successivo e lo si ricorda per un po'.
 */
/* TIGRO DIAG 1: passive, redacted; no network calls or resolver decisions. */
function tigroQobuzDiag(path, entry, slot, res, body, fallback) {
  if (!personalOnly || !AURA_DEV_LOGS()) return;
  var status = res ? res.status : 'NETWORK';
  var hasUrl = !!(body && typeof body.url === 'string' && /^https:\/\//i.test(body.url));
  var preview = !!(body && (body.sample === true || (body.url && /[?&]range=/.test(String(body.url)))));
  var mime = body && typeof body.mime_type === 'string' ? body.mime_type.toLowerCase() : '';
  var codec = mime.indexOf('flac') >= 0 ? 'FLAC_DICHIARATO' : 'NON_VERIFICATO';
  var auth = status === 401 || status === 403 ? 'RIFIUTATA' : 'NON_VERIFICATA';
  var outcome = fallback ? 'FALLBACK' : (status === 200 ? 'RISPOSTA' : 'ERRORE');
  AURA_DEV_WRITE('Qobuz personale [AUDIT] endpoint=' + path + ' slot_tentativo=' + slot +
    ' origine=' + (entry && entry.source === 'user' ? 'PERSONALE' : 'ALTRO') +
    ' HTTP=' + status + ' auth=' + auth + ' identita=NON_VERIFICATA' +
    ' url_https=' + hasUrl + ' preview=' + preview + ' codec=' + codec +
    ' stream_bytes=NON_VERIFICATI esito=' + outcome);
}

/* TIGRO 257: read-only account pool audit. Never log credentials or identifiers. */
function tigroPersonalPoolAudit(path, pool, order) {
  if (!personalOnly || !AURA_DEV_LOGS()) return;
  var seen = [];
  var configured = 0, structurallyValid = 0, duplicates = 0;
  for (var slot = 1; slot <= 3; slot++) {
    var token = trim(String(setting('qobuzPersonalToken' + slot, '') || ''));
    var id = trim(String(setting('qobuzPersonalAppId' + slot, '') || ''));
    var secret = trim(String(setting('qobuzPersonalAppSecret' + slot, '') || ''));
    var present = !!(token || id || secret);
    var complete = !!(token && id && secret);
    var valid = complete && /^[0-9]+$/.test(id) && /^[0-9a-f]{32}$/i.test(secret);
    var duplicate = valid && seen.indexOf(token) >= 0;
    if (present) configured++;
    if (valid) structurallyValid++;
    if (duplicate) duplicates++;
    if (valid && !duplicate) seen.push(token);
    // TIGRO 258: diagnostic classification only; the original validity gate above is unchanged.
    var invalidReasons = [];
    if (complete && !valid) {
      if (!/^[0-9]+$/.test(id)) invalidReasons.push('APP_ID_NON_NUMERICO');
      if (secret.length !== 32) invalidReasons.push('APP_SECRET_LUNGHEZZA_ERRATA');
      if (!/^[0-9a-f]+$/i.test(secret)) invalidReasons.push('APP_SECRET_NON_ES ADECIMALE'.replace(' ', ''));
    }
    var status = !present ? 'VUOTO' : !complete ? 'INCOMPLETO' : !valid ? 'FORMATO_NON_VALIDO' : duplicate ? 'DUPLICATO' : 'AMMESSO';
    var loaded = false, remaining = 0;
    if (valid && !duplicate) {
      for (var j = 0; j < pool.length; j++) {
        if (pool[j].token === token && pool[j].source === 'user') {
          loaded = true;
          remaining = pool[j].deadUntil ? Math.max(0, Math.ceil((pool[j].deadUntil - now()) / 1000)) : 0;
          break;
        }
      }
    }
    AURA_DEV_WRITE('Qobuz personale [POOL261] slot=' + slot + ' configurato=' + present +
      ' campi_completi=' + complete + ' filtro=' + status + ' motivo=' + (invalidReasons.length ? invalidReasons.join(',') : 'NESSUNO') + ' caricato=' + loaded +
      ' esclusione_secondi=' + remaining);
  }
  AURA_DEV_WRITE('Qobuz personale [POOL261] endpoint=' + path + ' configurati=' + configured +
    ' strutturalmente_validi=' + structurallyValid + ' duplicati=' + duplicates +
    ' pool_personale=' + pool.length + ' ordine_tentativi=' + order.length +
    ' limite_tentativi=' + MAX_TOKEN_TRIES);
}
function tigroPoolEvent(path, entry, position, event, status) {
  if (!personalOnly || !AURA_DEV_LOGS()) return;
  var slot = 0;
  for (var j = 1; j <= 3; j++) {
    if (entry && entry.token === trim(String(setting('qobuzPersonalToken' + j, '') || ''))) { slot = j; break; }
  }
  AURA_DEV_WRITE('Qobuz personale [POOL261] endpoint=' + path + ' slot_reale=' +
    (slot || 'SCONOSCIUTO') + ' posizione=' + position + ' evento=' + event +
    (status === undefined ? '' : ' HTTP=' + status));
}

// DEV311: instrumented, short-lived, account-scoped cache for confirmed Qobuz previews.
// In-memory only. Never caches 401, network failures, or valid streams.
var qobuzPreviewMiss = {}, qobuzPreviewKeys = [];
var QOBUZ_PREVIEW_MISS_TTL = 60000, QOBUZ_PREVIEW_MISS_MAX = 96;
var previewStats311 = {hit:0, miss:0, store:0, expired:0};
function previewLog311(event, key) {
  if (!key || !AURA_DEV_LOGS()) return;
  AURA_DEV_WRITE('[PERF311] Qobuz preview CACHE_' + event +
    ' hit=' + previewStats311.hit + ' miss=' + previewStats311.miss +
    ' store=' + previewStats311.store + ' expired=' + previewStats311.expired +
    ' richieste_evitate=' + previewStats311.hit);
}
function previewMissKey(entry, params) {
  if (!entry || entry.source !== 'user' || !params || params.track_id === undefined) return '';
  // Token and app ID distinguish accounts. Values remain private in memory, never logged.
  return String(entry.appId) + '|' + String(entry.token) + '|' + String(params.track_id) + '|' + String(params.format_id || '');
}
function previewMissFresh(key) {
  if (!key) return false;
  if (!Object.prototype.hasOwnProperty.call(qobuzPreviewMiss, key)) {
    previewStats311.miss++; previewLog311('MISS', key); return false;
  }
  if (Date.now() - qobuzPreviewMiss[key] < QOBUZ_PREVIEW_MISS_TTL) {
    previewStats311.hit++; previewLog311('HIT', key); return true;
  }
  delete qobuzPreviewMiss[key];
  previewStats311.expired++; previewStats311.miss++;
  previewLog311('EXPIRED', key);
  previewLog311('MISS', key);
  return false;
}
function previewMissRemember(key) {
  if (!key) return;
  if (!Object.prototype.hasOwnProperty.call(qobuzPreviewMiss, key)) qobuzPreviewKeys.push(key);
  qobuzPreviewMiss[key] = Date.now();
  previewStats311.store++; previewLog311('STORE', key);
  while (qobuzPreviewKeys.length > QOBUZ_PREVIEW_MISS_MAX) {
    var old = qobuzPreviewKeys.shift();
    // Entries are only inserted once per lifetime, unless evicted.
    delete qobuzPreviewMiss[old];
  }
}
function qobuzCall(path, params, opts) {
  if (leftMs() < 1200) return null;
  refreshPool(false); // se c'è un pool da leggere e non è già fresco
  var pool = tokenPool();
  if (personalOnly) pool = pool.filter(function(entry) { return entry.source === 'user'; });
  if (!pool.length) {
    tigroPersonalPoolAudit(path, pool, []);
    return null;
  }
  var startAt = parseInt(String(myspoti.storage.get('qobuz_next') || '0'), 10) || 0;
  if (pool[0].source === 'user') startAt = 0;
  var order = [];
  for (var n = 0; n < pool.length; n++) order.push(pool[(startAt + n) % pool.length]);

  tigroPersonalPoolAudit(path, pool, order);
  var tries = 0;
  var last = null;
  for (var i = 0; i < order.length && tries < MAX_TOKEN_TRIES; i++) {
    var entry = order[i];
    if (entry.deadUntil && entry.deadUntil > now()) {
      tigroPoolEvent(path, entry, i + 1, 'ESCLUSO_TOKEN');
      continue;
    }
    if (leftMs() < 1000) { tigroPoolEvent(path, entry, i + 1, 'TIME_BUDGET'); break; }
    // Cache only a previously confirmed preview for this exact personal account/track/format.
    var previewKey = path === 'track/getFileUrl' && personalOnly ? previewMissKey(entry, params) : '';
    if (previewMissFresh(previewKey)) {
      continue;
    }
    tries++;
    tigroPoolEvent(path, entry, i + 1, 'TENTATIVO');

    var extra = '';
    var signed = opts && opts.sign ? opts.sign(entry) : null;
    for (var key in params) {
      if (params.hasOwnProperty(key) && params[key] !== null && params[key] !== undefined) {
        extra += '&' + key + '=' + encodeURIComponent(String(params[key]));
      }
    }
    if (signed) extra += '&request_sig=' + encodeURIComponent(signed);

    var url = qobuzApi() + path + '?app_id=' + encodeURIComponent(entry.appId) +
      '&user_auth_token=' + encodeURIComponent(entry.token) + extra;
    var res = httpRaw(url, Math.min(tries === 1 ? FAST_TIMEOUT : TIMEOUT, Math.max(1500, leftMs() - 600)));
    if (!res) {
      tigroPoolEvent(path, entry, i + 1, 'SENZA_RISPOSTA');
      tigroQobuzDiag(path, entry, i + 1, null, null, true);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      tigroPoolEvent(path, entry, i + 1, 'TOKEN_RIFIUTATO', res.status);
      tigroQobuzDiag(path, entry, i + 1, res, null, true);
      markTokenDead(entry.token);
      AURA_DEV_WRITE('qobuz: token ' + entry.source + ' rifiutato (' + res.status + ')');
      continue;
    }
    var body = null;
    try {
      body = JSON.parse(res.body);
    } catch (e) {
      body = null;
    }
    if (!body) {
      tigroQobuzDiag(path, entry, i + 1, res, null, true);
      AURA_DEV_WRITE('qobuz: risposta non JSON da ' + path + ' (' + res.status + ')');
      last = { status: res.status, body: null, entry: entry };
      continue;
    }
    if (res.status === 200) {
      // Per getFileUrl una preview HTTP 200 NON equivale a uno stream completo.
      // Prova gli altri account personali prima di restituire la risposta.
      if (path === 'track/getFileUrl' && body &&
          (body.sample === true || (body.url && /[?&]range=/.test(String(body.url))))) {
        AURA_DEV_WRITE('qobuz: account ' + (i + 1) + '/' + order.length +
          ' ha restituito una preview; provo il prossimo account');
        previewMissRemember(previewKey);
        tigroPoolEvent(path, entry, i + 1, 'PREVIEW', res.status);
        tigroQobuzDiag(path, entry, i + 1, res, body, true);
        last = { status: 200, body: body, entry: entry };
        continue;
      }
      // DEV 1.2.8: HTTP 200 da getFileUrl non basta: serve un URL completo.
      // Un token con permessi limitati puo' rispondere 200 senza file riproducibile.
      if (path === 'track/getFileUrl' && (!body.url || !/^https:\/\//i.test(String(body.url)))) {
        AURA_DEV_WRITE('qobuz: token ' + (i + 1) + '/' + order.length +
          ' HTTP 200 senza URL HTTPS valido; passo al successivo');
        tigroPoolEvent(path, entry, i + 1, 'URL_NON_VALIDO', res.status);
        tigroQobuzDiag(path, entry, i + 1, res, body, true);
        last = {status:200,body:body,entry:entry};
        continue;
      }
      tigroPoolEvent(path, entry, i + 1, 'RISPOSTA_ACCETTATA', res.status);
      if (path === 'track/getFileUrl') tigroQobuzDiag(path, entry, i + 1, res, body, false);
      // Ricorda quale token funziona: la prossima chiamata riparte da lì.
      try {
        myspoti.storage.set('qobuz_next', String((startAt + i) % pool.length));
      } catch (e) {
        AURA_DEV_WRITE('storage piena: ' + e);
      }
      return { status: 200, body: body, entry: entry };
    }
    // 400/404/5xx: non è colpa del token, inutile insistere con altri.
    tigroQobuzDiag(path, entry, i + 1, res, body, false);
    return { status: res.status, body: body, entry: entry };
  }
  if (personalOnly && AURA_DEV_LOGS()) AURA_DEV_WRITE('Qobuz personale [POOL261] endpoint=' + path + ' fine_tentativi=' + tries + ' risultato=' + (last ? 'ULTIMA_RISPOSTA' : 'NESSUNA_RISPOSTA'));
  if (tries >= MAX_TOKEN_TRIES) AURA_DEV_WRITE('qobuz: nessun token del pool ha risposto');
  return last;
}

/** Le tracce Qobuz per una ricerca, già nella forma dei candidati. */
function qobuzSearchTracks(query) {
  if (!trim(query)) return [];
  var res = qobuzCall('track/search', { query: query, limit: 20 });
  var items = res && res.body && res.body.tracks ? res.body.tracks.items : null;
  if (!items || !items.length) return [];
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var t = items[i];
    if (!t || t.id === undefined) continue;
    var title = String(t.title == null ? '' : t.title);
    if (t.version) title += ' (' + t.version + ')';
    var artist = t.performer && t.performer.name ? t.performer.name
      : (t.artist && t.artist.name ? t.artist.name : '');
    var album = t.album && t.album.title ? t.album.title : '';
    var depth = t.maximum_bit_depth || 0;
    var rate = t.maximum_sampling_rate || 0;
    out.push({
      id: QOBUZ_PREFIX + t.id,
      title: trim(title),
      artist: artist,
      album: album,
      duration: t.duration,
      isrc: t.isrc || '',
      audioQuality: depth ? (depth + '-bit / ' + rate + ' kHz') : '',
      hires: !!t.hires,
      source: 'Qobuz'
    });
  }
  return out;
}

/** In streaming: l'URL del FLAC per un id qz:<trackId>, 24-bit se c'è. */
function qobuzAnswer(trackId, wantHiRes) {
  var formats = wantHiRes ? [FORMAT_HI, FORMAT_CD] : [FORMAT_CD, FORMAT_HI];
  var last = null;
  for (var i = 0; i < formats.length; i++) {
    if (leftMs() < 1500) return { ok: false, reason: 'timeout' };
    var fmt = formats[i];
    var ts = Math.floor(now() / 1000);
    var res = qobuzCall('track/getFileUrl', {
      request_ts: ts,
      track_id: trackId,
      format_id: fmt,
      intent: 'stream'
    }, {
      // La firma dipende dalla secret dell'app del token che risponde.
      sign: function (entry) {
        return qobuzSign(ts, trackId, fmt, entry.appSecret);
      }
    });
    if (res && res.status === 200 && res.body && res.body.url) {
      var b = res.body;
      if (b.sample === true || /[?&]range=/.test(String(b.url))) {
        AURA_DEV_WRITE('qobuz ' + trackId + ': anteprima di 30 secondi — brano lasciato a Spotify');
        return { ok: false, reason: 'preview' };
      }
      var gotDepth = parseInt(b.bit_depth, 10) || 0;
      var gotRate = Math.round((parseFloat(b.sampling_rate) || 0) * 1000);
      qlog('qobuz ' + trackId + ': richiesto format_id=' + fmt + (fmt === FORMAT_HI ? ' (hi-res)' : ' (CD)') +
        ' → ricevuto format_id=' + (b.format_id || '?') + ', ' + qualityLabel(gotDepth, gotRate) +
        ', mime=' + (b.mime_type || '?') + (b.duration ? ', durata ' + b.duration + ' s' : ''));
      if (fmt === FORMAT_HI && !isHiResQuality(gotDepth, gotRate)) {
        qlog('qobuz ' + trackId + ': hi-res richiesto ma Qobuz ha restituito solo lossless 16-bit (il brano non ha una versione hi-res o il token non la include)');
      }
      if (b.mime_type && !/flac/i.test(String(b.mime_type))) {
        qlog('qobuz ' + trackId + ': ATTENZIONE, il formato ricevuto non è FLAC (' + b.mime_type + ')');
      }
      return {
        ok: true,
        answer: {
          url: String(b.url),
          format: 'flac',
          codec: 'flac',
          bitDepth: gotDepth,
          sampleRate: gotRate,
          size: 0,
          expiresAt: tokenExpiry(b.url),
          at: now(),
          isrcMatched: false
        }
      };
    }
    last = res && res.body && res.body.message ? String(res.body.message) : ('HTTP ' + (res ? res.status : '?'));
    if (res && (res.status === 401 || res.status === 403)) break; // nessun token buono
  }
  AURA_DEV_WRITE('qobuz ' + trackId + ': ' + (last || 'nessun token'));
  return { ok: false, reason: 'error' };
}

/**
 * Gli id dei candidati per un brano, dal migliore al peggiore:
 * { ids: [ { i: "19170173", h: 1 }, … ], at }. In storage per due settimane:
 * così un brano già abbinato costa una sola richiesta (lo stream).
 */
function findCandidates(track, backup) {
  var key = matchKey(track) + (backup ? '#bc' : (personalOnly ? '#personal' : ''));
  var cached = readCache(key);
  if (cached) return cached;

  var queries = queriesFor(track, backup);
  var maxQ = backup ? 2 : MAX_QUERIES;
  var seen = {};
  var all = [];
  // TWC304: provider-health snapshot for this lookup; avoid repeated storage reads.
  var providerSnapshot = providers();
  for (var i = 0; i < queries.length && i < maxQ; i++) {
    if (i > 0 && leftMs() < 2500) break; // il tempo dell'hook è quasi finito
    var ranked = rankCandidates(searchTracks(queries[i], backup), track);
    for (var j = 0; j < ranked.length; j++) {
      var id = String(ranked[j].item.id);
      if (seen[id]) continue;
      seen[id] = true;
      all.push(ranked[j]);
    }
    // Abbinamento netto: inutile insistere, ma solo se arriva da una fonte che
    // ha già dimostrato di servire audio. Un "Deezer perfetto" non serve a nulla.
    var good = 0;
    for (var g = 0; g < all.length; g++) {
      var known = providerSnapshot[providerOf(all[g].item.id)];
      if (known && known.ok) { good++; break; }
    }
    var byIsrc = false;
    for (var q = 0; q < all.length; q++) if (all[q].isrcMatched) { byIsrc = true; break; }
    if (byIsrc || (all.length && all[0].score >= 90 && good)) break;
  }
  if (!all.length) return null;

  all.sort(function (x, y) { return y.score - x.score; });
  var ids = [];
  for (var k = 0; k < all.length && k < MAX_CANDIDATES; k++) {
    ids.push({
      i: String(all[k].item.id),
      h: all[k].hiRes ? 1 : 0,
      d: durationSec(all[k].item),
      s: Math.round(all[k].score),
      p: providerOf(all[k].item.id),
    });
  }
  // ok: l'id che ha già risposto (si riprova quello per primo);
  // bad: gli id che il servizio ha rifiutato (502): inutile riprovarli.
  var entry = { ids: ids, ok: null, bad: [], at: now() };
  writeCache(key, entry);
  return entry;
}

/* ------------------------------------------------------------------ */
/* Stream                                                              */
/* ------------------------------------------------------------------ */

/**
 * Perché una risposta del servizio non è un brano intero lossless (null: va bene).
 * Il servizio può degradare e servire anteprime: URL con `range=…`, formato MP3,
 * o `fmt=` diverso da 6/7 (i codici FLAC di Qobuz). Meglio dirlo che far suonare
 * trenta secondi.
 */
function previewReason(info) {
  if (!info || !info.url) return 'nessun indirizzo';
  var url = String(info.url);
  var format = String(info.format || info.codec || '').toLowerCase();
  if (/[?&]range=/.test(url)) return 'anteprima (range nell\'indirizzo)';
  var fmt = /[?&]fmt=(\d+)/.exec(url);
  if (fmt && fmt[1] !== '6' && fmt[1] !== '7') return 'formato non lossless (fmt=' + fmt[1] + ')';
  if (format && format !== 'flac') return 'formato ' + format + ' (non FLAC)';
  return null;
}

/**
 * Internet Archive mette il titolo del brano nel nome del file, e l'addon a
 * volte pesca il file sbagliato dentro l'item ("In the Mood" -> "I've Got a Gal
 * in Kalamazoo.flac"). Dove il nome è parlante si controlla: se non c'entra con
 * il titolo del brano, la risposta si scarta. Nomi senza parole (hash, "6-09-73_
 * t19_24-96.flac") non si possono giudicare e si lasciano passare.
 */
/**
 * Le parole che contano per riconoscere un brano: almeno tre lettere, niente
 * cifre ("op", "no" e "1" non aiutano) e niente paroline di servizio.
 */
var SKIP_WORDS = ['the', 'and', 'for', 'you', 'all', 'not', 'but', 'con', 'del', 'dei',
  'della', 'gli', 'una', 'uno', 'per', 'non', 'nel', 'sua', 'suo', 'live', 'version',
  'edit', 'remaster', 'remastered', 'mono', 'stereo', 'vol'];
function significantWords(text) {
  var parts = tokensOf(String(text == null ? '' : text));
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var w = parts[i];
    if (w.length >= 3 && !/[0-9]/.test(w) && indexOf(SKIP_WORDS, w) < 0) out.push(w);
  }
  return out;
}

function fileLooksRight(url, track) {
  var last = String(url || '').split('?')[0].split('/').pop();
  if (!last || !/\.(flac|mp3|m4a)$/i.test(last)) return true;
  // Nome del file: minuscole, senza estensione e senza punteggiatura. Non si usa
  // norm() qui: taglia tutto dopo " - ", che in un nome di file è normale.
  var name = '';
  try {
    name = decodeURIComponent(last);
  } catch (e) {
    name = last;
  }
  name = fold(name).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^a-z0-9]+/g, ' ');
  var words = significantWords(name);
  if (words.length < 2) return true; // nome non parlante ("01.flac", "6-09-73_t19")
  var want = significantWords(norm(track && track.title));
  if (!want.length) return true; // titolo fatto solo di numeri e paroline
  var hit = 0;
  for (var j = 0; j < want.length; j++) {
    if (indexOf(words, want[j]) >= 0) hit++;
  }
  return hit / want.length >= 0.5;
}

/**
 * Un file enorme per un brano corto è un concerto intero (o un'altra cosa):
 * meglio lasciar perdere. Senza Content-Length non si giudica.
 */
function tooBigFor(answer, track) {
  var seconds = trackDurationSec(track);
  if (!answer || !answer.size || !seconds) return false;
  return answer.size > (seconds * MAX_MB_PER_SECOND + 30) * 1024 * 1024;
}

/** Fine validità del token nell'URL (epoch ms), 0 se non c'è (il token dura ~1 h). */
function tokenExpiry(url) {
  var m = /[?&]etsp=(\d{9,})/.exec(String(url || ''));
  if (!m) return 0;
  return parseInt(m[1], 10) * 1000;
}

/**
 * Chiede al servizio l'URL del FLAC di un id.
 * null quando quell'id non è riproducibile (il servizio risponde 502 su alcune
 * versioni hi-res) o la risposta non è un FLAC.
 */
function buildAnswer(id, wantHiRes) {
  if (leftMs() < 2000) return { ok: false, reason: 'timeout' };
  if (providerOf(id) === 'qz') return qobuzAnswer(String(id).slice(3), wantHiRes);
  var url = base() + '/stream/' + encodeURIComponent(id) + '?quality=' + (wantHiRes ? 'HI_RES' : 'LOSSLESS');
  var raw = httpRaw(url);
  var info = null;
  if (raw && raw.body) {
    try {
      info = JSON.parse(raw.body);
    } catch (e) {
      info = null;
    }
  }
  if (!info || !info.url) {
    var why = info && info.error ? String(info.error) : ('HTTP ' + (raw ? raw.status : '?'));
    // "not available in this addon": questa fonte qui non serve audio.
    var noAudio = raw && raw.status === 404;
    AURA_DEV_WRITE('stream ' + id + ': ' + why);
    return { ok: false, reason: noAudio ? 'no-audio' : 'error' };
  }
  var preview = previewReason(info);
  if (preview) {
    AURA_DEV_WRITE('stream ' + id + ': ' + preview + ' — brano lasciato a Spotify');
    return { ok: false, reason: 'preview' };
  }
  qlog('stream ' + id + ': richiesto ' + (wantHiRes ? 'HI_RES' : 'LOSSLESS') + ' → ricevuto formato=' +
    (info.format || info.codec || '?') + ', qualità=' + (info.quality || '?') +
    ', ' + qualityLabel(info.bitDepth || 0, info.sampleRate || 0));
  var answer = {
    url: info.url,
    format: String(info.format || info.codec || 'flac').toLowerCase(),
    codec: 'flac',
    bitDepth: info.bitDepth || bitDepthOf({ audioQuality: info.quality }) || 0,
    sampleRate: info.sampleRate || sampleRateOf({ audioQuality: info.quality }) || 0,
    size: 0,
    expiresAt: tokenExpiry(info.url),
    at: now(),
    isrcMatched: false
  };
  return { ok: true, answer: answer };
}

/**
 * L'ordine in cui provare gli id: prima quello che ha già funzionato, poi i
 * migliori; a CD il 16-bit prima (file più piccolo). Gli id che il servizio ha
 * rifiutato vanno in fondo, non si buttano: se cambia idea restano lì.
 */
function orderIds(entry, wantHiResFirst, track, asDownload) {
  var bad = entry.bad || [];
  var want = track ? trackDurationSec(track) : 0;

  // 1. Durata: per un download Myspoti accetta solo file fra -5 s e +15 s.
  var byDuration = [];
  for (var k = 0; k < entry.ids.length; k++) {
    var id = entry.ids[k];
    if (asDownload && want && id.d && !(id.d >= want - 5 && id.d <= want + 15)) continue;
    byDuration.push(id);
  }
  // Nessuna edizione con la durata giusta: meglio niente file che uno che
  // Myspoti rifiuterebbe dopo averlo scaricato tutto.
  if (!byDuration.length) {
    if (asDownload) return [];
    byDuration = entry.ids.slice(0);
  }

  // 2. Fonti: quelle che hanno già detto di non avere audio si saltano.
  var usable = [];
  for (var m = 0; m < byDuration.length; m++) {
    if (providerUsable(byDuration[m].i)) usable.push(byDuration[m]);
  }
  if (!usable.length) return []; // niente da provare: si risponde subito

  // Ordine dei tentativi: prima le fonti già viste funzionare, poi (se serve)
  // l'alta risoluzione, poi il punteggio di abbinamento.
  var known = providers();
  function provRank(id) {
    var k = known[String(id).split(':')[0]];
    if (!k) return 1; // fonte mai provata
    return k.ok ? 0 : 2;
  }
  usable.sort(function (x, y) {
    var rx = provRank(x.i);
    var ry = provRank(y.i);
    if (rx !== ry) return rx - ry;
    if (wantHiResFirst && x.h !== y.h) return x.h ? -1 : 1;
    return (y.s || 0) - (x.s || 0);
  });

  var okHi = 1;
  for (var n = 0; n < usable.length; n++) {
    if (String(usable[n].i) === String(entry.ok)) okHi = usable[n].h;
  }
  var out = [];
  // L'id che ha già funzionato va per primo, se è della qualità cercata.
  if (entry.ok && indexOf(bad, entry.ok) < 0 && (wantHiResFirst || okHi === 0)) out.push(String(entry.ok));
  for (var i = 0; i < usable.length; i++) {
    var one = String(usable[i].i);
    if (one === entry.ok || indexOf(bad, one) >= 0) continue;
    out.push(one);
  }
  return out;
}

/** La risposta per un brano (con cache), o null. [wantHiRes] e [asDownload] ordinano i tentativi. */
function streamFor(track, wantHiRes, asDownload) {
  if (!isMyspotiTrack(track)) return null;
  var key = matchKey(track) + (personalOnly ? '#personal' : '');
  var hiResFirst = wantHiRes === undefined ? preferHiRes() : !!wantHiRes;

  var kept = answers[key];
  if (kept) {
    // Pochi secondi dopo la stessa richiesta: quasi sempre Myspoti che riprova
    // perché l'indirizzo è stato rifiutato. Si ricostruisce invece di ripeterlo.
    if (now() - (kept.at || 0) < RETRY_MS) {
      delete answers[key];
    } else {
      var fresh = kept.expiresAt ? (kept.expiresAt - now() > MIN_LEFT_MS)
                                 : (now() - (kept.at || 0) < KEEP_ANSWER_MS);
      if (fresh) return kept;
      delete answers[key];
    }
  }

  return streamVia(track, key, hiResFirst, asDownload, false);
}

/** BitChord / Internet Archive: ultimo ripiego (solo audio, mai download). */
function bitchordFor(track) {
  if (!isMyspotiTrack(track) || !backupEnabled()) return null;
  return streamVia(track, matchKey(track), preferHiRes(), false, true);
}

/** Cerca e prova i candidati di una fonte: Qobuz, oppure (backup) l'addon BitChord. */
function streamVia(track, key, hiResFirst, asDownload, backup) {
  var ckey = key + (backup ? '#bc' : '');
  var entry = findCandidates(track, backup);
  if (!entry) {
    AURA_DEV_WRITE('nessun abbinamento per "' + track.title + '" — ' + track.artist);
    return null;
  }

  var ids = orderIds(entry, hiResFirst, track, asDownload).filter(function (x) {
    return backup ? providerOf(x) !== 'qz' : providerOf(x) === 'qz';
  });
  if (!ids.length) {
    // Tutte le fonti di questo brano hanno già detto di non avere audio:
    // si risponde subito, senza riprovare e senza sporcare il log.
    if (!entry.dead) writeCache(ckey, { ids: entry.ids, ok: entry.ok, bad: entry.bad, at: entry.at, dead: true });
    return null;
  }
  var changed = false;
  for (var i = 0; i < ids.length && i < MAX_TRIES; i++) {
    if (i > 0 && leftMs() < 2500) break;
    var out = buildAnswer(ids[i], hiResFirst);
    if (out.ok) {
      var answer = out.answer;
      // Il file è un altro brano (Internet Archive pesca a volte il file sbagliato)?
      if (!fileLooksRight(answer.url, track)) {
        AURA_DEV_WRITE('stream ' + ids[i] + ': il file è un altro brano — scartato');
        continue;
      }
      // Un file enorme per un brano corto è un concerto intero: solo per IA,
      // che è l'unica fonte che può servire item di ore.
      if (!answer.size && providerOf(ids[i]) === 'ia') answer.size = sizeOf(answer.url);
      if (tooBigFor(answer, track)) {
        AURA_DEV_WRITE('stream ' + ids[i] + ': file di ' + Math.round(answer.size / 1048576) + ' MB, troppo per questo brano');
        continue;
      }
      answers[key] = answer;
      var gotHi = isHiResQuality(answer.bitDepth, answer.sampleRate);
      qlog('RIEPILOGO "' + track.title + '" — ' + track.artist + ' | fonte ' + ids[i] +
        ' | ' + qualityLabel(answer.bitDepth, answer.sampleRate) +
        ' | richiesto ' + (hiResFirst ? 'hi-res' : 'CD') +
        ' | esito: ' + (hiResFirst && !gotHi ? 'ripiegato su 16-bit' : (gotHi ? 'HI-RES' : 'CD lossless')) +
        (i > 0 ? ' | al tentativo ' + (i + 1) : ''));
      markProvider(ids[i], true);
      if (entry.ok !== ids[i]) {
        entry.ok = ids[i];
        changed = true;
      }
      break;
    }
    if (out.reason === 'no-audio') {
      markProvider(ids[i], false);
      if (entry.ok === ids[i]) {
        entry.ok = null;
        changed = true;
      }
    }
    // preview, timeout o errore di rete: si prova il candidato successivo
  }
  if (changed) writeCache(ckey, entry);
  if (!answers[key]) {
    AURA_DEV_WRITE('nessuno stream utilizzabile per "' + track.title + '"');
    return null;
  }
  return answers[key];
}

/**
 * expiresInMs per l'hook: solo quando il token scade prima della finestra in cui
 * Myspoti tiene una risposta (dieci minuti); altrimenti il default va benissimo.
 */
function expiresInMs(answer) {
  if (!answer.expiresAt) return undefined;
  var left = answer.expiresAt - now();
  if (left <= MIN_LEFT_MS) return undefined;
  if (left >= KEEP_ANSWER_MS + 60000) return undefined;
  return left - 30000;
}

/* ------------------------------------------------------------------ */
/* Hook                                                               */
/* ------------------------------------------------------------------ */

function hasFeature(name) {
  // Su una Myspoti più vecchia `features` può mancare del tutto.
  return !myspoti.features || myspoti.features.indexOf(name) >= 0;
}


/* ------------------------------------------------------------------ */
/* Eclipse - Deezer: FLAC lossless tramite il tuo addon Eclipse          */
/* (link personale con il tuo ARL, incollato nelle impostazioni).        */
/* ------------------------------------------------------------------ */
var ECL = (function () {
var CACHE_KEY = 'matches_eclipse';
var QUALITY = { 'Lossless': 'lossless', 'High': 'high', 'Low': 'low' };
var TIMEOUT = 6000, MIN_SCORE = 55;
var KEEP_MS = 9 * 60 * 1000, MIN_LEFT_MS = 60 * 1000, RETRY_MS = 5000, MISS_MS = 10 * 60 * 1000;
var TTL_MATCH_MS = 14 * 24 * 60 * 60 * 1000;
var MAX_CACHE = 600, MAX_IDS = 4, MAX_TRIES = 3, MAX_QUERIES = 3;
var kept = {}, missed = {}, t0 = 0, lastStatus = 200, errKind = '';
var FOLD = { 'à':'a','á':'a','â':'a','ä':'a','ã':'a','å':'a','è':'e','é':'e','ê':'e','ë':'e','ì':'i','í':'i','î':'i','ï':'i','ò':'o','ó':'o','ô':'o','ö':'o','õ':'o','ù':'u','ú':'u','û':'u','ü':'u','ç':'c','ñ':'n' };

/* ---- utilità, impostazioni, log ---- */
function now() { return new Date().getTime(); }
function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
function has(arr, v) { for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true; return false; }
function log(m) { try { AURA_DEV_WRITE('ED: ' + m); } catch (e) {} }
function setting(k, d) {
  var v = tigroVaultSetting(k);
  return (v === undefined || v === null || v === '') ? d : v;
}
function logsOn() { return AURA_DEV_LOGS(); }
function qlog(m) { if (logsOn()) log('[QUALITÀ] ' + m); }
function left() { return leftMs(); }
function tmo(ms) { return Math.max(1200, Math.min(ms || TIMEOUT, left())); }
var tigroDeezerSlot = 1;
function base() {
  var s = trim(setting(tigroDeezerSlot === 1 ? 'eclipseUrl' : 'eclipseUrl' + tigroDeezerSlot, ''));
  if (!s) return null;
  return s.replace(/\/?manifest\.json$/, '').replace(/\/+$/, '');
}
function quality() { return QUALITY[setting('quality', 'Lossless')] || 'lossless'; }
function strict(q) { return q === 'lossless' && setting('losslessOnly', true) !== false; }
function tolerance() {
  var v = String(setting('tolerance', ''));
  return v.indexOf('Rigorosa') === 0 ? 3 : v.indexOf('Permissiva') === 0 ? 15 : 6;
}
function put(o, k, v) { if (v !== undefined && v !== null) o[k] = v; }

function getJson(url) {
  var r;
  lastStatus = 0;
  try { r = myspoti.http.get(url, { timeout: tmo() }); }
  catch (e) { errKind = 'net'; log('rete: ' + String(e).slice(0, 80)); return null; }
  lastStatus = r ? r.status : 0;
  if (!r || !r.ok) {
    errKind = lastStatus === 429 ? 'busy' : (lastStatus >= 500 ? 'down' : errKind);
    if (errKind === 'busy') retryHint = retryAfterMs(r);
    // il link personale non va mai nel registro
    log('http ' + (r ? r.status : '?') + ' ' + String(url).replace(base() || '@', '').slice(0, 60));
    return null;
  }
  try { return r.json(); } catch (e) { try { return JSON.parse(r.body); } catch (e2) { return null; } }
}

/* ---- testo e abbinamento ---- */
function norm(s) {
  var t = String(s == null ? '' : s).toLowerCase(), o = '';
  for (var i = 0; i < t.length; i++) { var c = t.charAt(i); o += FOLD[c] || c; }
  o = o.replace(/\((?:feat|ft|featuring|with|con)\b[^)]*\)/g, ' ').replace(/\[(?:feat|ft|featuring|with|con)\b[^\]]*\]/g, ' ');
  o = o.replace(/\s+-\s+.*$/, ' ').replace(/\b(?:feat|ft|featuring)\.?\s+.*$/, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ');
  return trim(o);
}
function cleanTitle(t) {
  var o = String(t == null ? '' : t);
  o = o.replace(/\s*\((?:feat|ft|featuring|with|con|remaster(?:ed)?|deluxe|bonus|version|edit|mix)[^)]*\)/gi, '').replace(/\s*\[(?:feat|ft|featuring|with|con|remaster(?:ed)?|deluxe|bonus)[^\]]*\]/gi, '');
  o = o.replace(/\s+-\s+.*$/, '').replace(/\s+(?:feat|ft|featuring)\.?\s+.*$/i, '');
  return trim(o) || trim(t);
}
function overlap(a, b) {
  if (!a || !b) return 0;
  var ta = a.split(' '), tb = b.split(' '), hit = 0;
  for (var i = 0; i < ta.length; i++) if (has(tb, ta[i])) hit++;
  return hit / Math.max(ta.length, tb.length);
}
function isLive(s) { return /\b(live|concert|in concerto)\b/i.test(String(s || '')); }
function secs(c) { var d = Number(c.duration || 0); if (!d && c.durationMs) d = Number(c.durationMs) / 1000; return d > 5400 ? d / 1000 : d; }
function artistsOf(t) {
  var out = [], i, a;
  if (t.artists && t.artists.length) for (i = 0; i < t.artists.length; i++) { a = t.artists[i]; out.push(a && typeof a === 'object' ? a.name : a); }
  if (t.artist) out.push(t.artist);
  return out;
}

function pick(list, t) {
  var isrc = String(t.isrc || '').toUpperCase(), live = isLive(t.title), wt = norm(t.title);
  var wd = Number(t.durationMs || 0) / 1000, arts = artistsOf(t), tol = tolerance(), all = [], i, j;
  for (i = 0; i < list.length; i++) {
    var c = list[i];
    if (!c || c.id == null || isLive(c.title) !== live) continue;
    var hit = !!(isrc && c.isrc && String(c.isrc).toUpperCase() === isrc), cd = secs(c);
    var d = (wd && cd) ? Math.abs(wd - cd) : -1;
    if (!hit && d > tol) continue;
    var ct = norm(c.title), ca = norm(c.artist), as = 0;
    var ts = wt === ct ? 60 : Math.round(32 * overlap(wt, ct));
    for (j = 0; j < arts.length; j++) {
      var n = norm(arts[j]);
      if (!n) continue;
      var s = n === ca ? 30 : (ca && (ca.indexOf(n) >= 0 || n.indexOf(ca) >= 0)) ? 26 : Math.round(22 * overlap(n, ca));
      if (s > as) as = s;
    }
    if (!hit && (ts < 26 || as < 10)) continue;
    all.push({ id: String(c.id), sc: ts + as + (hit ? 100 : 0), hit: hit, d: d, title: c.title, artist: c.artist });
  }
  all.sort(function (x, y) { return y.sc - x.sc; });
  var out = [];
  for (j = 0; j < all.length && out.length < MAX_IDS; j++) if (all[j].sc >= MIN_SCORE) out.push(all[j]);
  return out;
}

/* ---- cache degli abbinamenti ---- */
function keyOf(t) {
  var i = String(t.isrc || '').toUpperCase();
  if (i) return 'i:' + i;
  if (t.id) return 'id:' + t.id;
  return 'x:' + norm(t.artist) + '|' + norm(t.title) + '|' + Math.round(Number(t.durationMs || 0) / 1000);
}
function readCache(k) {
  var all = myspoti.storage.get(CACHE_KEY);
  var e = all && typeof all === 'object' ? all[k] : null;
  if (!e || !e.ids || !e.ids.length) return null;
  if (e.at && now() - e.at > TTL_MATCH_MS) return null;
  if (!e.bad) e.bad = [];
  return e;
}
function writeCache(k, entry) {
  var all = myspoti.storage.get(CACHE_KEY);
  if (!all || typeof all !== 'object') all = {};
  all[k] = entry;
  var keys = [];
  for (var x in all) if (all.hasOwnProperty(x)) keys.push(x);
  if (keys.length > MAX_CACHE) {
    keys.sort(function (a, b) { return (all[a].at || 0) - (all[b].at || 0); });
    for (var i = 0; i < keys.length - MAX_CACHE; i++) delete all[keys[i]];
  }
  try { myspoti.storage.set(CACHE_KEY, all); } catch (e) { log('storage piena'); }
}

function queriesFor(t) {
  var clean = cleanTitle(t.title), out = [], seen = {}, a = trim(t.artist || (artistsOf(t)[0] || ''));
  function add(q) { q = trim(q); if (q && !seen[q]) { seen[q] = true; out.push(q); } }
  if (a) add(a + ' ' + clean);
  if (a && clean !== trim(t.title)) add(a + ' ' + t.title);
  add(clean);
  return out;
}

function findIds(t) {
  var k = keyOf(t), c = readCache(k);
  if (c) { qlog('match da cache (' + c.ids.length + ' candidati)'); return { entry: c, key: k }; }
  if (missed[k] && now() - missed[k] < MISS_MS) return null;
  var B = base(), qs = queriesFor(t), seen = {}, all = [], i, n;
  for (i = 0; i < qs.length && i < MAX_QUERIES; i++) {
    if (i > 0 && left() < 2500) break;
    var s = getJson(B + '/search?' + myspoti.query({ q: qs[i] }));
    var list = s && (s.tracks || s.results || (Array.isArray(s) ? s : null));
    if (!list || !list.length) continue;
    var got = pick(list, t);
    for (n = 0; n < got.length; n++) if (!seen[got[n].id]) { seen[got[n].id] = true; all.push(got[n]); }
    if (all.length) break;
  }
  if (!all.length) { missed[k] = now(); return null; }
  var ids = [];
  for (n = 0; n < all.length; n++) {
    ids.push({ i: all[n].id, s: all[n].sc, h: all[n].hit ? 1 : 0 });
    if (n < 3) qlog('match "' + t.title + '": candidato ' + all[n].id + ' "' + all[n].title + '" — ' + all[n].artist +
      ' | ISRC ' + (all[n].hit ? 'combacia' : 'non confrontabile/diverso') +
      ' | Δdurata ' + (all[n].d >= 0 ? (Math.round(all[n].d * 10) / 10) + ' s' : 'n/d') + ' | punteggio ' + all[n].sc);
  }
  var entry = { ids: ids, ok: null, bad: [], at: now() };
  writeCache(k, entry);
  return { entry: entry, key: k };
}

function order(entry) {
  var bad = entry.bad || [], out = [], i, one;
  if (entry.ok && !has(bad, entry.ok)) out.push(String(entry.ok));
  for (i = 0; i < entry.ids.length; i++) {
    one = String(entry.ids[i].i);
    if (!has(out, one) && !has(bad, one)) out.push(one);
  }
  for (i = 0; i < bad.length; i++) if (!has(out, bad[i])) out.push(bad[i]);
  return out;
}

/* ---- stream ---- */
function fmtQuality(kind, depth, rate) {
  return kind + ' ' + (depth ? depth + '-bit' : '?-bit') + ' / ' + (rate ? (Math.round(rate / 100) / 10) + ' kHz' : '? kHz');
}

/* Trasforma la risposta dell'addon in una risposta per Myspoti.
 * Ritorna { ans, kind, depth, rate, exp } oppure { fail } / { reject }. */
function convert(info, track, q) {
  var fmt = String(info.format || '').toLowerCase(), codec = String(info.codec || '').toLowerCase();
  var ext = ((info.url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1] || '').toLowerCase();
  var rate = Number(info.sampleRate) >= 8000 ? Number(info.sampleRate) : null;
  var depth = Number(info.bitDepth) >= 8 && Number(info.bitDepth) <= 32 ? Number(info.bitDepth) : null;
  var ea = Number(info.expiresAt) || 0;
  if (ea && ea < 1e12) ea *= 1000;

  qlog('richiesto quality=' + q + ' → ricevuto format=' + (info.format || '-') + ', codec=' + (info.codec || '-') +
    ', quality=' + (info.quality || '-') + ', estensione=' + (ext || '-') + ', ' + fmtQuality('', depth, rate).replace(/^ /, ''));

  if (fmt === 'dash' || String(info.manifest || '').toLowerCase() === 'dash' || ext === 'mpd') {
    var r;
    try { r = myspoti.http.get(info.url, { timeout: tmo() }); } catch (e) { r = null; }
    var mpd = r && r.ok ? r.body : null;
    if (!mpd || mpd.indexOf('<MPD') < 0) return { fail: 'MPD non leggibile' };
    var mc = /flac/i.test(mpd) ? 'flac' : /mp4a/i.test(mpd) ? 'aac' : null;
    if (strict(q) && mc !== 'flac') return { reject: 'dash ' + (mc || '?') };
    var a = { manifest: myspoti.util.base64Encode(mpd), mimeType: 'audio/mp4' };
    put(a, 'codec', mc); if (mc === 'flac') put(a, 'bitDepth', depth); put(a, 'sampleRate', rate);
    return { ans: a, kind: mc || '?', depth: depth, rate: rate, exp: ea };
  }

  var h = fmt || codec || ext;
  var k = /flac/.test(h) ? 'flac' : /(aac|m4a|mp4)/.test(h) ? 'aac' : /opus/.test(h) ? 'opus' : /(vorbis|ogg)/.test(h) ? 'vorbis' : 'mp3';
  if (strict(q) && k !== 'flac') return { reject: k + ' ' + (info.quality || '') };
  var M = { flac: ['audio/flac', 'flac', 'flac'], mp3: ['audio/mpeg', 'mp3', 'mp3'], aac: ['audio/mp4', 'aac', 'mp4'], opus: ['audio/ogg', 'opus', 'ogg'], vorbis: ['audio/ogg', 'vorbis', 'ogg'] }[k];
  var out = { url: info.url, mimeType: M[0], codec: M[1], container: M[2] };
  put(out, 'durationMs', track.durationMs); put(out, 'sampleRate', rate); if (k === 'flac') put(out, 'bitDepth', depth);
  if (ea && myspoti.features && myspoti.features.indexOf('audio.expires') >= 0) {
    var l = ea - now();
    if (l > MIN_LEFT_MS && l < KEEP_MS + 60000) out.expiresInMs = l - 30000;
  }
  out.source = 'Eclipse · ' + (k === 'flac' ? 'FLAC' : String(info.quality || k));
  return { ans: out, kind: k, depth: depth, rate: rate, exp: ea };
}

function resolve(track, q) {
  var B = base(), f = findIds(track);
  if (!f) return { miss: 'nessun abbinamento' };
  var ids = order(f.entry), changed = false, i, res = { miss: 'nessuno stream utilizzabile' };
  for (i = 0; i < ids.length && i < MAX_TRIES; i++) {
    if (left() < 1500 || (i > 0 && left() < 2500)) { res = { miss: 'tempo esaurito' }; break; }
    var info = getJson(B + '/stream/' + encodeURIComponent(ids[i]) + (q === 'auto' ? '' : '?quality=' + q));
    if (!info || typeof info.url !== 'string' || !/^https?:\/\//i.test(info.url)) {
      log('stream ' + ids[i] + ': nessun url (HTTP ' + lastStatus + ')');
      // un'edizione che l'addon rifiuta va in fondo alla lista (non si butta)
      if (lastStatus >= 400 && lastStatus !== 429 && lastStatus !== 408 && !has(f.entry.bad, ids[i])) {
        f.entry.bad.push(ids[i]);
        if (f.entry.bad.length > 10) f.entry.bad.shift();
        changed = true;
      }
      continue;
    }
    var c = convert(info, track, q);
    if (c.fail) { log('stream ' + ids[i] + ': ' + c.fail); continue; }
    if (c.reject) {
      log('scartato: ' + c.reject + ' (solo lossless attivo)');
      res = { miss: 'SCARTATO, non FLAC (' + c.reject + ')' };
      break; // un'altra edizione non cambia ciò che serve l'addon
    }
    if (f.entry.ok !== ids[i]) { f.entry.ok = ids[i]; changed = true; }
    res = c;
    res.id = ids[i];
    break;
  }
  if (changed) writeCache(f.key, f.entry);
  return res;
}


function audio(track, forcedQuality) {
  t0 = now(); errKind = '';
  try {
    if (!track || !track.title || !(track.artist || (track.artists && track.artists.length))) return null;
    if (!base()) return null;
    var q = (forcedQuality === 'high' || forcedQuality === 'low' || forcedQuality === 'auto') ? forcedQuality : 'auto', key = q + '|' + (strict(q) ? 's' : 'l') + '|' + keyOf(track), k = kept[key];
    if (k) {
      // stessa richiesta pochi secondi dopo = Myspoti che riprova: si ricostruisce
      if (now() - k.at < RETRY_MS) delete kept[key];
      else if (k.exp ? k.exp - now() > MIN_LEFT_MS : now() - k.at < KEEP_MS) return k.ans;
      else delete kept[key];
    }
    var c = resolve(track, q), who = '"' + track.title + '" — ' + (track.artist || artistsOf(track)[0]);
    if (c.miss) {
      qlog('RIEPILOGO ' + who + ' | richiesto ' + q + ' | esito: ' + c.miss + ' → resta Spotify | ' + (now() - t0) + ' ms');
      return null;
    }
    kept[key] = { at: now(), exp: c.exp || 0, ans: c.ans };
    var verdict = c.kind === 'flac'
      ? (q === 'lossless' ? 'FLAC LOSSLESS' : 'FLAC (oltre il richiesto)')
      : (q === 'lossless' ? 'DEGRADATO a ' + c.kind + ' (Solo lossless spento)' : 'ok ' + c.kind);
    qlog('RIEPILOGO ' + who + ' | fonte ' + c.id + ' | ' + fmtQuality(c.kind, c.depth, c.rate) + ' | richiesto ' + q +
      ' | esito: ' + verdict + (c.kind === 'flac' && !c.depth ? ' | bit/kHz non dichiarati dall\'addon' : '') + ' | ' + (now() - t0) + ' ms');
    return c.ans;
  } catch (e) { log('errore: ' + String(e).slice(0, 120)); return null; }
}

function status() {
  var B = base();
  if (!B) return false;
  for (var i = 0; i < 2; i++) {
    try {
      var r = myspoti.http.get(B + '/manifest.json', { timeout: tmo(i ? 1800 : 3000) });
      if (r && r.ok) return true;
    } catch (e) {}
    if (left() < 1500) break;
  }
  return false;
}
function clear() { kept = {}; missed = {}; myspoti.storage.remove(CACHE_KEY); }
function reset() { kept = {}; missed = {}; }
return { setSlot: function(n) { tigroDeezerSlot = n; }, configured: function () { return !!base(); }, audio: audio, status: status, clear: clear, reset: reset, key: keyOf,
  takeError: function () { var e = errKind; errKind = ''; return e; } };
})();
// Build 312 REV: Deezer first usable account stream; default auto also in legacy entry.
// A short-lived per-track candidate prevents HQ -> Whale from resolving the same
// MP3 twice. Only declared codec is trusted; audio bytes remain unverified.
var DEEZER_FIRST_AUDIO = {};
AURA_ECLIPSE_ULTRAMAX = {
 configured: function(){return [1,2,3].some(function(n){return !!String(tigroVaultSetting(n===1?'eclipseUrl':'eclipseUrl'+n)||'').trim();});},
 audio: function(track, requestedQuality, hardDeadline){
   var ecoOnly = requestedQuality === 'low';
   var allowLossy = requestedQuality === 'high' || ecoOnly;
   var key = ECL.key(track);
   var cached = DEEZER_FIRST_AUDIO[key];
   if (cached && Date.now()-cached.at > 30000) { delete DEEZER_FIRST_AUDIO[key]; cached=null; }
   if (cached && cached.result) {
     var codecCached=String(cached.result.codec||'').toLowerCase();
     if (AURA_DEV_LOGS()) AURA_DEV_WRITE('[DEEZER312] riuso primo audio account '+cached.slot+' codec='+codecCached);
     if (ecoOnly) return codecCached==='mp3' ? cached.result : null;
     return allowLossy || codecCached==='flac' ? cached.result : null;
   }
   try {
     for(var n=1;n<=3;n++){
       var slotKey=n===1?'eclipseUrl':'eclipseUrl'+n;
       if(!String(tigroVaultSetting(slotKey)||'').trim())continue;
       var remaining=hardDeadline ? hardDeadline-Date.now()-250 : 3000;
       if(remaining<900){if(AURA_DEV_LOGS())AURA_DEV_WRITE('[DEEZER312] budget esaurito');break;}
       ECL.setSlot(n); ECL.reset();
       startBudget(Math.min(3000,remaining)/1000);
       try {
         // No ?quality=... parameter: accept the account's first actual stream.
         var result=ECL.audio(track,'auto');
         if(result && /^https:\/\/[^\s]+$/i.test(String(result.url||''))){
           var codec=String(result.codec||'').toLowerCase();
           if(!/^(flac|mp3|aac|opus|vorbis)$/.test(codec))continue;
           DEEZER_FIRST_AUDIO[key]={at:Date.now(),slot:n,result:result};
           if(AURA_DEV_LOGS())AURA_DEV_WRITE('[DEEZER312] primo audio account '+n+' codec='+codec+' (byte non verificati)');
           if(ecoOnly)return codec==='mp3'?result:null;
           return allowLossy || codec==='flac'?result:null;
         }
       }catch(e){if(AURA_DEV_LOGS())AURA_DEV_WRITE('[DEEZER312] account '+n+' errore; successivo');}
     }
     return null;
   }finally{ECL.setSlot(1);ECL.reset();}
 }
};

/* Diagnostica (spenta di default): cosa passa Myspoti all'estensione. Serve a capire se
 * esiste una coda/lista dei brani successivi da usare per il precaricamento. */
var diagLast = 0, diagSeen = {};
function diagOn() {
  var v = myspoti.settings.get('diagnostics');
  return v === true || String(v) === 'true';
}
function diagKeys(o) {
  var out = [];
  try { for (var k in o) out.push(k); } catch (e) {}
  return out;
}
function diagShort(v) {
  var s;
  try {
    s = JSON.stringify(v, function (k, x) {
      if (typeof x === 'function') return '[funzione]';
      if (x && x.length > 5 && typeof x !== 'string') return '[lista di ' + x.length + ']';
      if (typeof x === 'string' && x.length > 80) return x.slice(0, 80) + '…';
      return x;
    });
  } catch (e) { s = '[non serializzabile]'; }
  return String(s).slice(0, 700);
}
function diagnose(track) {
  if (!diagOn()) return;
  try {
    var t = new Date().getTime(), gap = diagLast ? Math.round((t - diagLast) / 100) / 10 : null;
    diagLast = t;
    AURA_DEV_WRITE('[DIAG] richiesta audio' + (gap === null ? '' : ' a +' + gap + ' s dalla precedente') +
      ' | brano: ' + (track && track.title) + ' — ' + (track && (track.artist || (track.artists && track.artists[0]))));
    var tk = diagKeys(track);
    var sus = [];
    for (var i = 0; i < tk.length; i++) if (/queue|next|upcoming|playlist|album|tracks|position|index|context/i.test(tk[i])) sus.push(tk[i]);
    if (track && track.ahead !== undefined) {
      var ah = track.ahead, an = (ah && ah.length !== undefined) ? ah.length : null;
      AURA_DEV_WRITE('[DIAG] ahead: tipo ' + (ah === null ? 'null' : (ah && ah.length !== undefined ? 'lista' : typeof ah)) +
        (an !== null ? ', ' + an + ' elementi' : '') + ' | contenuto: ' +
        diagShort(an !== null && an > 0 ? [ah[0], an > 1 ? ah[1] : null] : ah));
    }
    AURA_DEV_WRITE('[DIAG] campi del brano: ' + tk.join(', '));
    AURA_DEV_WRITE('[DIAG] campi che somigliano a una coda: ' + (sus.length ? sus.join(', ') : 'nessuno'));
    if (!diagSeen.api) {
      diagSeen.api = true;
      AURA_DEV_WRITE('[DIAG] funzioni di myspoti: ' + diagKeys(myspoti).join(', '));
      AURA_DEV_WRITE('[DIAG] features: ' + diagShort(myspoti.features));
      AURA_DEV_WRITE('[DIAG] brano completo: ' + diagShort(track));
    }
  } catch (e) { AURA_DEV_WRITE('[DIAG] errore: ' + String(e).slice(0, 80)); }
}

var served = {};
var SOURCES = ['qz', 'ec', 'bc'];
var SOURCE_NAMES = { qz: 'Qobuz', ec: 'Eclipse', bc: 'BitChord' };
var health = {};
var qzSlowUntil = 0, lastFallback = { src: '', at: 0 };

// Le fonti di ripiego che il server dichiara giù (5xx) restano in pausa 60 s, quelle occupate (429) 15 s,
// due errori di rete di fila 60 s. Qobuz ha già la sua gestione dei token e non si ferma mai.
function sourcePaused(src) { var h = health[src]; return !!(h && h.until > now()); }
function noteOk(src) { if (health[src]) { health[src].fails = 0; health[src].until = 0; health[src].level = 0; } }
function noteFail(src, kind) {
  if (src === 'qz' || !kind) return;
  var h = health[src] || (health[src] = { fails: 0, until: 0, last: 0 }), t = now();
  if (kind === 'busy') {
    h.level = (h.lastBusy && t - h.lastBusy < 10 * 60 * 1000) ? Math.min((h.level || 0) + 1, 5) : 1;
    h.lastBusy = t;
    var wait = Math.min(15000 * Math.pow(2, h.level - 1), 300000);
    if (retryHint > wait) wait = retryHint;
    retryHint = 0;
    h.until = t + wait;
  }
  else if (kind === 'down') h.until = t + 60000;
  else {
    h.fails = (h.last && t - h.last < 120000) ? h.fails + 1 : 1;
    h.last = t;
    if (h.fails >= 2) h.until = t + 60000;
  }
  if (h.until > t) { h.kind = kind; AURA_DEV_WRITE(SOURCE_NAMES[src] + ': in pausa ' + Math.round((h.until - t) / 1000) + ' s (' + kind + '). Niente token o sessioni toccati.'); }
}

function answerOut(a) {
  var out = { url: a.url, mimeType: 'audio/flac', codec: 'flac' };
  if (a.bitDepth) out.bitDepth = a.bitDepth;
  if (a.sampleRate) out.sampleRate = a.sampleRate;
  qlog('audio-source consegnato a Myspoti: flac ' + qualityLabel(a.bitDepth, a.sampleRate));
  if (hasFeature('audio.expires')) {
    var exp = expiresInMs(a);
    if (exp !== undefined) out.expiresInMs = exp;
  }
  return out;
}

function sourceActive(src) {
  if (src === 'qz') return qobuzEnabled();
  if (src === 'ec') return ECL.configured();
  return backupEnabled();
}

function runSource(src, track) {
  if (src === 'ec') return ECL.audio(track);
  var a = src === 'qz' ? streamFor(track, preferHiRes()) : bitchordFor(track);
  return a ? answerOut(a) : null;
}


return {
  resolvePersonal:function(track, download){
    if (!userTokens().length) return null;
    var previous = personalOnly;
    personalOnly = true;
    try {
      startBudget(download ? 9 : 5);
      // Separate lookup cache namespace: prevent shared-pool failures from hiding personal accounts.
      var a = streamFor(track, true, !!download);
      return a && a.url ? {url:a.url,provider:'Qobuz personale',bitDepth:a.bitDepth,sampleRate:a.sampleRate,isrcMatched:!!a.isrcMatched,duration:a.durationMs||0} : null;
    } catch(e) { AURA_DEV_WRITE('Qobuz personale: resolver non disponibile'); return null; }
    finally { personalOnly = previous; }
  },
  resolve:function(track, download){try {startBudget(download ? 9 : 5); var a=streamFor(track,true,!!download); if(!a || !a.url)return null; return {url:a.url,provider:"Qobuz Eclipse",bitDepth:a.bitDepth,sampleRate:a.sampleRate,isrcMatched:!!a.isrcMatched,duration:a.durationMs||0};} catch(e){try{AURA_DEV_WRITE("Last Qobuz pool: "+e);}catch(_){} return null;}}};
})();

// Aura Bridge -- independent Myspoti adapter based on FLAC Bridge Multi, GPL-3.0-only.
// Technical references: Mornye/SpotiFLAC provider sources, Copyright 2026 zarzet,
// LGPL-3.0-only. See README.md, LICENSE and LICENSE.txt. No passwords are collected.
// v2.5.0 (modified, GPL-3.0): stricter title/artist matching, quality log toggle, match/answer cache,
// per-source time slices,
// provider pause after repeated failures, silent session recovery, optional auto-open of the
// human verification page. The human verification step itself is NOT automated.
(function () {
  'use strict';

  var GATE = 'https://api.zarz.moe/v2';
  var CALLBACK = 'spotiflac://session-grant';
  var INSTALL_KEY = 'installation_id';
  var PENDING_KEY = 'verification_pending';
  var providers = [
    { key: 'qobuz', name: 'Qobuz', app: 'qobuz-web@1.2.21', storage: 'qobuz_session' },
    { key: 'tidal', name: 'Tidal', app: 'tidal-web@1.2.5', storage: 'tidal_session' }
  ];
  var lastNotice = 0;
  var nonceCounter = 0;
  var MATCH_KEY = 'match_cache', HEALTH_KEY = 'provider_health', QUEUE_KEY = 'verification_queue';
  var MATCH_TTL = 14 * 24 * 3600 * 1000, MATCH_MAX = 500;
  var KEEP_MS = 4 * 60 * 1000, RETRY_MS = 5000;
  var GATE_PAUSE_MS = 30 * 1000;
  var SILENT_GAP = 10 * 60 * 1000, AUTO_VERIFY_GAP = 30 * 60 * 1000;
  var kept = {}, lastSilent = {}, lastAuto = 0;
  // Bounded audio response cache: prune expired entries periodically, without
  // changing the existing retry/expiry policy for any live entry.
  var audioCacheCalls = 0;
  function pruneAudioCache(at) {
    var keys = Object.keys(kept), i, entry;
    for (i = 0; i < keys.length; i++) {
      entry = kept[keys[i]];
      if (!entry || at - entry.at >= KEEP_MS) delete kept[keys[i]];
    }
    keys = Object.keys(kept);
    if (keys.length <= 300) return;
    keys.sort(function(a,b) { return kept[a].at - kept[b].at; });
    for (i = 0; i < keys.length - 300; i++) delete kept[keys[i]];
  }


  function text(v) { return v == null ? '' : String(v).trim(); }
  function log(message) { try { AURA_DEV_WRITE('[FLAC Bridge] ' + message); } catch (ignored) {} }
  function toggle(key, fallback) {
    // ZOO289: automatic sources; legacy saved OFF toggles cannot silently disable them.
    if (key === 'sourceQobuzLast' || key === 'sourceQobuzAura' ||
        key === 'sourceTidalAura' || key === 'sourceNetEase' ||
        key === 'sourceJioSaavn') return true;
    // Account-backed sources activate only with configured credentials.
    if (key === 'sourceQobuzPersonal') {
      for (var qi=1; qi<=3; qi++) {
        if (tigroVaultSetting('qobuzPersonalToken'+qi) &&
            tigroVaultSetting('qobuzPersonalAppId'+qi) &&
            tigroVaultSetting('qobuzPersonalAppSecret'+qi)) return true;
      }
      return false;
    }
    if (key === 'sourceDeezer') return !!(tigroVaultSetting('eclipseUrl') ||
      tigroVaultSetting('eclipseUrl2') || tigroVaultSetting('eclipseUrl3'));
    var v; try { v = tigroVaultSetting(key); } catch (ignored) {}
    if (v === undefined || v === null || v === '') return fallback;
    return v === true || String(v) === 'true';
  }
  function qlog(message) { AURA_DEV_WRITE('[QUALITÀ] '+message); }
  function notify(message) { try { myspoti.notify(message); } catch (ignored) {} }
  function notice(message) {
    var n = Date.now();
    if (n - lastNotice >= 60000) { lastNotice = n; notify(message); }
  }
  function provider(key) {
    for (var i = 0; i < providers.length; i++) if (providers[i].key === key) return providers[i];
    return null;
  }
  function remaining(deadline, requested) {
    var available = deadline - Date.now() - 350;
    if (available < 1000) throw new Error('TIME_BUDGET');
    return Math.max(1000, Math.min(requested, available));
  }
  function id() {
    var v = text(myspoti.storage.get(INSTALL_KEY));
    if (!/^[a-f0-9]{32}$/.test(v)) {
      // Anonymous installation identifier; not a credential.
      v = myspoti.util.sha256(String(Date.now()) + ':' + Math.random() + ':' + Math.random()).slice(0, 32);
      myspoti.storage.set(INSTALL_KEY, v);
    }
    return v;
  }
  function validSession(s) {
    return !!s && typeof s === 'object' && typeof s.id === 'string' && typeof s.secret === 'string' &&
      s.id.length > 0 && s.id.length <= 4096 && s.secret.length > 0 && s.secret.length <= 4096 &&
      s.id.indexOf('\u0000') < 0 && s.secret.indexOf('\u0000') < 0 && /^[a-f0-9]{32}$/.test(text(s.installId));
  }
  function saveSession(p, data, installId, old) {
    data = data && typeof data === 'object' ? data : {};
    var s = {
      id: text(data.session_id) || (old && old.id) || '',
      secret: text(data.session_secret) || (old && old.secret) || '',
      expiresAt: text(data.expires_at) || (old && old.expiresAt) || '',
      installId: installId
    };
    if (!validSession(s)) return false;
    myspoti.storage.set(p.storage, s);
    return true;
  }

  function pendingValid() {
    var pending = myspoti.storage.get(PENDING_KEY);
    return !!(pending && Number(pending.until) > Date.now());
  }
  // Apre la pagina di verifica del server: la persona la completa a mano.
  function openChallenge(p, result, install) {
    var challenge = text(result && result.challenge_id);
    var serverNonce = text(result && result.server_nonce) || challenge;
    if (!challenge || !serverNonce) {
      log(p.name + ': risposta di verifica non riconosciuta.');
      return false;
    }
    var state = myspoti.util.sha256(serverNonce + ':' + install + ':' + Math.random() + ':' + Date.now());
    var callback = CALLBACK + '?cb_version=v2grant&state=' + encodeURIComponent(state);
    var url = GATE + '/challenge?' + myspoti.query({ id: challenge, cb: callback });
    var authId = myspoti.auth.open({ url: url, callback: CALLBACK });
    var ttl = Number(result && result.expires_in);
    if (!isFinite(ttl) || ttl <= 0) ttl = 300;
    ttl = Math.min(300, Math.max(1, ttl));
    myspoti.storage.set(PENDING_KEY, { id: text(authId), provider: p.key, state: state, installId: install, until: Date.now() + ttl * 1000 });
    log(p.name + ': pagina di verifica aperta.');
    return true;
  }
  // Ritorna 'granted' (sessione già concessa), 'challenge' (pagina aperta) oppure 'error'.
  function holdLeft(p) {
    var h = healthMap()[p.key];
    return h && h.kind === 'busy' && Number(h.until) > Date.now() ? Number(h.until) - Date.now() : 0;
  }
  function beginVerification(p) {
    var wait = holdLeft(p);
    if (wait > 0) {
      log(p.name + ': in attesa per server occupato (429), ancora ' + Math.round(wait / 1000) + ' s.');
      notify(p.name + ': attendi ' + Math.max(1, Math.round(wait / 1000)) + ' s, il server è occupato.');
      return 'error';
    }
    try {
      var install = id();
      var r = myspoti.http.get(GATE + '/bootstrap?' + myspoti.query({ app_version: p.app, install_id: install }),
        { headers: { Accept: 'application/json' }, timeout: 6000 });
      if (r && Number(r.status) === 429) {
        lastRetry = retryAfterMs(r);
        noteOutcome(p, 'busy');
        var hold = holdLeft(p);
        log(p.name + ': il server risponde 429 alla verifica, attesa ' + Math.round(hold / 1000) + ' s.');
        notify(p.name + ': server occupato, riprova fra ' + Math.max(1, Math.round(hold / 1000)) + ' s.');
        return 'error';
      }
      if (!r || !r.ok) {
        log(p.name + ': avvio verifica non disponibile (HTTP ' + (r ? r.status : '0') + ').');
        notify('Verifica ' + p.name + ' non disponibile. Riprova più tardi.');
        return 'error';
      }
      var result = r.json();
      if (saveSession(p, result, install, null)) {
        myspoti.storage.remove(PENDING_KEY);
        log(p.name + ': sessione verificata.');
        notify(p.name + ' attivato.');
        return 'granted';
      }
      if (!openChallenge(p, result, install)) {
        notify('Verifica ' + p.name + ' non riconosciuta.');
        return 'error';
      }
      return 'challenge';
    } catch (ignored) {
      log(p.name + ': impossibile avviare la verifica.');
      notify('Impossibile aprire la verifica di ' + p.name + '. Controlla rete e Android System WebView.');
      return 'error';
    }
  }
  // Una sessione scaduta: si prova il normale avvio senza interfaccia. Se il server la concede
  // da solo, si riparte; se chiede la verifica, la pagina si apre (se attivo) e la completi tu.
  function recover(p, deadline) {
    var t = Date.now();
    if (lastSilent[p.key] && t - lastSilent[p.key] < SILENT_GAP) return false;
    lastSilent[p.key] = t;
    try {
      var install = id();
      var r = myspoti.http.get(GATE + '/bootstrap?' + myspoti.query({ app_version: p.app, install_id: install }),
        { headers: { Accept: 'application/json' }, timeout: remaining(deadline, 2500) });
      if (r && Number(r.status) === 429) { lastRetry = retryAfterMs(r); noteOutcome(p, 'busy'); return false; }
      if (!r || !r.ok) return false;
      var result = r.json();
      if (saveSession(p, result, install, null)) { log(p.name + ': sessione ripristinata senza nuova verifica.'); return true; }
      // SILENT GUARD 318: never open an auth WebView from the audio resolver.
      // A challenge is handled only by an explicit user-initiated verification.
      if (toggle('autoVerify', true)) log(p.name + ': verifica interattiva rinviata; usa Verifica ora nelle impostazioni.');
    } catch (ignored) {}
    return false;
  }
  function clearQueue() { myspoti.storage.remove(QUEUE_KEY); myspoti.storage.remove('verification_force'); }
  function nextInQueue() {
    var q = myspoti.storage.get(QUEUE_KEY), force = !!myspoti.storage.get('verification_force');
    q = Array.isArray(q) ? q.slice() : [];
    while (q.length) {
      var p = provider(q.shift());
      if (!p || (!force && validSession(myspoti.storage.get(p.storage)))) continue;
      myspoti.storage.set(QUEUE_KEY, q);
      if (beginVerification(p) === 'challenge') return; // si prosegue al ritorno dalla pagina
    }
    clearQueue();
  }
  function fmtSecs(ms) {
    var sec = Math.max(0, Math.round(ms / 1000));
    return sec >= 3600 ? Math.round(sec / 3600) + ' h' : (sec >= 120 ? Math.round(sec / 60) + ' min' : sec + ' s');
  }
  var KIND_LABEL = { busy: 'server occupato (429)', down: 'fonte non disponibile (503)', gateway: 'errori del server', timeout: 'timeout ripetuti', encrypted: 'stream cifrati' };
  // Solo lettura: nessuna richiesta al server.
  function showWaits() {
    var t = Date.now(), hm = healthMap(), short = [];
    providers.forEach(function (p) {
      var s = myspoti.storage.get(p.storage), h = hm[p.key], parts = [];
      if (!validSession(s)) parts.push('nessuna sessione');
      else {
        var e = s.expiresAt ? Date.parse(s.expiresAt) : NaN;
        parts.push('sessione ' + (isFinite(e) ? 'valida, scade fra ' + fmtSecs(e - t) : 'valida'));
      }
      if (h && Number(h.until) > t) parts.push('pausa AUTOMATICA ' + fmtSecs(h.until - t) + ' (' + (KIND_LABEL[h.kind] || 'errore') + ')');
      else parts.push('nessuna pausa');
      if (lastSilent[p.key] && t - lastSilent[p.key] < SILENT_GAP) parts.push('prossimo recupero automatico fra ' + fmtSecs(SILENT_GAP - (t - lastSilent[p.key])));
      log('[Attese] ' + p.name + ': ' + parts.join(' · '));
      short.push(p.name + ' ' + (h && Number(h.until) > t ? fmtSecs(h.until - t) : 'ok'));
    });
    var ranking = preferenceOrder(), sm = statsMap();
    log('[Classifica] ' + ranking.map(function (p, i) {
      var st = sm[p.key] || {}, pr = PRIORS[p.key];
      return (i + 1) + '. ' + p.name + ' ' + (Math.round(scoreOf(p) * 100) / 100) + (st.n
        ? ' (qualità ' + st.q + ', ' + Math.round(st.ms) + ' ms, ' + st.n + ' prove)'
        : ' (stima iniziale: qualità ' + pr.q + ', ' + pr.ms + ' ms)');
    }).join(' · '));
    if (lastAuto && t - lastAuto < AUTO_VERIFY_GAP) log('[Attese] Apertura automatica della verifica: prossima fra ' + fmtSecs(AUTO_VERIFY_GAP - (t - lastAuto)));
    var pending = myspoti.storage.get(PENDING_KEY);
    if (pending && Number(pending.until) > t) log('[Attese] Verifica MANUALE in corso (' + text(pending.provider) + '), scade fra ' + fmtSecs(pending.until - t));
    var q = myspoti.storage.get(QUEUE_KEY);
    if (Array.isArray(q) && q.length) log('[Attese] In coda per la verifica: ' + q.join(', '));
    notify(short.join(' · '));
  }
  // Prova subito la verifica per le fonti senza sessione o in scadenza, saltando le attese memorizzate.
  // Il server può rispondere ancora 429: in quel caso il Registro lo dice.
  function forceVerify() {
    var t = Date.now(), hm = healthMap(), q = [];
    providers.forEach(function (p) {
      var s = myspoti.storage.get(p.storage), e = validSession(s) && s.expiresAt ? Date.parse(s.expiresAt) : NaN;
      var needs = !validSession(s) || (isFinite(e) && e - t < 10 * 60 * 1000);
      if (!needs) return;
      if (hm[p.key] && hm[p.key].kind === 'busy') { delete hm[p.key]; }
      delete lastSilent[p.key];
      q.push(p.key);
    });
    try { myspoti.storage.set(HEALTH_KEY, hm); } catch (ignored) {}
    lastAuto = 0;
    if (!q.length) { notify('Nessuna fonte da verificare: le sessioni sono valide.'); return; }
    log('Verifica forzata per: ' + q.join(', ') + '.');
    myspoti.storage.set(QUEUE_KEY, q);
    myspoti.storage.set('verification_force', true);
    nextInQueue();
  }
  function verifyAll() {
    var q = [];
    providers.forEach(function (p) { if (toggle(p.key === 'qobuz' ? 'sourceQobuzAura' : 'sourceTidalAura', false) && !validSession(myspoti.storage.get(p.storage))) q.push(p.key); });
    if (!q.length) { notify('Tutte le fonti sono già attive.'); return; }
    myspoti.storage.set(QUEUE_KEY, q);
    nextInQueue();
  }
  function queryValues(url, depth) {
    if (depth > 2 || !url) return {};
    var raw = String(url), first = raw.indexOf('?');
    if (first < 0) first = raw.indexOf('#');
    if (first < 0) return {};
    var parts = raw.slice(first + 1).replace(/#/g, '&').split('&'), out = {};
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq < 0) continue;
      try {
        var k = decodeURIComponent(parts[i].slice(0, eq).replace(/\+/g, ' '));
        var v = decodeURIComponent(parts[i].slice(eq + 1).replace(/\+/g, ' '));
        if ((k === 'grant' || k === 'code' || k === 'state' || k === 'cb') && !out[k]) out[k] = v;
      } catch (ignored) {}
    }
    if (!out.grant && !out.code && out.cb) {
      var nested = queryValues(out.cb, depth + 1);
      if (nested.grant || nested.code) return nested;
    }
    return out;
  }
  function finishVerificationCore(event) {
    try {
      var pending = myspoti.storage.get(PENDING_KEY);
      if (!pending || text(event && event.id) !== text(pending.id)) return;
      myspoti.storage.remove(PENDING_KEY);
      var p = provider(text(pending.provider));
      if (!p) return;
      if (event.error) {
        log(p.name + ': verifica chiusa o scaduta.');
        notify('Verifica ' + p.name + ' non completata.');
        return;
      }
      var url = text(event.url);
      if (url.indexOf(CALLBACK + '?') !== 0 && url.indexOf(CALLBACK + '#') !== 0) throw new Error('INVALID_CALLBACK');
      if (Date.now() > Number(pending.until)) throw new Error('EXPIRED_CALLBACK');
      var vals = queryValues(url, 0), grant = text(vals.grant || vals.code);
      if (!grant || grant.length > 8192 || text(vals.state) !== text(pending.state)) throw new Error('INVALID_STATE');
      var body = JSON.stringify({ grant: grant, install_id: pending.installId, app_version: p.app, platform: 'extension' });
      var r = myspoti.http.post(GATE + '/session/exchange', body,
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: 6500 });
      if (!r || !r.ok || !saveSession(p, r.json(), pending.installId, null)) {
        log(p.name + ': sessione non creata (HTTP ' + (r ? r.status : '0') + ').');
        notify('Sessione ' + p.name + ' non creata. Riprova la verifica.');
        return;
      }
      log(p.name + ': sessione verificata.');
      notify(p.name + ' attivato.');
    } catch (ignored) {
      log('Verifica non completata o ritorno non valido.');
      notify('Verifica non completata. Riprova dalla pagina dell’estensione.');
    }
  }

  function hexToBase64Url(hex) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error('BAD_MAC');
    var out = '';
    for (var i = 0; i < hex.length; i += 6) {
      var a = parseInt(hex.slice(i, i + 2), 16), hasB = i + 2 < hex.length, hasC = i + 4 < hex.length;
      var b = hasB ? parseInt(hex.slice(i + 2, i + 4), 16) : 0, c = hasC ? parseInt(hex.slice(i + 4, i + 6), 16) : 0;
      out += chars.charAt(a >> 2) + chars.charAt(((a & 3) << 4) | (b >> 4));
      if (hasB) out += chars.charAt(((b & 15) << 2) | (c >> 6));
      if (hasC) out += chars.charAt(c & 63);
    }
    return out;
  }
  function signedHeaders(p, session, method, path, body) {
    var now = Date.now(), timestamp = new Date(now).toISOString();
    var nonce = myspoti.util.sha256(session.secret + ':' + now + ':' + (++nonceCounter) + ':' + Math.random()).slice(0, 24);
    var digest = myspoti.util.sha256(body);
    var windowNumber = Math.floor(now / 300000);
    var rolling = hexToBase64Url(myspoti.util.hmacSha256(session.secret, String(windowNumber) + ':' + session.id));
    // The upstream protocol signs the escaped path and an empty query line, even for GETs.
    var canonical = ['ZARZ-HMAC-V1', method, '/v2' + path, '', digest, timestamp, nonce, session.id, p.app, 'extension'].join('\n');
    return {
      'Content-Type': 'application/json', Accept: 'application/json',
      'X-Zarz-Session': session.id, 'X-Zarz-Timestamp': timestamp, 'X-Zarz-Nonce': nonce,
      'X-Zarz-Body-SHA256': digest, 'X-Zarz-Signature': hexToBase64Url(myspoti.util.hmacSha256(rolling, canonical)),
      'X-Zarz-App-Version': p.app, 'X-Zarz-Platform': 'extension'
    };
  }
  function netCall(deadline, fn) {
    try { return fn(); }
    catch (e) {
      if (text(e && e.message) === 'TIME_BUDGET' || deadline - Date.now() < 2200) throw e;
      return fn(); // una connessione che non si apre di solito riesce subito dopo
    }
  }
  function signedRequest(p, session, method, path, query, payload, extra, deadline) {
    if (!/^\/[a-z0-9/]+$/i.test(path) || (method !== 'GET' && method !== 'POST')) throw new Error('BAD_PATH');
    var body = method === 'POST' ? JSON.stringify(payload || {}) : '';
    var url = GATE + path + (query ? '?' + myspoti.query(query) : '');
    var r = netCall(deadline, function () {
      var headers = signedHeaders(p, session, method, path, body);
      if (extra) Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
      var timeout = remaining(deadline, 3000);
      return method === 'POST' ? myspoti.http.post(url, body, { headers: headers, timeout: timeout }) :
        myspoti.http.get(url, { headers: headers, timeout: timeout });
    });
    var data = {};
    try { if (r) data = r.json() || {}; } catch (ignored) {}
    if (!r || r.status !== 200) {
      var status = r ? Number(r.status) || 0 : 0, code = text(data.code).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 50);
      log(p.name + ': server HTTP ' + status + (code ? ' (' + code + ')' : '') + '.');
      if (status === 428 || code === 'VERIFY_REQUIRED' || (status === 401 && code === 'SESSION_INVALID') || (status === 403 && code === 'REQUEST_AUTH_INVALID')) {
        if (status === 401 && code === 'SESSION_INVALID') myspoti.storage.remove(p.storage);
        throw new Error('VERIFY_REQUIRED');
      }
      lastCode = code || ('HTTP' + status);
      lastRetry = retryAfterMs(r);
      throw new Error('GATEWAY_UNAVAILABLE');
    }
    return data;
  }
  function activeSession(p, deadline) {
    var s = myspoti.storage.get(p.storage);
    if (!validSession(s)) return null;
    var expires = s.expiresAt ? Date.parse(s.expiresAt) : NaN;
    if (isFinite(expires) && expires - Date.now() <= 300000) {
      try {
        var fresh = signedRequest(p, s, 'POST', '/session/refresh', null, { install_id: s.installId }, null, deadline);
        if (!saveSession(p, fresh, s.installId, s)) throw new Error('REFRESH_FAILED');
        s = myspoti.storage.get(p.storage);
      } catch (err) {
        if (text(err && err.message) === 'VERIFY_REQUIRED' || expires <= Date.now()) throw new Error('VERIFY_REQUIRED');
      }
    }
    return s;
  }
  function ticket(p, session, alias, resource, deadline) {
    var hash = myspoti.util.sha256(alias + ':track:' + text(resource).toLowerCase());
    var t = signedRequest(p, session, 'POST', '/tickets', null,
      { capability: 'download_ticket', provider: alias, resource_hash: hash }, null, deadline);
    var value = text(t && (t.ticket_id || t.ticket));
    if (!value || value.length > 4096) throw new Error('NO_TICKET');
    return value;
  }

  function isrc(v) {
    var s = text(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s.length === 12 ? s : '';
  }
  function normalize(v) {
    var s = text(v).toLowerCase();
    if (typeof s.normalize === 'function') {
      try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (ignored) {}
    }
    return s.replace(/&/g, ' and ').replace(/[^a-z0-9\u00c0-\u024f\u0370-\u04ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function durationMs(t) {
    var n = Number(t && t.durationMs);
    return isFinite(n) && n > 0 && n < 86400000 ? n : 0;
  }
  function numericId(value) {
    var s = text(value);
    return /^[0-9]{1,16}$/.test(s) && !(typeof value === 'number' && value > 9007199254740991) ? s : '';
  }
  // Confronto del titolo tollerante: ignora (feat. ...), - Remastered, Deluxe... ma non confonde
  // l'originale con live, remix, acoustic, instrumental o karaoke.
  function versionFlags(v) {
    var f = [], t = text(v).toLowerCase(), words = ['live', 'remix', 'acoustic', 'instrumental', 'karaoke', 'demo'];
    for (var i = 0; i < words.length; i++) if (new RegExp('\\b' + words[i] + '\\b').test(t)) f.push(words[i]);
    return f.join(',');
  }
  function looseTitle(v) {
    return text(v)
      .replace(/\s*[\(\[][^\)\]]*(?:feat|ft\.|featuring|with|remaster|version|edit|mono|stereo|deluxe|bonus|anniversary)[^\)\]]*[\)\]]/gi, '')
      .replace(/\s+-\s+.*(?:remaster|version|edit|mono|stereo|deluxe|bonus).*$/i, '')
      .replace(/\s+(?:feat|ft)\.?\s+.*$/i, '');
  }
  function sameTitle(a, b) {
    if (versionFlags(a) !== versionFlags(b)) return false;
    var x = normalize(looseTitle(a)), y = normalize(looseTitle(b));
    if (x && x === y) return true;
    // Beta.7: optional punctuation/featuring normalization, never fuzzy title substitution.
    // This only accepts equal normalized titles and keeps edition flags unchanged.
    function clean(v) {
      return normalize(looseTitle(v).replace(/\b(?:featuring|feat\.?|ft\.?)\b.*$/i, '')
        .replace(/\b(?:remastered|remaster)\s*(?:19|20)?\d{0,2}\b/gi, '')
        .replace(/[’‘`]/g, "'"));
    }
    var cx = clean(a), cy = clean(b);
    var accepted = !!cx && cx === cy;
    if (accepted) AURA_DEV_WRITE('MATCH: titolo normalizzato (edizione invariata)');
    return accepted;
  }
  function trackArtists(track) {
    var out = [], list = [track && track.artist];
    if (track && Array.isArray(track.artists)) list = list.concat(track.artists);
    for (var i = 0; i < list.length; i++) {
      var n = normalize(list[i] && typeof list[i] === 'object' ? list[i].name : list[i]);
      if (n && out.indexOf(n) < 0) out.push(n);
    }
    return out;
  }
  function matchTrack(track, item, kind) {
    if (!item || typeof item !== 'object' || item.streamReady === false || item.allowStreaming === false || item.streamable === false) return null;
    var number = numericId(item.id); if (!number) return null;
    var expected = durationMs(track), actual = Number(item.duration) * 1000;
    if (!isFinite(actual) || actual <= 0 || actual > 86400000) actual = 0;
    var wanted = isrc(track.isrc), found = isrc(item.isrc), matched = !!wanted && wanted === found;
    if (wanted) {
      if (!matched || (expected && actual && Math.abs(expected - actual) > 10000)) return null;
      // Anche con ISRC identico, non accettare un'edizione esplicitamente incompatibile.
      // Il titolo del catalogo puo includere la versione in un campo separato.
      var editionTitle = text(item.title) + ' ' + text(item.version || item.title_version);
      if (versionFlags(track.title) !== versionFlags(editionTitle)) return null;
    } else {
      var title = text(item.title);
      var version = text(item.version || item.title_version);
      if (version) title += ' ' + version;
      if (!sameTitle(track.title, title)) return null;
      var wantedArtists = trackArtists(track);
      var names = Array.isArray(item.artists) ? item.artists.slice() : [];
      if (item.artist) names.push(item.artist);
      if (item.performer) names.push(item.performer);
      var same = names.some(function (a) { return wantedArtists.indexOf(normalize(a && typeof a === 'object' ? a.name : a)) >= 0; });
      if (!wantedArtists.length || !same || !expected || !actual || Math.abs(expected - actual) > 6000) return null;
    }
    return { id: number, duration: actual, matched: matched, difference: expected && actual ? Math.abs(expected - actual) : 0,
      lossless: kind === 'tidal' && /LOSSLESS/i.test(text(item.audioQuality)) };
  }
  var lastMiss = '', lastCode = '', lastReason = '', lastRetry = 0;
  function retryAfterMs(r) {
    var v = Number(header(r && r.headers, 'Retry-After'));
    return isFinite(v) && v > 0 ? Math.min(v * 1000, 600000) : 0;
  }
  function nameOf(x) { return text(x && typeof x === 'object' ? x.name : x); }
  function whyRejected(track, item) {
    if (!item || typeof item !== 'object') return 'voce non valida';
    if (item.streamReady === false || item.allowStreaming === false || item.streamable === false) return 'non in streaming';
    var expected = durationMs(track), actual = Number(item.duration) * 1000;
    var wanted = isrc(track.isrc), found = isrc(item.isrc);
    if (wanted) return wanted !== found ? 'ISRC diverso' : 'durata';
    var title = text(item.title) + (text(item.version || item.title_version) ? ' ' + text(item.version || item.title_version) : '');
    if (!sameTitle(track.title, title)) return 'titolo';
    var names = Array.isArray(item.artists) ? item.artists.slice() : [];
    if (item.artist) names.push(item.artist);
    if (item.performer) names.push(item.performer);
    var wa = trackArtists(track);
    if (!names.some(function (a) { return wa.indexOf(normalize(nameOf(a))) >= 0; })) return 'artista';
    if (!expected || !actual) return 'durata mancante';
    return 'durata ' + (Math.round(Math.abs(expected - actual) / 100) / 10) + ' s';
  }
  function bestHit(track, items, kind) {
    var hits = [];
    lastMiss = '';
    (Array.isArray(items) ? items.slice(0, 25) : []).forEach(function (x) {
      var m = matchTrack(track, x, kind); if (m) hits.push(m);
    });
    hits.sort(function (a, b) { if (a.lossless !== b.lossless) return a.lossless ? -1 : 1; return a.difference - b.difference; });
    if (!hits.length) {
      var list = Array.isArray(items) ? items : [], parts = [];
      for (var n = 0; n < list.length && n < 3; n++) {
        var it = list[n] || {};
        parts.push('"' + text(it.title).slice(0, 40) + '" — ' + nameOf(it.artist || it.performer || (it.artists && it.artists[0])).slice(0, 30) + ' → ' + whyRejected(track, it));
      }
      lastMiss = 'esaminati ' + list.length + (parts.length ? ': ' + parts.join(' | ') : '');
    }
    return hits.length ? hits[0] : null;
  }
  function requestJson(url, headers, deadline, timeout) {
    var r = netCall(deadline, function () {
      return myspoti.http.get(url, { headers: headers || { Accept: 'application/json' }, timeout: remaining(deadline, timeout || 2600) });
    });
    if (!r || !r.ok) return null;
    try { return r.json(); } catch (ignored) { return null; }
  }
  function tidalHit(track, deadline) {
    var wanted = isrc(track.isrc), params, path;
    if (wanted) { path = '/tracks'; params = { isrc: wanted, countryCode: 'US', limit: 25 }; }
    else {
      if (!text(track.title) || !text(track.artist)) return null;
      path = '/search/tracks'; params = { query: (text(track.artist) + ' ' + text(track.title)).slice(0, 240), countryCode: 'US', limit: 25 };
    }
    var j = requestJson('https://tidal.com/v1' + path + '?' + myspoti.query(params),
      { Accept: 'application/json', 'x-tidal-token': '49YxDN9a2aFV6RTG' }, deadline, 2600);
    return bestHit(track, j && j.items, 'tidal');
  }
  function qobuzHit(track, p, session, deadline) {
    if (!text(track.title) || !text(track.artist)) return null;
    var params = { query: (text(track.artist) + ' ' + text(track.title)).slice(0, 240), limit: 25, offset: 0 };
    var j = null;
    try {
      j = requestJson('https://www.qobuz.com/api.json/0.2/track/search?' + myspoti.query(params),
        { Accept: 'application/json', 'X-App-Id': '735532640' }, deadline, 2400);
    } catch (ignored) {}
    var items = j && j.tracks && j.tracks.items;
    if (!Array.isArray(items)) {
      try {
        var query = { query: params.query, limit: params.limit, offset: 0, app_id: '798273057' };
        j = signedRequest(p, session, 'GET', '/qbz/track/search', query, null, null, deadline);
        items = j && j.tracks && j.tracks.items;
      } catch (ignored) { return null; }
    }
    return bestHit(track, items, 'qobuz');
  }
  function keyOf(track) {
    var i = isrc(track && track.isrc);
    if (i) return 'i:' + i;
    if (track && track.id) return 'id:' + text(track.id);
    return 'x:' + normalize(track && track.artist) + '|' + normalize(track && track.title) + '|' + Math.round(durationMs(track) / 1000);
  }
  function hitFor(p, track, finder) {
    var k = p.key + '|' + keyOf(track), all = myspoti.storage.get(MATCH_KEY);
    all = all && typeof all === 'object' ? all : {};
    var e = all[k];
    if (e && e.hit && Date.now() - Number(e.at) < MATCH_TTL) {
      qlog(p.name + ': abbinamento da cache (id ' + e.hit.id + ').');
      return e.hit;
    }
    var t = Date.now(), hit = finder(); if (Date.now() - t > 3000) AURA_DEV_WRITE('[PERF305] match lento '+p.key+' '+(Date.now()-t)+'ms');
    qlog(p.name + ': ricerca in ' + (Date.now() - t) + ' ms → ' + (hit
      ? 'id ' + hit.id + ', ISRC ' + (hit.matched ? 'combacia' : 'non confrontabile') + ', Δdurata ' + (Math.round((hit.difference || 0) / 100) / 10) + ' s'
      : 'nessun abbinamento' + (lastMiss ? ' (' + lastMiss + ')' : '')));
    if (hit) {
      all[k] = { hit: hit, at: Date.now() };
      var keys = Object.keys(all);
      if (keys.length > MATCH_MAX) {
        keys.sort(function (x, y) { return (all[x].at || 0) - (all[y].at || 0); });
        for (var n = 0; n < keys.length - MATCH_MAX; n++) delete all[keys[n]];
      }
      try { myspoti.storage.set(MATCH_KEY, all); } catch (ignored) {}
    }
    return hit;
  }

  // Pause temporanee per errori reali delle sessioni Qobuz e Tidal.
  function healthMap() { var h = myspoti.storage.get(HEALTH_KEY); return h && typeof h === 'object' ? h : {}; }
  function isPaused(p) { var h = healthMap()[p.key]; if (!h) return false; var now = Date.now(); if ((h.kind === 'timeout' || h.kind === 'gateway') && Number(h.until) > now + 30000) { h.until = now + 30000; var all = healthMap(); all[p.key] = h; try { myspoti.storage.set(HEALTH_KEY, all); } catch (_) {} } return Number(h.until) > now; }
  function noteOutcome(p, kind) {
    var all = healthMap(), h = all[p.key] || { streak: 0, until: 0 };
    if (kind === 'ok') { h.streak = 0; h.until = 0; h.busyLevel = 0; h.tfails = 0; h.fails = 0; }
    else if (kind === 'encrypted') return;
    else if (kind === 'down') h.until = Date.now() + 60 * 1000;
    else if (kind === 'busy') {
      var tb = Date.now();
      h.busyLevel = (h.busyAt && tb - h.busyAt < 10 * 60 * 1000) ? Math.min((h.busyLevel || 0) + 1, 5) : 1;
      h.busyAt = tb;
      var wait = Math.min(15000 * Math.pow(2, h.busyLevel - 1), 300000);
      if (lastRetry > wait) wait = lastRetry;
      h.until = tb + wait;
      log(p.name + ': server occupato (429), attesa ' + Math.round(wait / 1000) + ' s. Le sessioni restano.');
    }
    else if (kind === 'timeout') {
      var tn = Date.now();
      h.tfails = (h.tlast && tn - h.tlast < 5 * 60 * 1000) ? (h.tfails || 0) + 1 : 1;
      h.tlast = tn;
      if (h.tfails >= 2) { h.until = tn + 30 * 1000; h.tfails = 0; log(p.name + ': 2 timeout, pausa automatica 30 s.'); }
    }
    else if (kind === 'gateway') {
      var tnow = Date.now();
      h.fails = (h.lastFail && tnow - h.lastFail < 60000) ? (h.fails || 0) + 1 : 1;
      h.lastFail = tnow;
      if (h.fails >= 2) h.until = tnow + GATE_PAUSE_MS;
    }
    else return;
    if (h.until > Date.now()) h.kind = kind;
    all[p.key] = h;
    try { myspoti.storage.set(HEALTH_KEY, all); } catch (ignored) {}
  }

  // Source Manager v1: shared transient failure policy for every resolver.
  // A missing track is NOT a provider outage. Only network/time-budget failures
  // trigger cooldowns; successful resolutions reset the source health.
  var SOURCE_MANAGER = (function () {
    var states = {}, active = {}, dedupSkips = 0, POLICY = {
      'qobuz-last': { pauseMs: 30000, threshold: 2 },
      tidal: { pauseMs: 30000, threshold: 2 },
      netease: { pauseMs: 30000, threshold: 2 },
      qobuz: { pauseMs: 30000, threshold: 2 }
    };
    function state(key) { return states[key] || (states[key] = { failures: 0, last: 0, until: 0 }); }
    function blocked(key) { return state(key).until > Date.now(); }
    function outcome(key, kind) {
      var st = state(key), now = Date.now(), cfg = POLICY[key] || { pauseMs: 30000, threshold: 2 };
      if (kind === 'ok') { st.failures = 0; st.until = 0; return; }
      if (kind !== 'timeout' && kind !== 'gateway' && kind !== 'busy') return;
      st.failures = now - st.last < 120000 ? st.failures + 1 : 1;
      st.last = now;
      if (st.failures >= cfg.threshold) {
        st.until = now + (kind === 'busy' ? Math.max(60000, cfg.pauseMs) : cfg.pauseMs);
        log('Source Manager: ' + key + ' temporaneamente in pausa (' + Math.round((st.until-now)/1000) + ' s).');
      }
    }
    // Re-entrant request guard: a provider must not start the same resolution
    // twice while an identical operation is still executing. No URL is cached
    // here: MySpoti's rejected-URL retry policy stays untouched.
    function attempt(key, fn, fingerprint) {
      if (blocked(key)) return { skipped: true, value: null };
      var requestKey = fingerprint ? key + '|' + fingerprint : '';
      if (requestKey && active[requestKey]) {
        dedupSkips++;
        log('Source Manager: richiesta sovrapposta evitata (' + key + ').');
        return { skipped: true, duplicate: true, value: null };
      }
      if (requestKey) active[requestKey] = true;
      try {
        var value = fn();
        if (value) outcome(key, 'ok');
        return { skipped: false, value: value };
      } catch (err) {
        var code = String(err && err.message || err);
        if (/timeout|timed out|failed to connect/i.test(code)) outcome(key, 'timeout');
        else if (/GATEWAY_UNAVAILABLE|HTTP5\d\d/i.test(code)) outcome(key, 'gateway');
        throw err;
      } finally {
        if (requestKey) delete active[requestKey];
      }
    }
    function reset() { states = {}; active = {}; dedupSkips = 0; }
    return { attempt: attempt, blocked: blocked, outcome: outcome, reset: reset };
  })();

  function trustedUrl(kind, url) {
    var match = /^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::443)?(?:\/|$)/i.exec(text(url));
    if (!match) return false;
    var host = match[1].toLowerCase();
    if (kind === 'tidal') return /^(?:[a-z0-9-]+\.)*audio\.tidal\.com$/.test(host);
    if (kind === 'qobuz') return host === 'streaming-qobuz-std.akamaized.net';
    return false;
  }
  function decodedTidal(data) {
    if (!data || typeof data !== 'object' || text(data.assetPresentation).toUpperCase() === 'PREVIEW') return null;
    var quality = text(data.audioQuality).toUpperCase();
    if (quality && quality !== 'LOSSLESS' && quality !== 'HI_RES_LOSSLESS') return null;
    var encoded = text(data.manifest).replace(/\s+/g, '');
    if (!encoded || encoded.length > 1000000) return null;
    var decoded; try { decoded = myspoti.util.base64Decode(encoded); } catch (ignored) { return null; }
    if (/^\s*\{/.test(decoded)) {
      var b; try { b = JSON.parse(decoded); } catch (ignored) { return null; }
      var mime = text(b.mimeType).toLowerCase(), codec = text(b.codecs).toLowerCase(), enc = text(b.encryptionType).toUpperCase();
      if (mime !== 'audio/flac' || (codec && codec !== 'flac') || (enc && enc !== 'NONE')) return null;
      if (!Array.isArray(b.urls) || b.urls.length !== 1 || !trustedUrl('tidal', b.urls[0])) return null;
      return { url: text(b.urls[0]) };
    }
    if (!myspoti.features || myspoti.features.indexOf('audio.manifest') < 0 || decoded.indexOf('<MPD') < 0 ||
        !/codecs="flac"/i.test(decoded) || /<ContentProtection\b|<cenc:pssh\b|cenc:default_KID/i.test(decoded) ||
        !/<SegmentTimeline\b/i.test(decoded) || !/<S\b[^>]*\bd="\d+"/i.test(decoded)) return null;
    var reps = decoded.match(/<Representation\b/gi) || [], adaptations = decoded.match(/<AdaptationSet\b/gi) || [];
    if (reps.length !== 1 || adaptations.length !== 1) return null;
    var codecPattern = /\bcodecs\s*=\s*"([^"]+)"/gi, cm;
    while ((cm = codecPattern.exec(decoded))) if (text(cm[1]).toLowerCase() !== 'flac') return null;
    var init = /\binitialization="([^"]+)"/i.exec(decoded), media = /\bmedia="([^"]+)"/i.exec(decoded);
    if (!init || !media || !trustedUrl('tidal', init[1].replace(/&amp;/g, '&')) ||
        !trustedUrl('tidal', media[1].replace(/&amp;/g, '&')) || media[1].indexOf('$Number$') < 0) return null;
    return { manifest: encoded };
  }
  function header(headers, name) {
    var lower = name.toLowerCase(), keys = Object.keys(headers || {});
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === lower) return text(headers[keys[i]]);
    return '';
  }
  // Verify that a direct response is a real plain FLAC. Never download the full file
  // inside the script: Myspoti's network surface is limited to text and 5 MB.
  function plainFlacUrl(kind, url, deadline) {
    url = text(url);
    for (var n = 0; n < 3; n++) {
      if (!trustedUrl(kind, url)) return '';
      var r = myspoti.http.get(url, { headers: { Range: 'bytes=0-3', Accept: 'audio/flac,*/*' }, timeout: remaining(deadline, 2200) });
      if (!r) return '';
      if (r.status >= 300 && r.status < 400) {
        var location = header(r.headers, 'location');
        if (/^\//.test(location) && !/^\/\//.test(location)) {
          var base = /^(https:\/\/[^/]+)/i.exec(url);
          location = base ? base[1] + location : '';
        }
        url = location;
        continue;
      }
      if (r.status !== 206 || String(r.body || '').slice(0, 4) !== 'fLaC') {
        AURA_DEV_WRITE('FLAC: firma fLaC non verificata, status=' + r.status);
        return '';
      }
      var contentRange = header(r.headers, 'content-range');
      if (contentRange && !/^bytes\s+0-\d+\/(?:\d+|\*)/i.test(contentRange)) {
        AURA_DEV_WRITE('FLAC: Content-Range incoerente; candidato rifiutato');
        return '';
      }
      AURA_DEV_WRITE('FLAC: firma fLaC verificata con Range 0-3');
      return url;
    }
    return '';
  }
  function positiveInt(value, min, max) {
    var n = Number(value); return isFinite(n) && Math.floor(n) === n && n >= min && n <= max ? n : 0;
  }
  function metadata(result, p, hit, bits, rate) {
    if (!result) return null;
    result.provider = p.name;
    result.duration = hit.duration;
    result.isrcMatched = hit.matched === true;
    var bd = positiveInt(bits, 8, 32), sr = Number(rate);
    if (isFinite(sr) && sr > 0 && sr < 1000) sr = Math.round(sr * 1000);
    sr = positiveInt(sr, 8000, 768000);
    if (bd) result.bitDepth = bd;
    if (sr) result.sampleRate = sr;
    return result;
  }
  function resolveTidal(track, p, session, deadline) {
    var hit = hitFor(p, track, function () { return tidalHit(track, deadline); }); if (!hit) { log('[WHALE268] Tidal Aura: nessun match ammesso; nessuna richiesta stream HQ/lossy eseguita.'); return null; }
    var t = ticket(p, session, 'tid', hit.id, deadline);
    var response = signedRequest(p, session, 'POST', '/dl/tid', null,
      { id: hit.id, quality: 'LOSSLESS' }, { 'X-Zarz-Ticket': t }, deadline);
    var data = response && response.data, result = decodedTidal(data);
    return metadata(result, p, hit, data && data.bitDepth, data && data.sampleRate);
  }
  function looksPreview(data, hit) {
    if (!data || typeof data !== 'object') return false;
    if (booleanValue(data.sample) === true || booleanValue(data.preview) === true || booleanValue(data.is_preview) === true ||
        text(data.assetPresentation).toUpperCase() === 'PREVIEW') return true;
    var seconds = Number(data.duration), expected = Number(hit && hit.duration);
    return isFinite(seconds) && seconds > 0 && seconds < 86400 && expected > 0 && seconds * 1000 + 5000 < expected;
  }
  function resolveQobuz(track, p, session, deadline) {
    var hit = hitFor(p, track, function () { return qobuzHit(track, p, session, deadline); }); if (!hit) { log('[WHALE268] Qobuz Aura: nessun match ammesso; nessuna richiesta stream HQ/lossy eseguita.'); return null; }
    var trackUrl = 'https://open.qobuz.com/track/' + hit.id;
    var t = ticket(p, session, 'qbz', trackUrl, deadline);
    var response = signedRequest(p, session, 'POST', '/dl/qbz', null,
      { quality: 'cd', upload_to_r2: false, id: hit.id, type: 'track', url: trackUrl }, { 'X-Zarz-Ticket': t }, deadline);
    if (!response || response.success === false || response.error || response.detail) { log('[WHALE268] Qobuz Aura: risposta stream HQ non utilizzabile (nessun URL accettato).'); return null; }
    var nested = response.data && typeof response.data === 'object' ? response.data : {};
    if (looksPreview(response, hit) || looksPreview(nested, hit)) return null;
    var url = text(response.download_url || response.url || response.link || nested.download_url || nested.url || nested.link);
    url = plainFlacUrl('qobuz', url, deadline);
    if (!url) { log('[WHALE268] Qobuz Aura: URL FLAC diretto non verificabile o anteprima esclusa.'); return null; }
    return metadata({ url: url }, p, hit, response.bit_depth || nested.bit_depth, response.sampling_rate || nested.sampling_rate);
  }
  function booleanValue(v) {
    if (v === true || v === false) return v;
    if (text(v).toLowerCase() === 'true') return true;
    if (text(v).toLowerCase() === 'false') return false;
    return null;
  }
  var STATS_KEY = 'provider_stats';
  // Stime iniziali finché non ci sono misure reali sul tuo telefono (q = fattore qualità, ms = tempo tipico).
  var PRIORS = { qobuz: { q: 1.8, ms: 1500 }, tidal: { q: 1.4, ms: 1800 } };
  function statsMap() { var m = myspoti.storage.get(STATS_KEY); return m && typeof m === 'object' ? m : {}; }
  // CD = 1, 24-bit = 1,5, oltre 48 kHz +0,5, oltre 96 kHz +0,25.
  function qualityFactor(depth, rate) {
    var q = 1;
    if (depth > 16) q += 0.5;
    if (rate > 48000) q += 0.5;
    if (rate > 96000) q += 0.25;
    return q;
  }
  function recordStat(p, ok, ms, depth, rate) {
    var all = statsMap(), st = all[p.key] || { n: 0, f: 0 };
    st.f = Math.round(((st.f || 0) * 0.8 + (ok ? 0 : 0.2)) * 1000) / 1000; // tasso di insuccessi recente
    if (ok) {
      var q = qualityFactor(Number(depth) || 0, Number(rate) || 0);
      if (!st.n) { st.ms = ms; st.q = q; }
      else { st.ms = Math.round(st.ms * 0.7 + ms * 0.3); st.q = Math.round((st.q * 0.7 + q * 0.3) * 100) / 100; }
      st.n = (st.n || 0) + 1;
    }
    all[p.key] = st;
    try { myspoti.storage.set(STATS_KEY, all); } catch (ignored) {}
  }
  function scoreOf(p) {
    var st = statsMap()[p.key] || {}, pr = PRIORS[p.key] || { q: 1, ms: 3000 };
    var q = st.n ? st.q : pr.q, ms = st.n ? st.ms : pr.ms, f = st.f || 0;
    return q / (1 + ms / 4000) * (1 - 0.7 * f);
  }
  // «Automatica»: prima la fonte con il punteggio migliore (qualità alta, veloce, affidabile).
  // «X prima»: X in testa, le altre a cascata sempre in ordine di punteggio.
  function preferenceOrder() { return providers.filter(function(p) { return toggle(p.key === 'qobuz' ? 'sourceQobuzAura' : 'sourceTidalAura', false); }); }
  function laterSession(order, from) {
    for (var j = from + 1; j < order.length; j++) {
      if (validSession(myspoti.storage.get(order[j].storage)) && !isPaused(order[j])) return true;
    }
    return false;
  }
  // WHALE131: optional Qobuz MP3 (format_id=5), using the existing authorized pool.
  // Called only after HQ is exhausted; never alters the FLAC resolver or token pool.
  function qobuzWhaleMp3(track, deadline) {
    if (deadline - Date.now() < 2200) { AURA_DEV_WRITE('[WHALE131] Qobuz: budget insufficiente'); return null; }
    try {
      var hit = qobuzHit(track, {key:'qobuz',name:'Qobuz Aura'}, null, deadline);
      if (!hit || !hit.id) { AURA_DEV_WRITE('[WHALE131] Qobuz: nessun match verificato'); return null; }
      var ts = Math.floor(Date.now()/1000), fmt = 5;
      var res = qobuzCall('track/getFileUrl', {
        request_ts:ts, track_id:hit.id, format_id:fmt, intent:'stream'
      }, {sign:function(entry){return qobuzSign(ts,hit.id,fmt,entry.appSecret);}});
      var b = res && res.body;
      // EAGLE275: structured, redacted diagnosis; never log signed URLs, tokens or secrets.
      if (!res) {
        AURA_DEV_WRITE('[EAGLE275] MP3: nessuna risposta API (timeout, pool o budget)');
        return null;
      }
      AURA_DEV_WRITE('[EAGLE275] MP3: HTTP=' + String(res.status) +
        ' body=' + (b ? 'JSON' : 'assente/non-JSON') +
        ' url=' + (b && b.url ? 'presente' : 'assente') +
        ' sample=' + (b && b.sample === true ? 'si' : 'no') +
        ' format=' + (b && b.format_id != null ? String(b.format_id).slice(0,8) : '?'));
      if (res.status !== 200 || !b || !b.url || b.sample === true || b.preview === true) {
        var errCode = b && (b.code || b.error_code || (b.error && b.error.code));
        if (errCode != null) AURA_DEV_WRITE('[EAGLE275] MP3: codice errore API=' + String(errCode).slice(0,32));
        AURA_DEV_WRITE('[WHALE131] Qobuz: MP3 non disponibile o accesso non autorizzato'); return null;
      }
      var url = String(b.url), mime = String(b.mime_type||'').toLowerCase();
      var id = Number(b.format_id || 0), fmtUrl = /[?&]fmt=(\d+)/.exec(url);
      if (!/^https:\/\/[^\s]+$/i.test(url) || /[?&]range=/i.test(url) ||
          (id && id !== 5) || (fmtUrl && fmtUrl[1] !== '5') ||
          (mime && !/mpeg|mp3/.test(mime))) {
        AURA_DEV_WRITE('[EAGLE275] MP3: validazione rifiutata (format=' + (id || '?') + ', mime=' + (mime ? mime.slice(0,48) : 'assente') + ', preview=' + (/[?&]range=/i.test(url) ? 'si' : 'no') + ')'); AURA_DEV_WRITE('[WHALE131] Qobuz: URL/codec/anteprima non ammessi'); return null;
      }
      AURA_DEV_WRITE('[WHALE131] Qobuz MP3: URL HTTPS e formato 5 accettati; bitrate non verificato');
      return {url:url, provider:'Qobuz Whale', format:'mp3', kbps:0};
    } catch(e) {
      // EAGLE276: identify the undefined symbol without logging credentials or URLs.
      var en = e && e.name ? String(e.name).slice(0,32) : 'sconosciuta';
      var em = e && e.message ? String(e.message) : '';
      var undefinedSymbol = /(?:^|\s)([A-Za-z_$][\w$]*) is not defined/.exec(em);
      AURA_DEV_WRITE('[EAGLE276] MP3: eccezione=' + en +
        (en === 'ReferenceError' && undefinedSymbol ? ' simbolo=' + undefinedSymbol[1].slice(0,48) : ''));
      AURA_DEV_WRITE('[WHALE131] Qobuz: richiesta non riuscita'); return null;
    }
  }
  function resolve(track, budget, collectAll) {
    if (!track || typeof track !== 'object') return [];
    var deadline = Date.now() + budget, order = preferenceOrder(), any = false, needsVerification = false, results = [], recovered = {}, deferredNeteaseMp3 = null;
    // ZOO289: experimental Eagle MP3 override disabled; normal HQ/Whale chain retained.


    var whaleDeezer = null, whaleJio = null; // candidati locali, isolati per richiesta
    var live = 0, withSession = 0;
    for (var z = 0; z < order.length; z++) {
      if (!validSession(myspoti.storage.get(order[z].storage))) continue;
      withSession++;
      if (!isPaused(order[z])) live++;
    }
    var probeKey = '';
    if (withSession > 0 && live === 0) { // meglio riprovare una fonte che non suonare nulla
      var earliest = Infinity, hm = healthMap();
      for (var y = 0; y < order.length; y++) {
        if (!validSession(myspoti.storage.get(order[y].storage))) continue;
        var u = (hm[order[y].key] && hm[order[y].key].until) || 0;
        if (u < earliest) { earliest = u; probeKey = order[y].key; }
      }
    }
    // ZOO283: Qobuz personale FIRST, before shared Qobuz and Aura providers.
    // Qobuz personale: usa il resolver Last Eclipse già presente, limitato ai tre account locali.
    if (!results.length && toggle('sourceQobuzPersonal', false) && deadline - Date.now() > 2100) {
      try {
        var personalCandidate = LAST_QOBUZ_POOL.resolvePersonal(track, collectAll);
        if (personalCandidate && personalCandidate.url) {
          results.push(personalCandidate);
          if (!collectAll) return results;
        }
      } catch (ignoredPersonal) { log('Qobuz personale: resolver non disponibile.'); }
    }
    // Shared Qobuz follows personal Qobuz; Aura providers as fallback.
    // No extra matching or settings changes to the Aura engine.
    if (toggle('sourceQobuzLast', true) && deadline - Date.now() > 1700) {
      var lastStart = Date.now();

      try {
        var lastAttempt = SOURCE_MANAGER.attempt('qobuz-last', function () { return LAST_QOBUZ_POOL.resolve(track, collectAll); }, keyOf(track) + '|' + (collectAll ? 'download' : 'stream'));
        var lastCandidate = lastAttempt.value;
        if (lastCandidate && lastCandidate.url) {
          results.push(lastCandidate);

          if (!collectAll) return results;
        }
      } catch (lastError) {
        // The Aura Qobuz resolver is the next fallback.
      } finally {
        AURA_DEV_WRITE('[TWC304] Qobuz Eclipse tempo_ms=' + (Date.now() - lastStart));
      }
    }
    // ZOO282: all enabled HQ providers precede NetEase and compressed fallbacks.
    // `providers` order is Qobuz Aura -> Tidal Aura. Never promote NetEase
    // inside the Aura provider loop; that previously bypassed Qobuz Aura.
    qlog('brano: ISRC ' + (isrc(track.isrc) ? 'sì' : 'no') + ', durata ' + (Math.round(durationMs(track) / 100) / 10) + ' s');
    for (var i = 0; i < order.length; i++) {
      var p = order[i], stored = myspoti.storage.get(p.storage);
      if (!validSession(stored)) continue;
      any = true;
      if (p.key !== probeKey && (isPaused(p) || SOURCE_MANAGER.blocked(p.key))) { qlog(p.name + ': in pausa, saltata.'); continue; }
      if (deadline - Date.now() < 1400) break;
      // Ogni fonte ha una sua fetta di tempo, così una fonte lenta non consuma tutto il budget.
      var slice = laterSession(order, i) ? Math.min(deadline, Date.now() + (collectAll ? 12000 : 6500)) : deadline;
      var started = Date.now();
      lastReason = ''; lastCode = '';
      try {
        var session = activeSession(p, slice); if (!session) continue;
        var managed = SOURCE_MANAGER.attempt(p.key, function () {
          return p.key === 'tidal' ? resolveTidal(track, p, session, slice) : resolveQobuz(track, p, session, slice);
        }, keyOf(track) + '|' + (collectAll ? 'download' : 'stream'));
        var result = managed.value;
        if (result) {
          results.push(result);
          recordStat(p, true, Date.now() - started, result.bitDepth, result.sampleRate);
          qlog(p.name + ': FLAC in ' + (Date.now() - started) + ' ms.');
          noteOutcome(p, 'ok');
          // Myspoti can try multiple download candidates after a transfer fails,
          // but its player accepts just one stream at a time.
          if (!collectAll) return results;
        } else {
          log('[WHALE268] ' + p.name + ': nessun FLAC utilizzabile; controllare i messaggi match/stream precedenti.');
          qlog(p.name + ': nessun FLAC compatibile (' + (Date.now() - started) + ' ms).');
          if (lastReason === 'encrypted') recordStat(p, false);
          noteOutcome(p, lastReason === 'encrypted' ? 'encrypted' : 'unusable');
        }
      } catch (err) {
        var code = text(err && err.message);
        if (code === 'VERIFY_REQUIRED') {
          log(p.name + ': serve una nuova verifica.');
          needsVerification = true;
        } else if (code === 'TIME_BUDGET') {
          qlog(p.name + ': tempo della fonte esaurito (' + (Date.now() - started) + ' ms).');
          recordStat(p, false);
          if (deadline - Date.now() < 1400) break;
        } else {
          var detail = code.slice(0, 120);
          log(p.name + ': fonte non disponibile (' + detail + ').');
          qlog(p.name + ': errore "' + detail + '" dopo ' + (Date.now() - started) + ' ms.');
          recordStat(p, false);
          // si mette in pausa solo per errori veri del server, non per un'esitazione della rete
          if (code === 'GATEWAY_UNAVAILABLE') {
            if (lastCode === 'PROVIDER_UNAVAILABLE') noteOutcome(p, 'down');
            else if (lastCode === 'V2_BUSY' || lastCode === 'HTTP429') noteOutcome(p, 'busy');
            else noteOutcome(p, 'gateway');
          } else if (/timeout|timed out|failed to connect/i.test(code)) noteOutcome(p, 'timeout');
        }
      }
    }
    // UltraMAX manifest via original Last Eclipse resolver. No personal URL in code or logs.
    if (!results.length && toggle('sourceDeezer', false) && deadline-Date.now()>2000) {
      if (!AURA_ECLIPSE_ULTRAMAX || !AURA_ECLIPSE_ULTRAMAX.configured()) {
        log('Deezer Eclipse: manifest mancante; fonte saltata.');
      } else {
        try {
          var ec=AURA_ECLIPSE_ULTRAMAX.audio(track, undefined, deadline);
          if(ec&&ec.url){
            var typ=String(ec.mimeType||'').toLowerCase();
            var lossless=typ.indexOf('flac')>=0||String(ec.codec||'').toLowerCase()==='flac';
            // Non accettare come HQ uno stream Deezer che non dichiara FLAC.
            // Senza manifest personale configurato la fonte e' gia' saltata sopra.
            if (!lossless) {
              log('Deezer Eclipse: audio non FLAC dichiarato; passo a JioSaavn.');
            } else {
            var ecOut={url:ec.url,provider:'Deezer Eclipse',format:'flac'};
            if(ec.bitDepth)ecOut.bitDepth=ec.bitDepth;
            if(ec.sampleRate)ecOut.sampleRate=ec.sampleRate;
            if(ec.expiresInMs)ecOut.expiresInMs=ec.expiresInMs;
            log('Deezer Eclipse: FLAC dichiarato ricevuto (non verificato nei byte).');
            results.push(ecOut);if(!collectAll)return results;
            }
          }else log('Deezer Eclipse: nessuno stream; provo il fallback successivo.');
        }catch(e){log('Deezer Eclipse: errore resolver '+String(e).slice(0,90));}
      }
    }
    // ZOO282: NetEase is a *fallback* in HQ mode, after every configured HQ
    // source (personal Qobuz, Qobuz Eclipse, Qobuz Aura, Tidal Aura, Deezer).
    // Keep MP3 deferred for Whale; do not let it preempt FLAC sources.
    if (!results.length && toggle('sourceNetEase', true) && deadline - Date.now() > 2900) {
      try {
        var neteaseAttempt = SOURCE_MANAGER.attempt('netease', function () {
          return NETEASE_FAST.resolve(track, collectAll);
        }, keyOf(track) + '|' + (collectAll ? 'download' : 'stream'));
        var netease = neteaseAttempt.value;
        if (netease && netease.url) {
          if (netease.format === 'mp3' && !collectAll) {
            deferredNeteaseMp3 = netease;
            log('[WHALE268] NetEase: MP3 conservato per seconda passata; codec=mp3 kbps=' + (netease.kbps || 'ND'));
          } else {
            results.push(netease);
            if (!collectAll) return results;
          }
        } else log('[ZOO283] NetEase HQ fallback: nessun URL utilizzabile');
      } catch (neteaseError) {
        log('[ZOO283] NetEase HQ fallback: errore resolver ' + String(neteaseError).slice(0,90));
      }
    }
    // Lossless providers exhausted. Try JioSaavn AAC as final external fallback.
    if (!results.length && toggle('sourceJioSaavn', false) && deadline-Date.now()>2000) {
      try {
        var jio=AURA_JIOSAAVN.resolve(track,deadline);
        if(jio&&jio.url){
          log('JioSaavn: AAC/M4A variante richiesta '+(jio.kbps||'ND')+' kbps (bitrate effettivo non verificato) / fallback finale.');
          if (toggle('splashWhale', false) && !collectAll) whaleJio = jio;
          else { results.push(jio); if(!collectAll)return results; }
        }else log('[WHALE268] JioSaavn: nessun URL audio verificabile; catalogo/URL/timeout da distinguere nel resolver.');
      }catch(e){log('JioSaavn: errore resolver '+String(e).slice(0,80));}
    }
    // SPLASH WHALE BETA: one resolver, no repeated global search.
    // Existing HQ resolver and matching stay untouched; only an optional Deezer High
    // stream request is added when HQ sources were exhausted. Other adapters must
    // explicitly support lossy before being included; never guess API parameters.
    if (!results.length && !collectAll && toggle('splashWhale', false)) {
      AURA_DEV_WRITE('[WHALE268] HQ esaurito: Whale valuta MP3 NetEase, AAC JioSaavn e Deezer high. Qobuz MP3: prova autorizzata format 5; Tidal lossy ancora non abilitato.');
      AURA_DEV_WRITE('[WHALE268] candidati riusati: NetEase='+(deferredNeteaseMp3?'si':'no')+' JioSaavn='+(whaleJio?'si':'no')+' Deezer_attivo='+(toggle('sourceDeezer',false)?'si':'no')+' budget_ms='+Math.max(0,deadline-Date.now()));
      // WHALE270: prefer the already-resolved NetEase MP3; do not call Deezer High
      // when that candidate is usable. No additional NetEase search or bitrate request.
      var whaleNeteaseReady = deferredNeteaseMp3 &&
        /^https:\/\/[^\s]+$/i.test(String(deferredNeteaseMp3.url || '')) &&
        String(deferredNeteaseMp3.format || '').toLowerCase() === 'mp3';
      // Only request Qobuz MP3 if no already-recovered NetEase MP3 is ready.
      var whaleQobuz = null;
      if (!whaleNeteaseReady && toggle('sourceQobuzLast', true)) {
        whaleQobuz = qobuzWhaleMp3(track, deadline);
      }
      if (whaleNeteaseReady) AURA_DEV_WRITE('[WHALE270] NetEase MP3 riusato; nessuna nuova ricerca/bitrate, Deezer High saltato.');
      if (!whaleNeteaseReady && !whaleQobuz && toggle('sourceDeezer', false) && AURA_ECLIPSE_ULTRAMAX &&
          AURA_ECLIPSE_ULTRAMAX.configured() && deadline - Date.now() > 1200) {
        try {
          var low = AURA_ECLIPSE_ULTRAMAX.audio(track, 'high', deadline);
          if (low && /^https:\/\/[^\s]+$/i.test(String(low.url || ''))) {
            var mime = String(low.mimeType || '').toLowerCase();
            var codec = String(low.codec || '').toLowerCase();
            var source = String(low.source || '').toLowerCase();
            var path = String(low.url).split(/[?#]/)[0].toLowerCase();
            var kind = mime.indexOf('mpeg') >= 0 || codec === 'mp3' || /\.mp3$/.test(path) || /\bmp3\b/.test(source) ? 'mp3' :
              mime.indexOf('aac') >= 0 || mime.indexOf('mp4') >= 0 || codec === 'aac' || /\.(aac|m4a)$/.test(path) ? 'm4a' : '';
            if (kind) whaleDeezer = {url: low.url, provider: 'Deezer Eclipse', format: kind,
              kbps: Number(low.kbps) > 0 ? Number(low.kbps) : (/320/.test(source) ? 320 : (/256/.test(source) ? 256 : 0))};
          }
        } catch (ignoredWhale) { AURA_DEV_WRITE('[WHALE268] Deezer high: nessun stream utilizzabile: ' + String(ignoredWhale).slice(0,80)); }
      }
      var whaleCandidates = (whaleNeteaseReady ? [deferredNeteaseMp3] : [whaleQobuz, whaleDeezer, deferredNeteaseMp3, whaleJio]).filter(function(c) {
        return c && /^https:\/\/[^\s]+$/i.test(String(c.url || '')) &&
          /^(mp3|aac|m4a)$/i.test(String(c.format || ''));
      });
      if (whaleQobuz) whaleCandidates = [whaleQobuz];
      whaleCandidates.sort(function(a,b) { return Number(b.kbps || 0) - Number(a.kbps || 0); });
      if (whaleCandidates.length) {
        results.push(whaleCandidates[0]);
        AURA_DEV_WRITE('[WHALE268] fallback=' + whaleCandidates[0].provider +
          ' codec=' + whaleCandidates[0].format + ' kbps_variante=' + (whaleCandidates[0].kbps || 'ND') + ' (bitrate effettivo non verificato nei byte)');
      } else AURA_DEV_WRITE('[WHALE268] nessun URL lossy HTTPS con codec MP3/AAC riconosciuto; il brano può esistere nel catalogo.');
    }
    if (!results.length && deferredNeteaseMp3 && (!toggle('splashWhale', false) || collectAll)) {
      results.push(deferredNeteaseMp3);
      log('TEST NetEase: MP3 utilizzato dopo tentativi lossless.');
    }
    if (!any && !results.length && !toggle('sourceQobuzLast',true) && !toggle('sourceNetEase',true) && !toggle('sourceQobuzPersonal',false) && !toggle('sourceDeezer',false) && !toggle('sourceJioSaavn',false)) notice('Apri Aura Eclipse e attiva almeno una sorgente.');
    else if (needsVerification && !results.length) notice('Una sorgente richiede una nuova verifica nelle impostazioni di Aura Eclipse.');
    return results;
  }

  myspoti.on('setting', function (event) {
    if (!event || event.pressed !== true) return;
    var key = text(event.key);
    if (key === 'verify') key = 'verify_tidal'; // Supports an event queued by version 1.
    if (key === 'zooSourceStatus') {
      var names=['Qobuz Eclipse','Qobuz Aura','Tidal Aura','NetEase','JioSaavn'];
      var q=0,d=0;
      for(var zi=1;zi<=3;zi++){
        if(String(tigroVaultSetting('qobuzPersonalToken'+zi)||'').trim() && String(tigroVaultSetting('qobuzPersonalAppId'+zi)||'').trim() && String(tigroVaultSetting('qobuzPersonalAppSecret'+zi)||'').trim())q++;
        if(String(tigroVaultSetting(zi===1?'eclipseUrl':'eclipseUrl'+zi)||'').trim())d++;
      }
      myspoti.log('[ZOO290] Fonti automatiche abilitate per configurazione: '+names.join(', '));
      myspoti.log('[ZOO290] Account configurati: Qobuz personale='+q+'/3; Deezer manifest='+d+'/3. Sessioni e streaming non verificati.');
      notice('Zoo 290: stato fonti scritto nel Registro (senza credenziali).');
      return;
    }
    if (key === 'verify_all') { verifyAll(); return; }
    if (key === 'forceVerify') { forceVerify(); return; }
    // Manutenzione diagnostica: lettura/azzeramento/verifica dello stesso storage
    // consultato da tokenPool(). Non modifica tokenPool(), markTokenDead() o resolver.
    function resetQobuzDeadVerified(origin) {
      var keyDead = 'qobuz_dead';
      function countDead() {
        var state = myspoti.storage.get(keyDead);
        if (!state || typeof state !== 'object' || Array.isArray(state)) return 0;
        return Object.keys(state).length;
      }
      var before = -1, after = -1, method = 'remove', success = false;
      try {
        before = countDead();
        myspoti.storage.remove(keyDead);
        after = countDead();
        if (after !== 0) {
          method = 'set_empty';
          myspoti.storage.set(keyDead, {});
          after = countDead();
        }
        success = after === 0;
      } catch (err) {
        // Non inserire eccezioni dello storage nei log: potrebbero contenere dati sensibili.
        try { after = countDead(); } catch (ignored) {}
      }
      AURA_DEV_WRITE('[RESET260] origine=' + origin + ' prima=' + before +
        ' dopo=' + after + ' metodo=' + method + ' esito=' +
        (success ? 'VERIFICATO' : 'NON_VERIFICATO'));
      return success;
    }
    if (key === 'resetQobuzCooldown') {
      var ok = resetQobuzDeadVerified('PULSANTE');
      notify(ok ? 'Cooldown Qobuz azzerati e verificati. Puoi riprovare.' :
        'Reset cooldown Qobuz non verificato: controlla il Registro.');
      return;
    }
    if (key === 'clearCache') {
      NETEASE_FAST.clearCache(); AURA_JIOSAAVN.reset(); SOURCE_MANAGER.reset();
      kept = {}; lastSilent = {};
      resetQobuzDeadVerified('SVUOTA_CACHE');
      myspoti.storage.remove(MATCH_KEY); myspoti.storage.remove(HEALTH_KEY); myspoti.storage.remove(STATS_KEY);
      log('Cache svuotata.'); notify('Cache degli abbinamenti svuotata.');
      return;
    }
    if (key === 'forget') {
      providers.forEach(function (p) { myspoti.storage.remove(p.storage); });
      myspoti.storage.remove(INSTALL_KEY); myspoti.storage.remove(PENDING_KEY); clearQueue();
      myspoti.storage.remove(MATCH_KEY); myspoti.storage.remove(HEALTH_KEY); NETEASE_FAST.clearCache(); AURA_JIOSAAVN.reset(); SOURCE_MANAGER.reset(); kept = {}; lastNotice = 0;
      log('Sessioni locali cancellate.'); notify('Sessioni locali cancellate.');
    }
  });
  function finishVerification(event) {
    var pending = myspoti.storage.get(PENDING_KEY);
    var mine = !!pending && text(event && event.id) === text(pending.id);
    finishVerificationCore(event);
    if (!mine) return;
    try {
      if (event && event.error) clearQueue();
      else nextInQueue();
    } catch (ignored) {}
  }
  // Startup verification: reuse Aura's existing serial verification queue.
  // Do not invalidate valid sessions or interrupt an ongoing authentication.
  function verifyOnStartup() {
    try {
      if (pendingValid()) { log('Avvio: verifica già in corso, nessuna nuova apertura.'); return; }
      var missing = [];
      providers.forEach(function (p) {
        if ((p.key === 'qobuz' || p.key === 'tidal') && !validSession(myspoti.storage.get(p.storage))) missing.push(p.key);
      });
      if (!missing.length) { log('Avvio: tutte le sessioni Aura già valide.'); return; }
      log('Avvio: verifica automatica delle sessioni mancanti: ' + missing.join(', ') + '.');
      // SILENT GUARD 318: startup must not open auth windows during playback.
      // Do not start the interactive queue until the user presses Verifica ora.
      myspoti.storage.set(QUEUE_KEY, missing);
      log('Avvio: verifica interattiva rinviata alle impostazioni.');
    } catch (e) { log('Avvio: verifica automatica non disponibile: ' + String(e)); }
  }
  myspoti.on('auth', finishVerification);
  // COLIBRI277: independent compressed-audio streaming mode; HQ resolver untouched.
  function colibriResolve(track) {
    var deadline = Date.now() + 10500;
    AURA_DEV_WRITE('[ZOO283] Colibri: NetEase -> JioSaavn, sorgenti Eco automatiche; fallback MySpoti');
    if (deadline-Date.now()>2200) {
      try {
        var n=NETEASE_FAST.resolve(track,false,true);
        if (n && n.url && n.format==='mp3' && /^https:\/\/[^\s]+$/i.test(n.url)) {
          AURA_DEV_WRITE('[COLIBRI277] NetEase: MP3 trovato');return n;
        }
        AURA_DEV_WRITE('[COLIBRI277] NetEase: nessun MP3 ammesso');
      } catch (e) { AURA_DEV_WRITE('[COLIBRI277] NetEase: errore '+String(e&&e.name||'sconosciuto')); }
    }
    if (deadline-Date.now()>2000) {
      try {
        var j=AURA_JIOSAAVN.resolve(track,deadline);
        if(j && j.url && /^(mp3|m4a|aac)$/i.test(String(j.format||'')) && /^https:\/\/[^\s]+$/i.test(j.url)) {
          AURA_DEV_WRITE('[COLIBRI278] JioSaavn: '+j.format+' disponibile (bitrate effettivo non verificato)');return j;
        }
      } catch(e) { AURA_DEV_WRITE('[COLIBRI277] JioSaavn: errore '+String(e&&e.name||'sconosciuto')); }
    }
    AURA_DEV_WRITE('[COLIBRI277] Nessun audio compresso: controllo restituito a MySpoti');
    return null;
  }
  myspoti.provide('audio-source', function (track) {
    var t0 = Date.now(), key = track && typeof track === 'object' ? keyOf(track) : '';
    key += '|whale:' + (toggle('splashWhale',false)?'1':'0');
    key += '|colibri:' + (toggle('colibriEco',false)?'1':'0');
    key += '|tigro:' + (toggle('tigroHQ',true)?'1':'0');
    key += '|sources:' + ['sourceNetEase','sourceQobuzLast','sourceQobuzAura','sourceTidalAura','sourceQobuzPersonal','sourceDeezer','sourceJioSaavn'].map(function(x){return toggle(x,true)?'1':'0';}).join('');
    if ((++audioCacheCalls % 32) === 0 || Object.keys(kept).length > 300) pruneAudioCache(t0);
    var k = key ? kept[key] : null;
    if (k) {
      // La stessa richiesta pochi secondi dopo è Myspoti che riprova: si ricostruisce.
      if (t0 - k.at < RETRY_MS) {
        // No diagnostic logging on retry.
        delete kept[key];
      } else if (t0 - k.at < KEEP_MS) {
        // Native app cache may already have served the result.
        return k.out;
      } else delete kept[key];
    }
    var zooMode = toggle('colibriEco',false) ? 'COLIBRI' : (toggle('splashWhale',false) ? 'WHALE' : 'TIGRO');
    AURA_DEV_WRITE('[ZOO283] modalita='+zooMode+'; toggleTigro='+toggle('tigroHQ',true)+'; priorita Colibri > Whale > Tigro');
    AURA_DEV_WRITE('[ZOO283] '+zooMode+' priorita HQ: Qobuz personale > Qobuz Eclipse > Qobuz Aura > Tidal Aura > Deezer FLAC > NetEase FLAC > fallback');
    var found = zooMode === 'COLIBRI' ? colibriResolve(track) : resolve(track, 13200, false)[0];
    AURA_DEV_WRITE('[TWC304] ricerca motore=' + zooMode + ' tempo_ms=' + (Date.now() - t0) + ' esito=' + (found ? 'found' : 'not-found'));
    // Resolver matching and source selection are unchanged. No redundant
    // quality-report assembly on the hot audio path.
    if (found) {
      log('Audio: ' + String(found.provider || 'fonte') +
        ' / ' + (found.format === 'mp3' ? 'MP3' : found.format === 'm4a' ? 'AAC dichiarato' : 'FLAC dichiarato') +
        ' / ' + (Date.now() - t0) + ' ms');
    }
    if (!found) {
      AURA_DEV_WRITE('FALLBACK: nessuna fonte utilizzabile, tempo totale=' + (Date.now() - t0) + 'ms');
      log('Audio: nessuna fonte / ' + (Date.now() - t0) + ' ms'); return null;
    }
    // Myspoti displays `source` only if structured quality is absent. Include the
    // provider and only real reported quality here, so users can see which one played.
    var label = found.provider + (found.format === 'mp3' ? ' · MP3' : found.format === 'm4a' ? ' · AAC' : ' · FLAC');
    if (found.bitDepth) label += ' · ' + found.bitDepth + '-bit';
    if (found.sampleRate) label += ' · ' + (found.sampleRate / 1000) + ' kHz';
    var out = { source: label, expiresInMs: KEEP_MS };
    if (found.url) { out.url = found.url; out.mimeType = found.format === 'mp3' ? 'audio/mpeg' : found.format === 'm4a' ? 'audio/mp4' : 'audio/flac'; } else out.manifest = found.manifest;
    if (found.duration) out.durationMs = found.duration;
    if (key) kept[key] = { at: Date.now(), out: out };
    return out;
  });
  myspoti.provide('download-source', function (track) {
    var all = resolve(track, 27000, true); if (!all.length) return null;
    return all.map(function (found) {
      var out = { format: found.format || (found.url ? 'flac' : 'dash-flac'), provider: found.provider, isrcMatched: found.isrcMatched };
      if (found.url) out.url = found.url; else out.manifest = found.manifest;
      if (found.bitDepth) out.bitDepth = found.bitDepth;
      if (found.sampleRate) out.sampleRate = found.sampleRate;
      return out;
    });
  });
  verifyOnStartup();
})();




var VAULT_HTML="<!doctype html><html lang=\"it\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>body{font:15px system-ui;background:#111116;color:#eee;margin:0;padding:18px}h1{color:#ffb34f;font-size:26px;margin:8px 0 12px}h2{font-size:19px;margin:22px 0 6px;color:#ffcb84}p{line-height:1.55;color:#c5c1c9}section{border:1px solid #45414a;border-radius:14px;padding:14px;margin:12px 0}label{display:block;font-weight:600;margin-bottom:9px}input{box-sizing:border-box;width:100%;padding:12px;background:#22212a;color:white;border:1px solid #555;border-radius:9px;font:inherit}button{padding:10px;margin:8px 4px 0 0;background:#49331c;color:#ffce8b;border:1px solid #b47b32;border-radius:8px;font:inherit}small,.status{color:#bcb8c4}.status{margin-top:9px;min-height:18px;font-size:13px}a{color:#ffcb84}</style></head><body><h1>🔐 Vault · Account Manager</h1><p>Qui puoi <b>visualizzare e copiare</b> le credenziali già salvate. Per modificarle usa i campi nativi nelle impostazioni dell’estensione: MySpoti salva automaticamente le modifiche. Il Vault non cambia le credenziali.</p><h2>Qobuz · 3 account</h2><section><label for=\"v0\">Qobuz 1 · Token</label><input id=\"v0\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s0\">Mostra</button><button id=\"c0\">Copia</button></div><div id=\"st0\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v1\">Qobuz 1 · App ID</label><input id=\"v1\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s1\">Mostra</button><button id=\"c1\">Copia</button></div><div id=\"st1\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v2\">Qobuz 1 · App Secret</label><input id=\"v2\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s2\">Mostra</button><button id=\"c2\">Copia</button></div><div id=\"st2\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v3\">Qobuz 2 · Token</label><input id=\"v3\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s3\">Mostra</button><button id=\"c3\">Copia</button></div><div id=\"st3\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v4\">Qobuz 2 · App ID</label><input id=\"v4\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s4\">Mostra</button><button id=\"c4\">Copia</button></div><div id=\"st4\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v5\">Qobuz 2 · App Secret</label><input id=\"v5\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s5\">Mostra</button><button id=\"c5\">Copia</button></div><div id=\"st5\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v6\">Qobuz 3 · Token</label><input id=\"v6\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s6\">Mostra</button><button id=\"c6\">Copia</button></div><div id=\"st6\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v7\">Qobuz 3 · App ID</label><input id=\"v7\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s7\">Mostra</button><button id=\"c7\">Copia</button></div><div id=\"st7\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v8\">Qobuz 3 · App Secret</label><input id=\"v8\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s8\">Mostra</button><button id=\"c8\">Copia</button></div><div id=\"st8\" class=\"status\" aria-live=\"polite\"></div></section><h2>Deezer · 3 manifest</h2><p>In ogni campo Deezer inserisci l’<b>indirizzo HTTPS completo del manifest</b> della tua estensione Deezer, non l’URL di un brano o dell’account. Per ottenerlo apri <b>https://ultramax.vip/eclipse.html</b>, accedi a deezer.com e recupera il cookie <b>arl</b> dagli strumenti sviluppatore (F12 → Application/Storage → Cookies → deezer.com). Incolla l’ARL nella pagina <b>Eclipse Music · Deezer Addon</b>, premi <b>Generate Install Link</b> e copia nei campi nativi Deezer il <b>link HTTPS personale generato</b>, non il cookie ARL. Non condividere credenziali o link privati. I link nella pagina Vault non aprono siti esterni.</p><section><label for=\"v9\">Deezer 1 · Manifest URL</label><input id=\"v9\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s9\">Mostra</button><button id=\"c9\">Copia</button></div><div id=\"st9\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v10\">Deezer 2 · Manifest URL</label><input id=\"v10\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s10\">Mostra</button><button id=\"c10\">Copia</button></div><div id=\"st10\" class=\"status\" aria-live=\"polite\"></div></section><section><label for=\"v11\">Deezer 3 · Manifest URL</label><input id=\"v11\" type=\"password\" readonly placeholder=\"Premi Mostra\" autocomplete=\"off\"><div><button id=\"s11\">Mostra</button><button id=\"c11\">Copia</button></div><div id=\"st11\" class=\"status\" aria-live=\"polite\"></div></section><small>Consiglio: nascondi nuovamente i valori dopo averli consultati. La copia utilizza gli appunti Android; evita di condividere token e URL privati.</small><script>(function(){var keys=[\"qobuzPersonalToken1\", \"qobuzPersonalAppId1\", \"qobuzPersonalAppSecret1\", \"qobuzPersonalToken2\", \"qobuzPersonalAppId2\", \"qobuzPersonalAppSecret2\", \"qobuzPersonalToken3\", \"qobuzPersonalAppId3\", \"qobuzPersonalAppSecret3\", \"eclipseUrl\", \"eclipseUrl2\", \"eclipseUrl3\"],seq=0,pending={};function el(id){return document.getElementById(id)}function ask(n){var id=++seq;pending[id]=n;el(\"st\"+n).textContent=\"Lettura del campo nativo...\";try{MyspotiPage.postMessage(JSON.stringify({kind:\"tigro_vault_read\",key:keys[n],id:id}))}catch(e){el(\"st\"+n).textContent=\"Bridge non disponibile\"}}function copy(n){var i=el(\"v\"+n),s=el(\"st\"+n);if(!i.value){s.textContent=\"Premi prima Mostra\";return}i.type=\"text\";i.focus();i.select();var ok=false;try{ok=document.execCommand(\"copy\")}catch(e){}i.setSelectionRange(0,0);i.blur();s.textContent=ok?\"Copiato negli appunti\":\"Seleziona e copia dalla tastiera\"}keys.forEach(function(k,n){el(\"s\"+n).onclick=function(){var i=el(\"v\"+n);if(i.type===\"text\"){i.type=\"password\";el(\"s\"+n).textContent=\"Mostra\";el(\"st\"+n).textContent=\"Nascosto\"}else if(i.value){i.type=\"text\";el(\"s\"+n).textContent=\"Nascondi\";el(\"st\"+n).textContent=\"Valore visibile\"}else ask(n)};el(\"c\"+n).onclick=function(){copy(n)}});window.addEventListener(\"message\",function(e){var r=e.data;if(typeof r===\"string\"){try{r=JSON.parse(r)}catch(_){return}}if(!r||r.kind!==\"tigro_vault_value\"||!Object.prototype.hasOwnProperty.call(pending,r.id))return;var n=pending[r.id];delete pending[r.id];if(r.key!==keys[n])return;var i=el(\"v\"+n);i.value=r.value||\"\";i.type=\"text\";el(\"s\"+n).textContent=\"Nascondi\";el(\"st\"+n).textContent=i.value?\"Valore letto dalle impostazioni native\":\"Campo non configurato\"})})();</script></body></html>";

// Vault bridge: allowlisted keys only, no secrets in logs.
(function(){
var keys=TIGRO_VAULT_KEYS.slice();
myspoti.provide("page",function(){return {title:"Vault · Account Manager",html:VAULT_HTML};});
myspoti.provide("message",function(msg){
 if(!msg||keys.indexOf(msg.key)<0)return {kind:'tigro_vault_result',ok:false,error:'Campo non valido',id:msg&&msg.id};
 var k='tigro_vault_account_v1_'+msg.key;
 try{
  if(msg.kind==='tigro_vault_read'){
   var v=myspoti.settings.get(msg.key)||'',source='native';
   return {kind:'tigro_vault_value',key:msg.key,value:String(v),source:source,id:msg.id};
  }
  if(msg.kind==='tigro_vault_probe'){return {kind:'tigro_vault_result',key:msg.key,ok:true,action:'probe',id:msg.id};}
  if(msg.kind==='tigro_vault_verify'){var chk=myspoti.storage.get(k);return {kind:'tigro_vault_result',key:msg.key,ok:true,action:'verify',verified:typeof chk==='string'&&chk.length>0,id:msg.id};}
  if(msg.kind==='tigro_vault_save'){
   var v=String(msg.value||'');if(!v||v.length>4096)return {kind:'tigro_vault_result',key:msg.key,ok:false,error:'Lunghezza non valida',id:msg.id};
   myspoti.storage.set(k,v);
   if(myspoti.storage.get(k)!==v)return {kind:'tigro_vault_result',key:msg.key,ok:false,error:'Verifica salvataggio fallita',id:msg.id};
   return {kind:'tigro_vault_result',key:msg.key,ok:true,action:'save',id:msg.id};
  }
  if(msg.kind==='tigro_vault_reset'){
   myspoti.storage.set(k,'');return {kind:'tigro_vault_result',key:msg.key,ok:true,action:'reset',id:msg.id};
  }
 }catch(e){return {kind:'tigro_vault_result',key:msg.key,ok:false,error:'Storage non disponibile',id:msg.id};}
 return {kind:'tigro_vault_result',key:msg.key,ok:false,error:'Azione non supportata',id:msg.id};
});})();
