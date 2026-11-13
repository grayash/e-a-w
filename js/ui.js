/* 화면 흐름과 입력. 규칙 계산은 engine.js, 그리기는 map.js / epilogue.js 가 맡는다. */
(function () {
  "use strict";
  const C = window.COUNTRIES, R = window.RULES, CFG = window.CONFIG, Eng = window.Engine;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const score = (cid) => Math.round(C.CN.gfp / C[cid].gfp * 100);
  const M = Eng.regionMap();

  const ui = { player: null, stance: null, enemy: null, cond: {}, s: null, speed: 2, paused: false, hourInTurn: 0, gameMin: 0, skipping: false, card: null, target: null };

  /* ---------- 공통 ---------- */
  function go(id) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.toggle("on", el.id === id));
    window.scrollTo(0, 0);
    ui.screen = id;
    if (id === "s-map") requestAnimationFrame(() => { mapView.resize(); });
    if (id === "s-start") requestAnimationFrame(drawHero);
  }
  function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove("on"), 2200); }
  function sheet(html) { $("sheet").innerHTML = html + L('<button class="btn ghost" data-act="close">닫기</button>'); $("sheet").classList.add("on"); $("sheetBg").classList.add("on"); }
  function closeSheet() { $("sheet").classList.remove("on"); $("sheetBg").classList.remove("on"); }
  function swatch(cid) { return `<span class="swatch" style="background:${C[cid].color};border:1px solid ${C[cid].dark}"></span>`; }
  function clockText(min) {
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = Math.floor(min % 60);
    return `D+${d} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // 글자 크기 (이 기기에만 저장)
  const FS = ["", "fs-l", "fs-xl"];
  let fsIdx = 0;
  try { fsIdx = Math.max(0, FS.indexOf(localStorage.getItem("eaw-fs") || "")); } catch (e) {}
  function applyFs() { FS.forEach((c) => c && document.documentElement.classList.remove(c)); if (FS[fsIdx]) document.documentElement.classList.add(FS[fsIdx]); }
  applyFs();

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go],[data-act],[data-zoom],[data-lang]");
    if (!t) return;
    if (t.dataset.go) { if (t.dataset.go === "s-start") stopLoop(); go(t.dataset.go); }
    const a = t.dataset.act;
    if (a === "font") { fsIdx = (fsIdx + 1) % FS.length; applyFs(); try { localStorage.setItem("eaw-fs", FS[fsIdx]); } catch (er) {} toast([L("기본 글자"), L("큰 글자"), L("아주 큰 글자")][fsIdx]); setTimeout(() => { mapView.resize(); if (miniView) miniView.resize(); }, 50); }
    if (a === "lang") sheet("<h3>Language · 언어</h3><div class=\"lang-list\">" + window.LANGS.map((l) => `<button class="choice ${l.id === window.LANG ? "sel" : ""}" data-lang="${l.id}"><div class="t">${l.name}</div></button>`).join("") + "</div>");
    if (t.dataset.lang) { if (window.track) window.track("lang_change", { lang: t.dataset.lang }); window.setLang(t.dataset.lang); }
    if (a === "close") closeSheet();
    if (a === "help") showHelp();
    if (a === "stats") sheet(`<div class="explain" style="padding:0;background:none">${statExplainHtml()}</div>`);
    if (a === "sources") showSources();
    if (a === "feedback") showFeedback();
    if (t.dataset.zoom) {
      const z = t.dataset.zoom;
      if (z === "in") mapView.zoom(1.4); if (z === "out") mapView.zoom(1 / 1.4);
      if (z === "front") fitFront(mapView); if (z === "all") mapView.showAll();
    }
  });
  $("sheetBg").addEventListener("click", closeSheet);

  function showHelp() {
    sheet(L("<h3>게임 방법</h3>\n      <p>1. 나라를 고르고 <b>공격</b> 또는 <b>방어</b> 입장을 정합니다. 방어를 고르면 상대가 먼저 공격해 옵니다.</p>\n      <p>2. 개전 조건 4개를 정합니다. 각 조건은 당장의 이득과 나중의 대가가 함께 있습니다.</p>\n      <p>3. 게임 속 12시간마다 전략 카드 1장과 공격 목표를 고릅니다. 고르면 시간이 자동으로 흐르고, 전황 보고가 실시간으로 올라옵니다. 배율은 1·2·4·6배(기본 2배 = 현실 2분에 12시간)입니다.</p>\n      <p>4. 상대도 카드를 고릅니다. 상성(정면 돌파 &lt; 방어 태세 &lt; 우회 기습 &lt; 공중 우세)에 따라 결과가 달라지고, 결과마다 이유가 한 줄로 나옵니다.</p>\n      <p>5. 끝나는 조건은 <b>완전 점령</b>, <b>핵심 거점 점령</b>(수도와 ★·■ 표시 구역), <b>방어 성공</b>(상대의 병력·보급·사기 중 둘이 한계 아래), 정전입니다. 시간 제한은 없습니다.</p>\n      <p>6. 바다를 건너는 공격은 제해권에 따라 공격력이 달라집니다. 상대가 쥔 바다를 건너면 공격력이 절반이 됩니다. <b>보급선 차단</b>·<b>사이버 공격</b>으로 해군력을 흔들거나 <b>공중 우세</b>·<b>드론</b>으로 타격하세요.</p>\n      <p>7. 견제 카드: <b>사이버 공격</b>은 상대 보급·해군력을 깎고, <b>간첩·모략</b>은 성공하면 사기와 국경 수비를 흔들지만 실패하면 여론을 잃습니다.</p>\n      <p class=\"small\">미국·러시아·NATO는 지도에 없고, 내 선택(선제공격, 민간 피해, 해상 봉쇄, 핵 위협 등)에 따라 단계적으로 개입합니다. 직접 파병은 없습니다.</p>"));
  }
  function showSources() {
    sheet(L("<h3>출처와 기준</h3><p class=\"small\">기준 시점: {0}. 점수 = 최강국 PwrIndx ÷ 각국 PwrIndx × 100. 핵전력은 지수에 포함되지 않아 별도 규칙으로 다룹니다. 그 밖의 능력치는 게임용 보정값(초안)입니다.</p>\n      <ul class=\"src\">{1}</ul>\n      <p class=\"small\">지도는 실제 경계를 단순화한 게임용 근사치입니다.</p>", CFG.asOf, CFG.sources.map((x) => `<li><a href="${x.url}" target="_blank" rel="noopener">${esc(x.label)}</a></li>`).join("")));
  }
  // 의견 보내기: 별도 화면 (「먼저 온 답장」과 같은 방식으로 저장)
  function showFeedback() {
    closeSheet();
    ui.fbReturn = ui.screen && ui.screen !== "s-feedback" ? ui.screen : "s-start";
    if (ui.screen === "s-map") ui.paused = true;
    $("fbMsg").textContent = ""; $("fbMsg").className = "fb-msg";
    go("s-feedback");
  }
  $("fbText").addEventListener("input", () => { $("fbCount").textContent = `${$("fbText").value.length} / 1000`; });
  $("fbBack").addEventListener("click", () => { go(ui.fbReturn || "s-start"); if (ui.fbReturn === "s-map") { ui.paused = false; renderSpeed(); startLoop(); } });
  $("fbSend").addEventListener("click", async () => {
    const msg = $("fbMsg"), text = $("fbText").value.trim();
    if (text.length < 2) { msg.textContent = L("내용을 적어 주세요."); msg.className = "fb-msg bad"; return; }
    if (!window.sendFeedback) { msg.textContent = L("연결을 준비하고 있어요. 잠시 뒤 다시 눌러 주세요."); msg.className = "fb-msg bad"; return; }
    $("fbSend").disabled = true;
    const r = await window.sendFeedback(text, { ver: CFG.version });
    $("fbSend").disabled = false;
    if (r.ok) { $("fbText").value = ""; $("fbCount").textContent = "0 / 1000"; msg.textContent = L("잘 받았어요. 고맙습니다."); msg.className = "fb-msg ok"; if (window.track) window.track("feedback_sent"); }
    else { msg.textContent = r.error || L("보내지 못했어요."); msg.className = "fb-msg bad"; }
  });

  /* ---------- 시작 화면 ---------- */
  $("langName").textContent = (window.LANGS.find((l) => l.id === window.LANG) || {}).name || "";
  $("ver").textContent = L("{0} · 버전 {1} · 기준 {2}", CFG.title, CFG.version, CFG.asOf);
  $("disc").textContent = CFG.disclaimer;
  $("priv").textContent = CFG.privacy;
  const heroView = new MapView($("hero"), { interactive: false, aspect: 0.62, static: true });
  function drawHero() {
    heroView.resize(); heroView.state = null; heroView.redrawBase();
    heroView.fitRegions(Object.keys(M).filter((id) => M[id].type === "land"), 4);
    heroView.draw(0);
  }

  /* ---------- 국가 선택 ---------- */
  function renderCountries() {
    $("countryList").innerHTML = window.COUNTRY_ORDER.map((cid) => {
      const c = C[cid];
      return L("<button class=\"choice country {0}\" data-cid=\"{1}\">\n        <div class=\"t\">{2}{3}<span class=\"tag\">{4}점 · 세계 {5}위</span>{6}</div>\n        <div class=\"bar\"><i style=\"width:{7}%\"></i></div>\n        <div class=\"d\"><span class=\"gain\">강점</span> {8}<br><span class=\"cost\">약점</span> {9}</div>\n      </button>", ui.player === cid ? "sel" : "", cid, swatch(cid), c.name, score(cid), c.rank, c.nuclear ? L('<span class="tag warn">핵 보유</span>') : "", score(cid), esc(c.strengths), esc(c.weakness));
    }).join("");
  }
  $("countryList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cid]"); if (!b) return;
    ui.player = b.dataset.cid; if (ui.enemy === ui.player) ui.enemy = null;
    renderCountries(); $("countryNext").disabled = false;
  });
  $("countryNext").addEventListener("click", () => { renderStance(); go("s-stance"); });

  /* ---------- 입장·상대 ---------- */
  function renderStance() {
    const opts = [
      { id: "attack", t: L("공격"), d: L("내가 개전한다. 개전 방식을 고른다.") },
      { id: "defense", t: L("방어"), d: L("상대가 먼저 공격해 온다. 대응 방식을 고른다.") },
    ];
    $("stanceList").innerHTML = opts.map((o) => `<button class="choice ${ui.stance === o.id ? "sel" : ""}" data-st="${o.id}"><div class="t">${o.t}</div><div class="d">${o.d}</div></button>`).join("");
    $("enemyTitle").textContent = ui.stance === "defense" ? L("어느 나라가 공격해 올까요?") : L("어느 나라를 공격할까요?");
    const list = window.COUNTRY_ORDER.filter((c) => c !== ui.player);
    let html = list.map((cid) => {
      const c = C[cid], diff = score(cid) - score(ui.player);
      const word = diff > 15 ? L("나보다 강함") : diff < -15 ? L("나보다 약함") : L("비슷함");
      return L("<button class=\"choice {0}\" data-en=\"{1}\"><div class=\"t\">{2}{3}<span class=\"tag\">{4}점 · {5}</span></div></button>", ui.enemy === cid ? "sel" : "", cid, swatch(cid), c.name, score(cid), word);
    }).join("");
    if (ui.stance === "defense") html += L("<button class=\"choice {0}\" data-en=\"random\"><div class=\"t\">무작위</div><div class=\"d\">누가 공격해 올지 시작할 때 정해진다.</div></button>", ui.enemy === "random" ? "sel" : "");
    $("enemyList").innerHTML = html;
    $("stanceNext").disabled = !(ui.stance && ui.enemy);
  }
  $("stanceList").addEventListener("click", (e) => { const b = e.target.closest("[data-st]"); if (!b) return; ui.stance = b.dataset.st; if (ui.stance === "attack" && ui.enemy === "random") ui.enemy = null; renderStance(); });
  $("enemyList").addEventListener("click", (e) => { const b = e.target.closest("[data-en]"); if (!b) return; ui.enemy = b.dataset.en; renderStance(); });
  $("stanceNext").addEventListener("click", () => {
    if (ui.enemy === "random") { const l = window.COUNTRY_ORDER.filter((c) => c !== ui.player); ui.enemyActual = l[Math.floor(Math.random() * l.length)]; }
    else ui.enemyActual = ui.enemy;
    ui.cond = { method: ui.stance === "attack" ? "preempt" : "counter", civil: "limited", sea: "none", sanction: "none" };
    renderCond(); go("s-cond");
  });

  /* ---------- 개전 조건 ---------- */
  function condGroups() {
    const g = R.attackConditions.slice();
    if (ui.stance === "defense") g[0] = R.defenseResponse;
    return g;
  }
  function renderCond() {
    $("statExplain").innerHTML = statExplainHtml();
    const en = C[ui.enemyActual];
    $("condTitle").textContent = ui.stance === "attack" ? L("{0}의 개전 조건", josa(en.name, "과")) : L("{0} 먼저 공격해 왔습니다", josa(en.name, "이"));
    $("condLead").textContent = ui.stance === "attack" ? L("각 조건은 당장의 이득과 나중의 대가가 함께 있습니다.") : L("대응 방식과 전쟁 수행 조건을 정하세요. 상대는 선제공격으로 시작합니다.");
    $("condGroups").innerHTML = condGroups().map((grp) => `<div class="group"><h3>${grp.title}</h3><div class="seg">${grp.options.map((o) => {
      const dis = grp.key === "sanction" && o.id === "impose" && ui.player === "KP";
      return `<button class="choice ${ui.cond[grp.key] === o.id ? "sel" : ""}" data-k="${grp.key}" data-v="${o.id}" ${dis ? "disabled" : ""}>
        <div class="t">${o.label}</div><div class="d"><span class="gain">＋</span> ${esc(o.gain)}<br><span class="cost">－</span> ${esc(o.cost)}</div></button>`;
    }).join("")}</div></div>`).join("") +
      (ui.player === "KP" ? L('<p class="small">북한은 경제제재를 받는 상태로 시작합니다(보급 매 턴 −3).</p>') : "");
  }
  $("condGroups").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b || b.disabled) return; ui.cond[b.dataset.k] = b.dataset.v; renderCond(); });
  $("condNext").addEventListener("click", startGame);

  /* ---------- 게임 시작 ---------- */
  const mapView = new MapView($("map"), { aspect: 0.8, onTap: showRegion });
  let miniView = null;

  function startGame() {
    ui.s = Eng.newGame({ player: ui.player, enemy: ui.enemyActual, stance: ui.stance, cond: Object.assign({}, ui.cond) });
    if (window.track) window.track("game_start", { player: ui.player, enemy: ui.enemyActual, stance: ui.stance });
    ui.gameMin = 0; ui.hourInTurn = 0; ui.paused = false;
    if (R.speeds.indexOf(ui.speed) < 0) ui.speed = R.speeds[0];
    mapView.setState(ui.s);
    fitFront(mapView);
    // 전황 보고 피드 시작: 개전과 함께 일어난 일(개입, 국경 구역 상실)
    ui.feed = []; ui.logIdx = 0;
    const s = ui.s, me = C[s.sides.P.id].name, foe = C[s.sides.E.id].name;
    pushMsgs([{ t: 0, tag: L("개전"), strong: true, text: s.attacker === "P" ? L("{0} {1}에 대한 군사 작전을 개시했다.", josa(me, "이"), foe) : L("{0} {1} 선제공격했다. 전군 비상.", josa(foe, "이"), josa(me, "을")),
      sub: condGroups().map((g) => `${g.title} ${g.options.find((x) => x.id === s.cond.P[g.key]).label}`).join(" · ") }]);
    pushMsgs(Report.fromLog(s, 0, 0)); ui.logIdx = s.turnLog.length;
    openStrategy();
  }

  function theaterIds(s) {
    return Object.keys(s.regions).filter((id) => [s.sides.P.id, s.sides.E.id].indexOf(s.regions[id].orig) >= 0);
  }
  function fitFront(v) {
    const s = ui.s; if (!s) return;
    // 공세가 있으면 목표 구역 중심으로(출발 구역이 큰 나라면 전장이 너무 작아진다)
    const ids = s.offensives.length ? s.offensives.map((o) => o.to) : theaterIds(s);
    v.fitRegions(ids, s.offensives.length ? 14 : 6);
  }

  /* ---------- 상태 카드 ---------- */
  function statCard(side) {
    const s = ui.s, m = s.sides[side], c = C[m.id];
    const v = (x, low) => `<b class="${low ? "low" : ""}">${x}</b>`;
    return L("<div class=\"stat\" style=\"--c:{0}\" data-act=\"stats\"><div class=\"nm\">{1} · {2}</div>\n      <div class=\"mini\"><span class=\"full\">병력{3}</span><span>보급{4}</span>\n      <span>사기{5}</span><span>여론{6}</span></div></div>", c.color, side === "P" ? L("나") : L("상대"), c.name, v(Math.round(m.forces) + "/" + m.forces0, m.forces < m.forces0 * 0.35), v(Math.round(m.supply), m.supply < 30), v(Math.round(m.morale), m.morale < 30), v(Math.round(m.opinion), m.opinion < -40));
  }

  /* 능력치가 미치는 영향 (엔진 공식 그대로) */
  function statExplainHtml() {
    return L("<h3>능력치가 미치는 영향</h3>\n      <div class=\"item\"><b>병력</b><div>공격과 방어에 투입되는 야전군 규모입니다. 공세 때 카드별로 일부(정면 돌파 70%, 우회·공중 50%, 드론 35%)를 투입하고, 바다를 건널 때는 수송 한계로 210까지만 투입됩니다. 12시간마다 경제·보급에 비례해 증원됩니다.</div></div>\n      <div class=\"item\"><b>보급</b><div>모든 전투력에 곱해집니다. 보급 100이면 100%, 50이면 75%, 0이면 50%. 공세 카드와 시간 경과로 줄고 경제로 회복되며, 방어 태세는 +5입니다. 30 아래로 떨어지면 매 12시간 사기 −4.</div></div>\n      <div class=\"item\"><b>사기</b><div>전투력에 곱해집니다. 사기 100이면 100%, 50이면 80%, 0이면 60%. 구역을 점령하면 +6, 잃으면 −6, 수도를 잃으면 −20입니다.</div></div>\n      <div class=\"item\"><b>여론</b><div>국제 여론입니다. 외교 공세가 개입을 끌어낼 확률(35% + 여론÷2 %)과 핵 판정의 외교 중재 확률에 영향을 줍니다. −40 아래면 매 12시간 사기 −2. 선제공격 −20, 민간 피해 제한 없음 −30.</div></div>\n      <div class=\"end\">병력(처음의 25% 미만)·보급(20 미만)·사기(20 미만) 중 둘이 한계 아래로 떨어지면 그쪽이 전쟁 수행 능력을 잃고 집니다.</div>");
  }

  /* ---------- 전황 보고 피드 ---------- */
  const CAT = { atk: "#f87171", def: "#60a5fa", harass: "#c084fc", news: "#facc15", intl: "#2dd4bf" };
  let msgSeq = 0;
  function pushMsgs(list) {
    if (!list || !list.length) return;
    list.forEach((m) => { m.id = ++msgSeq; m.shown = ui.skipping ? m.text.length : 0; m.started = ui.skipping; ui.feed.unshift(m); });
    if (ui.feed.length > 120) ui.feed.length = 120;
    renderFeed();
  }
  function msgHtml(m) {
    const s = ui.s, col = CAT[m.cat] || "#475569";
    const done = m.shown >= m.text.length;
    const dot = m.side ? `<i class="dot" style="background:${C[s.sides[m.side].id].color}"></i>` : "";
    return `<div class="msg cat-${m.cat || "none"} ${m.strong ? "strong" : ""}" data-mid="${m.id}" style="border-left:4px solid ${col}">
      <div class="meta"><span>${clockText(m.t)}</span><span class="tg ${m.cat ? "c-" + m.cat : ""}">${esc(m.tag)}</span>${dot}</div>
      <div class="tx">${esc(m.text.slice(0, m.shown))}${done ? "" : '<span class="cursor">▌</span>'}</div>
      ${done && m.sub ? `<div class="sb">${esc(m.sub)}</div>` : ""}${done && m.dmg ? `<div class="dm">${esc(m.dmg)}</div>` : ""}</div>`;
  }
  function renderFeed() {
    if (!ui.s) return;
    // 아직 차례가 오지 않은 보고는 보이지 않는다 (빈 칸이 쌓이지 않게)
    $("feed").innerHTML = ui.feed.filter((m) => m.started || m.shown >= m.text.length).slice(0, 60).map(msgHtml).join("");
  }
  // 글자가 하나씩 입력되는 효과: 오래된 보고부터 한 줄씩 친다
  setInterval(() => {
    if (!ui.feed || !ui.s) return;
    const queue = ui.feed.filter((m) => m.shown < m.text.length).reverse(); // 오래된 것 먼저
    if (!queue.length) return;
    const cap = ui.speed >= 6 ? 2 : 3;
    let changed = false;
    while (queue.length > cap) { const m = queue.shift(); m.shown = m.text.length; m.started = true; changed = true; }
    const m = queue[0];
    if (!m.started) { m.started = true; changed = true; }
    if (changed) renderFeed();
    const step = ui.speed >= 6 ? 2 : 1;
    m.shown = Math.min(m.text.length, m.shown + step);
    updateMsg(m);
  }, 35);
  function updateMsg(m) {
    const el = document.querySelector(`#feed [data-mid="${m.id}"]`);
    if (!el) return;
    if (m.shown >= m.text.length) { el.outerHTML = msgHtml(m); return; }
    el.querySelector(".tx").innerHTML = esc(m.text.slice(0, m.shown)) + '<span class="cursor">▌</span>';
  }

  /* ---------- 전략 선택 ---------- */
  function openStrategy() {
    const s = ui.s;
    ui.card = null; ui.target = null;
    $("stratStep").textContent = L("{0}번째 결정 · {1}", s.turn + 1, clockText(ui.gameMin));
    $("stratStats").innerHTML = statCard("P") + statCard("E");
    // 지난 12시간 요약 (턴 결과 화면 대신)
    const key = s.turnLog.filter((l) => l.kind !== "info").slice(-5);
    const lc = s.lastCards;
    let sum = "";
    if (lc && lc.P) sum += L("<div><b>지난 12시간</b> · 나 {0} vs 상대 {1}</div>", R.cards[lc.P].name, R.cards[lc.E] ? R.cards[lc.E].name : "-");
    if (lc && lc.P && s.loss) sum += L("<div class=\"why\">피해 · 아군 전력 −{0} / 적 전력 −{1}</div>", s.loss.P.toFixed(1), s.loss.E.toFixed(1));
    sum += key.map((l) => `<div>${esc(l.text)}${l.why ? L("<div class=\"why\">이유 · {0}</div>", esc(l.why)) : ""}</div>`).join("");
    if (lc && lc.P && !key.length) sum += L('<div class="why">전선에 큰 변화가 없었다.</div>');
    $("stratSummary").innerHTML = sum ? `<div class="summary">${sum}</div>` : "";
    $("stratWeather").innerHTML = L("<b>다음 12시간 예보 · {0}</b><br>{1}", s.weather.name, s.weather.note);
    renderCards();
    $("targetBox").style.display = "none";
    $("cardDesc").textContent = s.flags.lastP ? L("지난 결정: 나 {0} · 상대 {1}", R.cards[s.lastCards.P].name, R.cards[s.lastCards.E] ? R.cards[s.lastCards.E].name : "-") : L("상대도 동시에 카드를 고릅니다. 상성을 읽어 보세요.");
    $("stratGo").disabled = true;
    go("s-strategy");
    if (!miniView) miniView = new MapView($("miniMap"), { aspect: 0.62, static: true, onTap: (id) => { if (targetsNow().some((t) => t.to === id)) pickTarget(id); else toast(L("{0}: 지금 닿을 수 있는 공격 목표가 아닙니다", M[id].name)); } });
  }

  function specialCards() {
    const s = ui.s, out = [];
    const ceaseOK = s.turn + 1 >= 3 || (s.turn + 1 >= 2 && s.cond.P.method === "border") || s.flags.talksEarly;
    if (ceaseOK) out.push("ceasefire");
    if (C[s.sides.P.id].nuclear) { out.push("nukeThreat"); out.push("nukeUse"); }
    return out;
  }
  function renderCards() {
    const s = ui.s;
    const ns = Eng.nukeStatus(Object.assign({}, s, { turn: s.turn + 1 }), "P");
    const ids = R.cardOrder.concat(specialCards());
    $("cardList").innerHTML = ids.map((id) => {
      const c = R.cards[id];
      let dis = false, tag = "";
      if (id === "nukeThreat") { dis = !ns.available || s.flags.threatened.P; tag = s.flags.threatened.P ? L("사용함") : ns.available ? L("해금") : L("잠김"); }
      if (id === "nukeUse") { dis = !ns.available; tag = ns.locked ? L("잠김(사용함)") : ns.available ? L("해금") : L("잠김"); }
      return `<button class="choice ${ui.card === id ? "sel" : ""}" data-card="${id}" ${dis ? "disabled" : ""}>
        <div class="t"><span>${c.icon}</span>${c.name}${tag ? `<span class="tag ${id.startsWith("nuke") ? "warn" : ""}">${tag}</span>` : ""}</div>
        <div class="d">${esc(c.desc)}<br><span class="cost">${esc(c.cost)}</span></div></button>`;
    }).join("");
    let sp = "";
    if (C[s.sides.P.id].nuclear) {
      sp = L("<div class=\"notice\"><b>핵 해금 조건</b><br>{0}{1}</div>", ns.reqs.map((q) => `${q.ok ? "✔" : "✕"} ${q.label}`).join("<br>"), ns.locked ? L("<br>이미 사용을 시도해 다시 쓸 수 없습니다.") : "");
    }
    $("specialBox").innerHTML = sp;
  }
  function targetsNow() {
    return Eng.availableTargets(ui.s, "P");
  }
  $("cardList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-card]"); if (!b || b.disabled) return;
    ui.card = b.dataset.card;
    renderCards();
    const c = R.cards[ui.card];
    $("cardDesc").innerHTML = `<b>${c.name}</b> · ${esc(c.desc)}`;
    if (c.offensive) {
      $("targetBox").style.display = "block";
      requestAnimationFrame(() => { miniView.resize(); miniView.setState(ui.s); fitFront(miniView); renderTargets(); });
      $("stratGo").disabled = !ui.target;
    } else {
      $("targetBox").style.display = "none"; ui.target = null; miniView.preview = null;
      $("stratGo").disabled = false;
    }
  });
  function renderTargets() {
    const s = ui.s, list = targetsNow();
    if (!list.length) { $("targetList").innerHTML = L('<div class="small">공격할 수 있는 상대 구역이 없습니다.</div>'); return; }
    const routeName = { land: L("육로"), sea1: L("상륙"), sea2: L("경유 상륙") };
    $("targetList").innerHTML = list.map((t) => {
      const reg = s.regions[t.to], m = M[t.to];
      const mark = m.capital ? L(" ★수도") : m.core ? L(" ■거점") : "";
      const seaTxt = t.enemySea ? L("·적 제해권 아래 강행") : t.contested ? L("·제해권 경합") : "";
      const eff = (ui.card === "air" || ui.card === "drone") && t.route !== "land" ? Math.max(t.mult, 0.75) : t.mult;
      const why = L("{0}{1} · 공격력 {2}%", routeName[t.route], seaTxt, Math.round(eff * 100));
      return L("<button class=\"choice {0}\" data-tg=\"{1}\">\n        <div class=\"t\">{2}{3}<span class=\"tag\">수비 {4}</span></div>\n        <div class=\"d\">{5}에서 · {6}</div></button>", ui.target === t.to ? "sel" : "", t.to, esc(m.name), mark, Math.round(reg.garrison), esc(M[t.from].name), why);
    }).join("");
    if (list.some((t) => t.enemySea)) $("targetList").insertAdjacentHTML("afterbegin", L('<div class="small" style="margin-bottom:6px">상대가 쥔 바다를 건너면 공격력이 절반으로 깎입니다. 보급선 차단·사이버 공격으로 해군력을 먼저 흔들거나, 공중 우세·드론으로 타격하세요.</div>'));
    miniView.draw(0);
  }
  function pickTarget(id) {
    ui.target = id;
    const t = targetsNow().find((x) => x.to === id);
    miniView.preview = t ? { from: t.from, to: t.to, route: t.route, side: "P" } : null;
    miniView.highlight = id;
    miniView.fitRegions([id], 32);
    renderTargets(); $("stratGo").disabled = false;
  }
  $("targetList").addEventListener("click", (e) => { const b = e.target.closest("[data-tg]"); if (!b) return; pickTarget(b.dataset.tg); });

  $("stratGo").addEventListener("click", () => {
    const s = ui.s;
    Eng.setPlayerChoice(s, ui.card, ui.target);
    const res = Eng.startTurn(s);
    if (miniView) { miniView.preview = null; miniView.highlight = null; }
    ui.hourInTurn = 0; ui.halfDone = -1;
    mapView.setState(s);
    pushMsgs(Report.turnStart(s, ui.gameMin));
    pushMsgs(Report.fromLog(s, ui.gameMin, 0)); ui.logIdx = s.turnLog.length;
    if (res.nukeJudge) return showNuke(res.nukeJudge);
    if (s.over) return showTurnResult();
    beginTurnRun();
  });

  /* ---------- 지도 실시간 진행 ---------- */
  function beginTurnRun() {
    ui.paused = false; ui.skipping = false;
    renderSpeed(); updateMapHud();
    fitFront(mapView);
    renderFeed();
    go("s-map");
    startLoop();
  }
  function renderSpeed() {
    $("speed").innerHTML = R.speeds.map((v) => `<button class="${ui.speed === v ? "on" : ""}" data-sp="${v}">${v}x</button>`).join("");
    $("pauseBtn").textContent = ui.paused ? "▶" : "Ⅱ";
  }
  $("speed").addEventListener("click", (e) => { const b = e.target.closest("[data-sp]"); if (!b) return; ui.speed = +b.dataset.sp; renderSpeed(); });
  $("pauseBtn").addEventListener("click", () => { ui.paused = !ui.paused; renderSpeed(); });
  $("skipBtn").addEventListener("click", () => { ui.skipping = true; ui.paused = false; renderSpeed(); });


  function updateMapHud() {
    const s = ui.s;
    $("clock").innerHTML = L("{0}<small>{1}번째 12시간</small>", clockText(ui.gameMin), s.turn);
    $("mapStats").innerHTML = statCard("P") + statCard("E");
    $("nextInfo").textContent = L("다음 결정까지 {0}시간", R.hoursPerTurn - ui.hourInTurn);
    $("legend").innerHTML = [s.sides.P.id, s.sides.E.id].map((cid) => `<span><i style="background:${C[cid].color}"></i>${C[cid].name}</span>`).join("") +
      L('<span><i style="background:#3a4150"></i>중립·기타</span><span>★ 수도 ■ 핵심 거점 · 점무늬 = 점령지 · 숫자 = 수비</span>');
    $("frontList").innerHTML = s.offensives.map((o) => {
      const reg = s.regions[o.to], start = Math.max(1, reg.gstart || reg.gmax);
      const p = o.result === "captured" ? 100 : Math.max(0, Math.min(100, Math.round((1 - reg.garrison / start) * 100)));
      const c = C[s.sides[o.side].id];
      return `<div><span>${o.side === "P" ? L("내 공세") : L("상대 공세")} → ${esc(M[o.to].name)}${o.result === "captured" ? L(" · 점령") : ""}</span><span class="prog"><i style="width:${p}%;background:${c.color}"></i></span></div>`;
    }).join("") || L('<div><span class="small">이번 턴에는 공세가 없습니다.</span></div>');
  }

  let raf = 0, last = 0;
  function startLoop() { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
  function loop(now) {
    const dt = Math.min(100, now - last); last = now;
    const s = ui.s;
    if (ui.screen === "s-map" && s && !s.over) {
      if (!ui.paused && !document.hidden) {
        const rate = ui.skipping ? 480 : R.gameMinPerRealSec * ui.speed; // 건너뛰기: 12시간을 약 1.5초에
        ui.gameMin += (dt / 1000) * rate;
        const turnStartMin = (s.turn - 1) * R.hoursPerTurn * 60;
        let changed = false;
        // 30분: 방어 측 대응 보고
        if (ui.halfDone !== ui.hourInTurn && ui.gameMin >= turnStartMin + ui.hourInTurn * 60 + 30 && ui.hourInTurn < R.hoursPerTurn && !ui.skipping) {
          ui.halfDone = ui.hourInTurn;
          pushMsgs(Report.half(s, turnStartMin + ui.hourInTurn * 60 + 30));
        }
        while (ui.gameMin >= turnStartMin + (ui.hourInTurn + 1) * 60 && ui.hourInTurn < R.hoursPerTurn && !s.over) {
          const prev = { supply: s.sides.P.supply, morale: s.sides.P.morale };
          const ev = Eng.tickHour(s);
          ui.hourInTurn++;
          const at = turnStartMin + ui.hourInTurn * 60;
          if (ev.length) changed = true;
          const msgs = (ui.skipping && !ev.length) ? [] : Report.hour(s, at);
          pushMsgs(msgs.concat(Report.fromLog(s, at, ui.logIdx), Report.status(s, at, prev)));
          ui.logIdx = s.turnLog.length;
        }
        if (changed) mapView.redrawBase();
        updateMapHud();
        if (s.over || ui.hourInTurn >= R.hoursPerTurn) {
          ui.gameMin = Math.max(ui.gameMin, turnStartMin + ui.hourInTurn * 60);
          if (!s.over) Eng.endTurn(s);
          pushMsgs(Report.fromLog(s, ui.gameMin, ui.logIdx)); ui.logIdx = s.turnLog.length;
          if (!s.over) pushMsgs([{ t: ui.gameMin, tag: L("결정 시점"), strong: true, text: L("12시간이 지났다. 다음 작전을 정한다."), sub: L("다음 12시간 예보 · {0}", s.weather.name) }]);
          mapView.redrawBase(); mapView.draw(dt);
          setTimeout(() => { if (s.over) showTurnResult(); else if (s.pending) showOffer(); else openStrategy(); }, s.over ? 1200 : 1100);
          stopLoop(); return;
        }
      }
      mapView.draw(dt);
    }
    raf = requestAnimationFrame(loop);
  }

  function showRegion(id) {
    const s = ui.s, m = M[id];
    if (m.type === "sea") {
      const ctrl = s.seas[id].ctrl;
      return sheet(L("<h3>{0}</h3><div class=\"kv\"><span>제해권</span><span>{1}</span></div><p class=\"small\">상대가 제해권을 쥔 바다는 건너 공격할 수 없습니다. 보급선 차단 카드는 해군력을 1.5배로 올립니다.</p>", esc(m.name), ctrl ? C[s.sides[ctrl].id].name : L("경합")));
    }
    if (m.type === "neutral") return sheet(L("<h3>{0}</h3><p class=\"small\">중립 지역입니다. 지나갈 수 없습니다.</p>", esc(m.name)));
    const r = s.regions[id];
    const flags = [m.capital && L("수도"), m.core && L("핵심 거점"), m.fort && L("요새 지형"), m.port && L("항구")].filter(Boolean).join(" · ") || L("일반");
    sheet(L("<h3>{0}</h3>\n      <div class=\"kv\"><span>지금 소속</span><span>{1}{2}</span></div>\n      <div class=\"kv\"><span>수비</span><span>{3} / {4}</span></div>\n      <div class=\"kv\"><span>특징</span><span>{5}</span></div>", esc(m.name), C[r.owner].name, r.owner !== r.orig ? L(" (원래 {0})", C[r.orig].name) : "", Math.round(r.garrison), Math.round(r.gmax), flags));
  }

  /* ---------- 턴 결과 ---------- */
  function showTurnResult(opening) {
    const s = ui.s;
    $("turnStep").textContent = opening ? L("개전") : L("{0}번째 12시간 · {1}", s.turn, clockText(ui.gameMin));
    $("turnTitle").textContent = opening ? L("개전과 함께 일어난 일") : s.over ? L("전쟁이 끝났습니다") : L("12시간의 결과");
    const lc = s.lastCards || s.cards;
    $("turnVs").innerHTML = opening ? "" : L("<span class=\"pill\">나 · {0}</span> vs <span class=\"pill\">상대 · {1}</span>", R.cards[lc.P] ? R.cards[lc.P].name : "-", R.cards[lc.E] ? R.cards[lc.E].name : "-");
    const evs = s.turnLog.slice();
    if (!evs.length) evs.push({ kind: "info", text: L("전선에 큰 변화가 없었다"), why: lc.E && R.cards[lc.E] ? L("상대가 {0}를 택해 맞섰다", R.cards[lc.E].name) : "" });
    if (s.over) evs.push({ kind: "capture", text: `${Eng.resultLabel(s.over, s).head} · ${Eng.resultLabel(s.over, s).type || ""}`, why: s.over.reason });
    $("turnEvents").innerHTML = evs.map((e) => `<div class="ev ${e.kind}"><div>${esc(e.text)}</div>${e.why ? `<div class="why">${esc(e.why)}</div>` : ""}</div>`).join("");
    $("turnNext").textContent = s.over ? L("여파 보기") : s.pending ? L("정전안 확인") : L("다음 전략 고르기");
    go("s-turn");
  }
  $("turnNext").addEventListener("click", () => {
    const s = ui.s;
    if (s.over) return startEpilogue();
    if (s.pending) return showOffer();
    openStrategy();
  });

  function showOffer() {
    const s = ui.s;
    $("offerWhy").textContent = s.pending.why;
    const net = s.sides.P.captured - s.sides.P.lost;
    $("offerNow").innerHTML = L("지금 수락하면: 점령 {0}구역 · 상실 {1}구역 → {2}", s.sides.P.captured, s.sides.P.lost, net > 0 ? L("유리한 정전(승리)") : net < 0 ? L("불리한 정전(패배)") : L("현상 유지(무승부)"));
    go("s-offer");
  }
  $("offerYes").addEventListener("click", () => { Eng.acceptAiOffer(ui.s, true); startEpilogue(); });
  $("offerNo").addEventListener("click", () => { Eng.acceptAiOffer(ui.s, false); openStrategy(); });

  /* ---------- 핵 판정 ---------- */
  function showNuke(j) {
    const s = ui.s, who = C[s.sides[j.side].id].name;
    $("nukeTitle").textContent = L("{0}의 핵 사용 시도", who);
    const a = Math.round(j.intercept * 100), b = Math.round(j.mediate * 100), c = Math.max(0, 100 - a - b);
    $("nukeJudge").innerHTML = L("<div class=\"jrow\"><div>요격·차단 {0}% · 외교 중재 {1}% · 발사 {2}%</div>\n      <div class=\"jbar\"><i style=\"width:{3}%;background:#60a5fa\"></i><i style=\"width:{4}%;background:#a3e635\"></i><i style=\"width:{5}%;background:#f87171\"></i></div>\n      <div class=\"jbar\" style=\"background:none;height:16px;position:relative\"><i id=\"nukeMark\" style=\"position:absolute;left:0;width:4px;height:16px;background:#fff\"></i></div></div>", a, b, c, a, b, c);
    $("nukeResult").style.display = "none"; $("nukeNext").disabled = true;
    go("s-nuke");
    const target = Math.round(j.roll * 100);
    let x = 0; const mark = $("nukeMark");
    const step = () => {
      x += 3; mark.style.left = Math.min(x % 101, 100) + "%";
      if (x < 200 + target) return requestAnimationFrame(step);
      mark.style.left = target + "%";
      const txt = { intercept: L("요격·차단 성공. 발사는 실패했고, 국제 사회의 반발이 커졌다."), mediate: L("외교 중재가 작동했다. 발사 직전 정전 협상이 열렸다."), launch: L("어떤 저지도 작동하지 않았다. 전쟁은 끝났지만 국제 고립이 시작된다.") }[j.result];
      $("nukeResult").textContent = txt; $("nukeResult").style.display = "block"; $("nukeNext").disabled = false;
    };
    requestAnimationFrame(step);
  }
  $("nukeNext").addEventListener("click", () => { pushMsgs(Report.fromLog(ui.s, ui.gameMin, ui.logIdx)); ui.logIdx = ui.s.turnLog.length; if (ui.s.over) showTurnResult(); else beginTurnRun(); });

  /* ---------- 에필로그 ---------- */
  const epi = new Epilogue($("epi"));
  let epiRaf = 0;
  function startEpilogue() {
    stopLoop();
    go("s-epi");
    mapView.redrawBase();
    epi.start(ui.s, mapView, (cut, i, n) => {
      $("epiCut").textContent = cut.title;
      $("epiLine").textContent = cut.line;
      $("epiWhy").textContent = cut.why;
      $("epiDots").innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("");
      $("epiNext").textContent = i === n - 1 ? L("최종 결과 보기") : L("다음 장면");
    });
    let l = performance.now();
    cancelAnimationFrame(epiRaf);
    const f = (now) => { epi.tick(now - l); l = now; if (ui.screen === "s-epi") epiRaf = requestAnimationFrame(f); };
    epiRaf = requestAnimationFrame(f);
  }
  $("epiNext").addEventListener("click", () => { if (epi.idx < epi.data.cuts.length - 1) epi.show(epi.idx + 1); else showResult(); });
  $("epiSkip").addEventListener("click", showResult);

  /* ---------- 최종 결과 ---------- */
  function resultCode(s) {
    const o = s.over;
    const w = { P: "w", E: "l", draw: "d", none: "n" }[o.winner];
    return ["r", s.sides.P.id.toLowerCase(), s.sides.E.id.toLowerCase(), s.stance === "attack" ? "a" : "d", o.type, w, "t" + s.turn, "c" + s.sides.P.captured, "l" + s.sides.P.lost].join("-");
  }
  function cardHtml(p, e, stance, type, winner, turns, cap, lost, reason) {
    const lab = Eng.resultLabel({ type, winner }, { attacker: stance === "attack" ? "P" : "E" });
    return L("<div class=\"small\">{0} {1} vs {2} · {3} 입장</div>\n      <div class=\"head\">{4}</div><div class=\"type\">{5}</div>\n      {6}\n      <div class=\"nums\"><div><b>{7}</b><span>결정 횟수</span></div><div><b>{8}</b><span>점령 구역</span></div><div><b>{9}</b><span>잃은 구역</span></div></div>", swatch(p), C[p].name, C[e].name, stance === "attack" ? L("공격") : L("방어"), lab.head, lab.type || "", reason ? `<div class="reason">${esc(reason)}</div>` : "", turns, cap, lost);
  }
  function showResult() {
    const s = ui.s, o = s.over;
    cancelAnimationFrame(epiRaf);
    $("resultCard").innerHTML = cardHtml(s.sides.P.id, s.sides.E.id, s.stance, o.type, o.winner, s.turn, s.sides.P.captured, s.sides.P.lost, o.reason);
    const condTxt = condGroups().map((g) => `${g.title}: ${g.options.find((x) => x.id === s.cond.P[g.key]).label}`).join(" · ");
    $("timeline").innerHTML = L("<div><span class=\"t\">개전</span>{0}</div>", esc(condTxt)) +
      s.timeline.map((t) => L("<div><span class=\"t\">{0}턴</span>{1} → {2}<span class=\"r\">{3}</span></div>", t.turn, esc(t.choice), esc(t.result), esc(t.reason))).join("");
    if (window.track) window.track("game_end", { player: s.sides.P.id, enemy: s.sides.E.id, result: o.type, winner: o.winner, turns: s.turn });
    try { history.replaceState(null, "", "#" + resultCode(s)); } catch (e) { location.hash = resultCode(s); }
    go("s-result");
  }
  $("shareBtn").addEventListener("click", async () => {
    const s = ui.s, lab = Eng.resultLabel(s.over, s);
    const text = L("동아시아 전쟁 시뮬레이션: {0}로 {1}{2}, {3}번 결정 · 점령 {4}구역\n{5}", C[s.sides.P.id].name, lab.head, lab.type ? " (" + lab.type + ")" : "", s.turn, s.sides.P.captured, location.href);
    try { if (navigator.share) { await navigator.share({ title: CFG.title, text }); return; } } catch (e) {}
    try { await navigator.clipboard.writeText(text); toast(L("결과 문구와 링크를 복사했습니다")); }
    catch (e) { sheet(L("<h3>결과 공유</h3><p class=\"small\">아래 문구를 길게 눌러 복사하세요.</p><p style=\"white-space:pre-wrap;user-select:all\">{0}</p>", esc(text))); }
  });
  $("againBtn").addEventListener("click", () => { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} renderStance(); go("s-stance"); });

  /* ---------- 공유 링크로 열기 ---------- */
  function openShared() {
    const h = (location.hash || "").slice(1).split("-");
    if (h[0] !== "r" || h.length < 9) return false;
    const p = h[1].toUpperCase(), e = h[2].toUpperCase();
    if (!C[p] || !C[e]) return false;
    const winner = { w: "P", l: "E", d: "draw", n: "none" }[h[5]] || "draw";
    $("sharedCard").innerHTML = cardHtml(p, e, h[3] === "a" ? "attack" : "defense", h[4], winner, parseInt(h[6].slice(1)) || 0, parseInt(h[7].slice(1)) || 0, parseInt(h[8].slice(1)) || 0, "");
    $("sharedDisc").textContent = CFG.disclaimer;
    go("s-shared");
    return true;
  }
  $("sharedPlay").addEventListener("click", () => { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} go("s-start"); });

  window.addEventListener("resize", () => { mapView.resize(); if (ui.screen === "s-start") drawHero(); });
  renderCountries();
  if (!openShared()) go("s-start");
  // 테스트용 접근
  window.__ui = ui;
})();
