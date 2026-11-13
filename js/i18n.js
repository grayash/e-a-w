/* 언어팩: 한국어 문장을 키로, 언어별 사전(lang/*.js)에서 번역을 찾는다.
   언어는 주소의 ?lang= → 저장된 선택 → 기기 언어 순으로 정하고, 바꾸면 페이지를 다시 읽는다. */
(function () {
  "use strict";
  var LANGS = [
    { id: "ko", name: "한국어" },
    { id: "en", name: "English" },
    { id: "ja", name: "日本語" },
    { id: "zh-Hans", name: "简体中文" },
    { id: "zh-Hant", name: "繁體中文" },
  ];
  var ids = LANGS.map(function (l) { return l.id; });
  function fromNav() {
    var list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "ko"]);
    for (var i = 0; i < list.length; i++) {
      var t = String(list[i]).toLowerCase();
      if (t.indexOf("ko") === 0) return "ko";
      if (t.indexOf("ja") === 0) return "ja";
      if (t.indexOf("zh") === 0) return /hant|tw|hk|mo/.test(t) ? "zh-Hant" : "zh-Hans";
      if (t.indexOf("en") === 0) return "en";
    }
    return "en";
  }
  var q = null;
  try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  var saved = null;
  try { saved = localStorage.getItem("eaw-lang"); } catch (e) {}
  // 언어별 페이지(/en/ 등)는 그 언어로 고정, 첫 페이지는 저장된 선택·기기 언어를 따른다
  var page = document.documentElement.getAttribute("data-page-lang");
  var lang = ids.indexOf(q) >= 0 ? q : ids.indexOf(page) >= 0 ? page : ids.indexOf(saved) >= 0 ? saved : fromNav();
  if (ids.indexOf(q) >= 0) { try { localStorage.setItem("eaw-lang", q); } catch (e) {} }
  window.LANG = lang;
  window.LANGS = LANGS;
  document.documentElement.lang = lang;
  window.I18N_DICT = null;

  window.L = function (k) {
    var d = window.I18N_DICT, t = d && d[k] != null ? d[k] : k;
    if (arguments.length > 1) {
      var a = arguments;
      t = t.replace(/\{(\d+)\}/g, function (m, i) { var v = a[+i + 1]; return v == null ? "" : v; });
    }
    return t;
  };
  window.setLang = function (l) {
    try { localStorage.setItem("eaw-lang", l); } catch (e) {}
    // 언어별 페이지로 이동 (한국어는 첫 페이지)
    var u = new URL(l === "ko" ? "./" : l.toLowerCase() + "/", document.baseURI);
    location.assign(u.toString());
  };

  if (lang !== "ko") {
    var me = document.currentScript && document.currentScript.src;
    var v = me && /[?&]v=([^&]+)/.exec(me);
    document.write('<script src="lang/' + lang + '.js' + (v ? "?v=" + v[1] : "") + '"><\/script>');
  }

  // 정적 화면 글자 번역
  function translateDom(root) {
    var d = window.I18N_DICT; if (!d) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (node) {
      var p = node.parentNode && node.parentNode.nodeName;
      if (p === "SCRIPT" || p === "STYLE") return;
      var raw = node.nodeValue, key = raw.replace(/\s+/g, " ").trim();
      if (!key || d[key] == null) return;
      var lead = /^\s*/.exec(raw)[0], tail = /\s*$/.exec(raw)[0];
      node.nodeValue = lead + d[key] + tail;
    });
    root.querySelectorAll("[aria-label],[placeholder],[title]").forEach(function (el) {
      ["aria-label", "placeholder", "title"].forEach(function (a) {
        var v = el.getAttribute(a); if (v && d[v.trim()] != null) el.setAttribute(a, d[v.trim()]);
      });
    });
    if (d[document.title] != null) document.title = d[document.title];
  }
  document.addEventListener("DOMContentLoaded", function () { translateDom(document.body); });
})();
