/* 게임 엔진: 화면과 분리된 순수 로직 (node 로도 시뮬레이션 가능)
   P = 플레이어 쪽, E = 상대 쪽. 모든 수치는 RULES / COUNTRIES 데이터에서 읽는다.
*/
(function (root) {
  "use strict";
  const G = root;

  /* ---------- 유틸 ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const other = (s) => (s === "P" ? "E" : "P");
  const pct = (m) => (m >= 1 ? "+" : "−") + Math.round(Math.abs(m - 1) * 100) + "%";

  function regionMap() {
    const m = {};
    G.MAP_DATA.regions.forEach((r) => (m[r.id] = r));
    return m;
  }

  /* ---------- 새 게임 ---------- */
  function newGame(opt) {
    const R = G.RULES, C = G.COUNTRIES, M = regionMap();
    const seed = opt.seed || (Date.now() & 0xffffffff);
    const s = {
      seed, rand: null,
      player: opt.player, enemy: opt.enemy, stance: opt.stance,
      attacker: opt.stance === "attack" ? "P" : "E",
      cond: { P: Object.assign({}, opt.cond), E: {} },
      turn: 0, hour: 0,
      regions: {}, seas: {},
      sides: {}, cards: { P: null, E: null }, targets: { P: null, E: null },
      offensives: [], interv: {},
      turnLog: [], timeline: [], pending: null,
      flags: { usCapUntil: 0, nukeLocked: { P: false, E: false }, threatened: { P: false, E: false },
               lastAiOffer: -9, fortifyUntil: 0, talksEarly: false, firstTurnAtk: { P: 1, E: 1 } },
      over: null,
    };
    s.rand = rng(seed);

    // 양쪽 능력치
    ["P", "E"].forEach((side) => {
      const c = C[side === "P" ? s.player : s.enemy];
      s.sides[side] = {
        id: c.id, forces: c.forces, forces0: c.forces, supply: c.supply, morale: c.morale,
        economy: c.economy, opinion: 0, reinfMult: 1, captured: 0, lost: 0,
      };
    });

    // 구역
    G.MAP_DATA.regions.forEach((r) => {
      if (r.type === "sea") { s.seas[r.id] = { ctrl: null }; return; }
      const c = C[r.owner];
      const g = c ? c.garrison : 0;
      s.regions[r.id] = { owner: r.owner, orig: r.owner, garrison: g, gmax: g, gstart: g, flash: 0 };
    });

    // 상대 개전 조건 (AI)
    const rnd = s.rand;
    if (s.attacker === "E") {
      const civ = rnd();
      s.cond.E = {
        method: "preempt",
        civil: civ < 0.15 ? "protect" : civ < 0.85 ? "limited" : "unlimited",
        sea: C[s.enemy].navy >= C[s.player].navy * 0.8 ? (rnd() < 0.5 ? "partial" : rnd() < 0.4 ? "full" : "none") : "none",
        sanction: rnd() < 0.4 ? "impose" : "none",
      };
    } else {
      s.cond.E = { method: "counter", civil: "limited", sea: "none", sanction: "none" };
    }

    setupInterventions(s);
    applyOpening(s);
    updateSeaControl(s);
    rollWeather(s);
    return s;
  }

  function rollWeather(s) {
    const W = G.RULES.weather;
    let tot = 0; W.forEach((w) => (tot += w.w));
    let x = s.rand() * tot;
    s.weather = W[W.length - 1];
    for (const w of W) { x -= w.w; if (x <= 0) { s.weather = w; break; } }
  }

  function sideOfCountry(s, cid) { return s.sides.P.id === cid ? "P" : s.sides.E.id === cid ? "E" : null; }
  function blocOf(s, side) { return G.COUNTRIES[s.sides[side].id].bloc; }

  function setupInterventions(s) {
    const bP = blocOf(s, "P"), bE = blocOf(s, "E");
    const I = { US: { level: 0, side: null }, NATO: { level: 0, side: null }, RU: { level: 0, side: null }, CNX: { level: 0, side: null } };
    if (bP !== bE) {
      const west = bP === "west" ? "P" : "E", east = other(west);
      const westDefender = s.attacker !== west;
      I.US.side = west; I.US.level = westDefender ? 1 : 0;
      I.NATO.side = west;
      I.RU.side = east;
      const cids = [s.sides.P.id, s.sides.E.id];
      if (cids.indexOf("CN") < 0 && s.sides[east].id === "KP") { I.CNX.side = east; I.CNX.level = 1; }
    } else if (bP === "west") {
      I.US.side = "mediate"; I.US.level = 1; I.NATO.side = "mediate";
    } else {
      I.RU.side = "mediate"; I.RU.level = 1;
    }
    s.interv = I;
  }

  // victim 쪽을 지원하는 개입 세력 목록
  function supportersOf(s, side) {
    return Object.keys(s.interv).filter((k) => s.interv[k].side === side);
  }
  function raise(s, key, n, why) {
    const it = s.interv[key];
    if (!it || !it.side) return false;
    const R = G.RULES.interventions[key];
    let cap = R.max;
    if (key === "US" && s.turn < s.flags.usCapUntil) cap = Math.min(cap, 1);
    const before = it.level;
    it.level = clamp(it.level + n, 0, cap);
    if (it.level !== before) {
      const who = it.side === "mediate" ? "중재" : (it.side === "P" ? "내 편" : "상대 편");
      log(s, "interv", `${R.name} ${who} 개입 ${it.level}단계: ${R.levels[it.level] || "중재 압박"}`, why);
      return true;
    }
    return false;
  }
  function raiseSupporters(s, side, why) {
    let any = false;
    supportersOf(s, side).forEach((k) => { if (raise(s, k, 1, why)) any = true; });
    // 같은 진영끼리의 전쟁이면 중재 세력이 압박을 키운다
    Object.keys(s.interv).forEach((k) => { if (s.interv[k].side === "mediate" && raise(s, k, 1, why)) any = true; });
    return any;
  }

  function applyOpening(s) {
    const C = G.COUNTRIES;
    ["P", "E"].forEach((side) => {
      const me = s.sides[side], foe = other(side), c = s.cond[side], cc = C[me.id];
      const iAmAttacker = s.attacker === side;
      if (iAmAttacker && c.method === "preempt") {
        s.flags.firstTurnAtk[side] = 1.2 * (cc.firstStrike || 1);
        me.opinion -= 20;
        if (cc.preemptPenalty) { me.opinion -= 10; me.morale -= 10; }
        if (me.id === "KR") s.flags.usCapUntil = 4;
        if (s.interv.US.side === side && me.id === "KR") s.interv.US.level = 0;
        raiseSupporters(s, foe, `${cc.name}의 선제공격`);
      }
      if (iAmAttacker && c.method === "border") s.flags.firstTurnAtk[side] = 0.7;
      if (!iAmAttacker) {
        if (c.method === "counter") s.flags.firstTurnAtk[foe] = 1 + (s.flags.firstTurnAtk[foe] - 1) / 2;
        if (c.method === "counter" && side === "P") me.supply -= 5;
        if (c.method === "fortify") { s.flags.fortifyUntil = 3; loseBorderRegion(s, side); }
        if (c.method === "talks") { s.flags.talksEarly = true; raiseSupporters(s, side, "정전 외교 우선 대응"); }
      }
      if (c.civil === "protect") { me.morale += 10; me.opinion += 10; }
      if (c.civil === "unlimited") { me.morale -= 15; me.opinion -= 30; raiseSupporters(s, foe, `${cc.name}의 민간 피해 제한 없음`); }
      if (c.sea === "partial") { me.economy -= 5; me.opinion -= 5; }
      if (c.sea === "full") {
        me.economy -= 15; me.opinion -= 10;
        if (s.interv.NATO.side === foe || s.interv.NATO.side === "mediate") raise(s, "NATO", 1, `${cc.name}의 전면 해상 봉쇄`);
      }
      if (c.sanction === "impose") me.economy -= 5;
      clampSide(me);
    });
  }

  function loseBorderRegion(s, side) {
    const M = regionMap(), mine = s.sides[side].id, theirs = s.sides[other(side)].id;
    const cand = Object.keys(s.regions).filter((id) => {
      const r = s.regions[id];
      if (r.owner !== mine || M[id].capital) return false;
      return M[id].adj.some((a) => s.regions[a] && s.regions[a].owner === theirs);
    });
    if (!cand.length) { log(s, "info", "국경이 맞닿지 않아 먼저 잃는 구역은 없었다", "방어선 구축"); return; }
    const id = cand[0];
    capture(s, other(side), id, "방어선 구축을 위해 국경 구역을 내주었다");
  }

  /* ---------- 공격 가능 목표 ---------- */
  function availableTargets(s, side) {
    const M = regionMap();
    const me = s.sides[side].id, foe = s.sides[other(side)].id;
    const out = {};
    const mine = Object.keys(s.regions).filter((id) => s.regions[id].owner === me);
    mine.forEach((from) => {
      const fr = M[from];
      fr.adj.forEach((to) => {
        if (s.regions[to] && s.regions[to].owner === foe) {
          const t = { to, from, route: "land", sea: null, mult: 1, blocked: false };
          keepBest(out, t);
        }
      });
      const seasFrom = fr.adj.filter((a) => M[a].type === "sea");
      if (!seasFrom.length) return;
      Object.keys(s.regions).forEach((to) => {
        if (s.regions[to].owner !== foe) return;
        const seasTo = M[to].adj.filter((a) => M[a].type === "sea");
        seasFrom.forEach((a) => seasTo.forEach((b) => {
          let route = null;
          if (a === b) route = "sea1"; else if (M[a].adj.indexOf(b) >= 0) route = "sea2";
          if (!route) return;
          const ctrlA = s.seas[a].ctrl, ctrlB = s.seas[b].ctrl;
          // 상대가 바다를 쥐고 있어도 막지 않는다: 강행 상륙으로 공격력이 크게 깎일 뿐
          const enemySea = ctrlA === other(side) || ctrlB === other(side);
          const contested = !enemySea && (ctrlA !== side || ctrlB !== side);
          let mult = route === "sea1" ? G.RULES.combat.amphib : G.RULES.combat.amphib2;
          if (enemySea) mult *= G.RULES.combat.enemySea; else if (contested) mult *= G.RULES.combat.contested;
          keepBest(out, { to, from, route, sea: a === b ? a : a + ">" + b, mult, blocked: false, contested, enemySea });
        }));
      });
    });
    const M2 = regionMap(), key = (t) => (M2[t.to].capital ? 2 : M2[t.to].core ? 1 : 0);
    return Object.keys(out).map((k) => out[k]).sort((x, y) => (y.mult - x.mult) || (key(y) - key(x)));
  }
  function keepBest(out, t) {
    const cur = out[t.to];
    const score = (x) => (x.blocked ? -1 : x.mult);
    if (!cur || score(t) > score(cur)) out[t.to] = t;
  }

  /* ---------- 제해권 ---------- */
  function updateSeaControl(s) {
    const M = regionMap();
    ["P", "E"].forEach((x) => (s.sides[x]._navy = navyPower(s, x)));
    Object.keys(s.seas).forEach((sid) => {
      const home = { P: 1, E: 1 };
      M[sid].adj.forEach((a) => {
        const r = s.regions[a];
        if (!r) return;
        if (r.owner === s.sides.P.id) home.P = 1.2;
        if (r.owner === s.sides.E.id) home.E = 1.2;
      });
      const p = s.sides.P._navy * home.P, e = s.sides.E._navy * home.E;
      s.seas[sid].ctrl = p > e * 1.25 ? "P" : e > p * 1.25 ? "E" : null;
    });
  }
  function navyPower(s, side) {
    const c = G.COUNTRIES[s.sides[side].id], me = s.sides[side];
    let n = c.navy * (0.6 + me.economy / 200);
    if (s.cards[side] === "interdict") n *= 1.5;
    if (s.cards[other(side)] === "cyber") n *= 0.8;
    if (s.interv.US.side === side) n += s.interv.US.level >= 3 ? 60 : s.interv.US.level >= 2 ? 30 : 0;
    if (s.interv.NATO.side === side && s.interv.NATO.level >= 3) n += 30 * natoFactor(s);
    return n;
  }
  function natoFactor(s) { return s.interv.RU.level >= 2 && s.interv.RU.side && s.interv.RU.side !== "mediate" ? 0.5 : 1; }

  /* ---------- AI 선택 ---------- */
  function aiChoose(s) {
    const E = s.sides.E, P = s.sides.P, r = s.rand();
    const targets = availableTargets(s, "E").filter((t) => !t.blocked);
    const weak = E.forces < P.forces * 0.55 || E.supply < 30 || E.morale < 30;
    let card;
    const lastP = s.flags.lastP;
    if (!targets.length) card = r < 0.6 ? "interdict" : "defend";
    else if (weak) card = r < 0.45 ? "defend" : r < 0.65 ? "diplomacy" : r < 0.8 ? "cyber" : r < 0.9 ? "spy" : "flank";
    else {
      // 플레이어의 지난 선택을 읽고 상성을 노린다
      const w = { frontal: 3, flank: 2.5, air: 2, drone: 1.8, defend: 1.2, interdict: 0.8, cyber: 0.8, spy: 0.6 };
      if (lastP === "air") { w.drone -= 1; }
      if (lastP === "defend") { w.flank += 3; w.frontal -= 1.5; }
      if (lastP === "frontal") { w.defend += 2.5; }
      if (lastP === "flank") { w.air += 3; }
      if (lastP === "diplomacy") { w.frontal += 2.5; }
      if (s.attacker === "E" && s.turn <= 2) { w.frontal += 2; w.defend = 0.3; }
      let tot = 0; for (const k in w) tot += Math.max(0.1, w[k]);
      let x = r * tot; card = "frontal";
      for (const k in w) { x -= Math.max(0.1, w[k]); if (x <= 0) { card = k; break; } }
    }
    s.cards.E = card;
    s.targets.E = null;
    if (G.RULES.cards[card].offensive && targets.length) {
      const M = regionMap();
      let best = null, bs = -1e9;
      targets.forEach((t) => {
        const reg = s.regions[t.to], m = M[t.to];
        const sc = (m.capital ? 3 : 0) + (m.core ? 1.5 : 0) - reg.garrison / 20 + t.mult * 2 + s.rand() * 1.2;
        if (sc > bs) { bs = sc; best = t.to; }
      });
      s.targets.E = best;
    }
    // AI 핵 판단
    const ns = nukeStatus(s, "E");
    if (ns.available) {
      if (!s.flags.threatened.E && E.morale < 45) s.cards.E = "nukeThreat";
      else if (s.flags.threatened.E && (E.morale < 25 || E.forces < E.forces0 * 0.3) && s.rand() < 0.35) s.cards.E = "nukeUse";
    }
  }

  /* ---------- 핵 ---------- */
  function nukeStatus(s, side) {
    const R = G.RULES.nuke, me = s.sides[side], c = G.COUNTRIES[me.id];
    const M = regionMap();
    const lostCore = Object.keys(s.regions).some((id) => {
      const r = s.regions[id];
      return r.orig === me.id && r.owner !== me.id && (M[id].core || M[id].capital);
    });
    const reqs = [
      { label: "핵 보유국", ok: !!c.nuclear },
      { label: `${R.unlockTurn}턴 이후`, ok: s.turn >= R.unlockTurn },
      { label: "핵심 거점 상실 또는 병력 40% 미만", ok: lostCore || me.forces < me.forces0 * 0.4 },
      { label: "보급 또는 사기 40 미만", ok: me.supply < 40 || me.morale < 40 },
    ];
    const locked = s.flags.nukeLocked[side];
    return { reqs, locked, nuclear: !!c.nuclear, available: !locked && reqs.every((q) => q.ok) };
  }

  function judgeNuke(s, side) {
    const R = G.RULES.nuke, foe = other(side), fc = s.sides[foe].id;
    let intercept = R.interceptBase;
    const us = s.interv.US;
    if (us.side === foe) intercept = us.level >= 3 ? R.interceptUS3 : us.level >= 2 ? R.interceptUS2 : intercept;
    if (fc === "KR" || fc === "JP") intercept += R.interceptMissileDef;
    let mediate = R.mediateBase;
    if (s.interv.CNX.side === side) mediate += R.mediateCNX;
    if (s.sides[side].opinion > -30) mediate += R.mediateOpinion;
    const roll = s.rand();
    const result = roll < intercept ? "intercept" : roll < intercept + mediate ? "mediate" : "launch";
    return { intercept, mediate, roll, result };
  }

  /* ---------- 턴 시작 ---------- */
  function setPlayerChoice(s, card, target) { s.cards.P = card; s.targets.P = target || null; }

  function startTurn(s) {
    s.turn += 1;
    s.turnLog = [];
    s.offensives = [];
    s.loss = { P: 0, E: 0 };
    s.turnStartOwners = {};
    Object.keys(s.regions).forEach((id) => (s.turnStartOwners[id] = s.regions[id].owner));
    if (!s.cards.E) aiChoose(s);
    updateSeaControl(s);

    let nukeJudge = null;
    ["P", "E"].forEach((side) => {
      if (s.over) return;
      const card = s.cards[side], me = s.sides[side], foe = other(side), C = G.COUNTRIES;
      const nm = C[me.id].name, fn = C[s.sides[foe].id].name;
      if (card === "frontal") me.supply -= 8;
      if (card === "flank") me.supply -= 12;
      if (card === "air") me.economy -= 5;
      if (card === "drone") me.supply -= 4;
      if (card === "cyber") {
        const both = s.cards[foe] === "cyber";
        const k = both ? 0.5 : 1;
        s.sides[foe].supply -= 10 * k; s.sides[foe].morale -= 3 * k; me.economy -= 3; s.sides[foe].opinion += 5;
        log(s, "harass", `${nm}의 사이버 공격: ${fn} 보급 −${10 * k}, 사기 −${3 * k}, 해군력 −20%`, both ? "양측 사이버전이 맞부딪혀 효과가 절반으로 줄었다" : "지휘·통신망과 물류 전산이 마비됐다");
      }
      if (card === "spy") {
        const chance = 0.6 + (s.sides[foe].opinion < -20 ? 0.1 : 0) - (s.cards[foe] === "defend" ? 0.1 : 0);
        if (s.rand() < chance) {
          s.sides[foe].morale -= 8;
          const M = regionMap();
          const border = Object.keys(s.regions).filter((id) => s.regions[id].owner === s.sides[foe].id && M[id].adj.some((a) => s.regions[a] && s.regions[a].owner === me.id));
          const pool = border.length ? border : Object.keys(s.regions).filter((id) => s.regions[id].owner === s.sides[foe].id);
          const id = pool[Math.floor(s.rand() * pool.length)];
          if (id) s.regions[id].garrison *= 0.7;
          log(s, "harass", `${nm}의 공작 성공: ${fn} 사기 −8${id ? `, ${M[id].name} 수비 −30%` : ""}`, `성공 확률 ${Math.round(chance * 100)}%. 허위 정보와 사보타주로 내부가 흔들렸다`);
        } else {
          me.opinion -= 10;
          log(s, "harass", `${nm} 공작원이 적발됐다. 여론 −10`, `성공 확률 ${Math.round(chance * 100)}%에서 실패했다`);
        }
      }
      if (card === "defend") { me.morale += 5; me.supply += 5; }
      if (card === "diplomacy") {
        me.opinion += 15; me.morale += 3;
        const chance = 0.35 + me.opinion / 200;
        if (s.rand() < chance) {
          const sup = supportersOf(s, side).sort((a, b) => s.interv[a].level - s.interv[b].level);
          if (sup.length) raise(s, sup[0], 1, `${nm}의 외교 공세`);
          else Object.keys(s.interv).forEach((k) => { if (s.interv[k].side === "mediate") raise(s, k, 1, `${nm}의 외교 공세`); });
        } else log(s, "info", `${nm}의 외교 공세가 개입을 끌어내지 못했다`, `여론 ${Math.round(me.opinion)}에서 성공 확률 ${Math.round(chance * 100)}%`);
      }
      if (card === "interdict") {
        const sea = s.cards[side] === "interdict" ? navyPower(s, side) : 0;
        const ok = sea > navyPower(s, foe);
        s.sides[foe].supply -= ok ? 15 : 7;
        log(s, "harass", `${nm}의 보급선 차단으로 ${fn} 보급 −${ok ? 15 : 7}`, ok ? "해군력이 앞서 해상 보급로를 끊었다" : "해군력이 밀려 일부만 끊었다");
      }
      if (card === "ceasefire") resolveCeasefireOffer(s, side);
      if (card === "nukeThreat") {
        s.flags.threatened[side] = true;
        s.sides[foe].morale -= G.RULES.nuke.threatMorale;
        me.opinion -= G.RULES.nuke.threatOpinion;
        raiseSupporters(s, foe, `${nm}의 핵 위협`);
        log(s, "nuke", `${nm}이(가) 핵 위협을 했다. ${fn} 사기 −${G.RULES.nuke.threatMorale}`, "사용 없는 압박이지만 국제 여론이 크게 나빠졌다");
        if (s.sides[foe].morale < 45 && foe === "E") s.pending = { kind: "aiOffer", why: "핵 위협에 상대 사기가 무너져 정전을 제안해 왔다" };
      }
      if (card === "nukeUse") {
        const j = judgeNuke(s, side);
        j.side = side;
        nukeJudge = j;
        s.flags.nukeLocked[side] = true;
        if (j.result === "intercept") {
          me.morale -= 25; me.opinion -= 40;
          raiseSupporters(s, foe, `${nm}의 핵 사용 시도`);
          log(s, "nuke", `${nm}의 핵 발사가 요격·차단됐다. 사기 −25, 여론 −40`, `요격 확률 ${Math.round(j.intercept * 100)}%가 작동했다`);
          addTimeline(s, "핵 사용 시도", "발사 불발", "요격·차단 성공");
        } else if (j.result === "mediate") {
          endGame(s, "mediation", "draw", "핵 사용 직전 외교 중재로 정전 협상이 열렸다");
          addTimeline(s, "핵 사용 시도", "외교 중재", "중립국·동맹 압박이 철회를 이끌었다");
        } else {
          endGame(s, side === "P" ? "nuke" : "nukeEnemy", "none", `${nm}의 핵 사용으로 전쟁은 끝났지만 국제 고립이 시작됐다`);
          addTimeline(s, "핵 사용 시도", "발사 성공", "개입과 외교가 모두 막지 못했다");
        }
      }
      clampSide(me); clampSide(s.sides[foe]);
    });
    if (s.over) return { nukeJudge };

    // 공세 만들기
    ["P", "E"].forEach((side) => {
      const card = G.RULES.cards[s.cards[side]];
      if (!card || !card.offensive) return;
      let tgt = s.targets[side];
      const list = availableTargets(s, side).filter((t) => !t.blocked);
      let t = list.find((x) => x.to === tgt);
      if (!t && side === "E" && list.length) t = list[0];
      if (!t) {
        if (side === "P" && tgt) log(s, "info", "목표로 가는 길이 막혀 공세를 펼치지 못했다", "상대가 제해권을 쥐고 있다");
        return;
      }
      s.regions[t.to].gstart = s.regions[t.to].garrison;
      s.offensives.push({ side, from: t.from, to: t.to, route: t.route, sea: t.sea, mult: t.mult, done: false, result: null });
    });
    return { nukeJudge };
  }

  /* ---------- 시간 진행: 1시간 ---------- */
  function attackPower(s, o) {
    const R = G.RULES, side = o.side, foe = other(side), me = s.sides[side], C = G.COUNTRIES[me.id];
    const cardId = s.cards[side], card = R.cards[cardId], foeCard = s.cards[foe];
    // 상륙은 수송 능력의 한계로 투입 병력 상한이 있다
    const base = o.route === "land" ? me.forces : Math.min(me.forces, R.combat.amphibCap);
    let a = base * card.commit * card.atk;
    const cm = (R.counters[cardId] || {})[foeCard] || 1;
    a *= cm;
    a *= (cardId === "air" || cardId === "drone") && o.route !== "land" ? Math.max(o.mult, 0.75) : o.mult;
    if (o.route === "land") a *= C.landBonus || 1;
    if (cardId === "drone") a *= s.weather.air;
    if (cardId === "air") a *= (1 + airPower(s, side) / 200) * s.weather.air;
    if (cardId === "flank") a *= s.weather.flank;
    if (o.route !== "land") a *= s.weather.sea;
    const civ = s.cond[side].civil;
    if (civ === "protect") a *= 0.92;
    if (civ === "unlimited") a *= 1.12;
    if (s.turn === 1) a *= s.flags.firstTurnAtk[side];
    a *= 0.6 + me.morale / 250;
    a *= 0.5 + me.supply / 200;
    if (o.route !== "land" && s.interv.NATO.side === foe && s.interv.NATO.level >= 3) a *= 0.85;
    return { value: a, counter: cm };
  }
  function airPower(s, side) {
    let a = G.COUNTRIES[s.sides[side].id].air;
    if (s.interv.US.side === side && s.interv.US.level >= 2) a += 20;
    return a;
  }
  function defensePower(s, o) {
    const R = G.RULES, foe = other(o.side), def = s.sides[foe], M = regionMap(), m = M[o.to], C = G.COUNTRIES[def.id];
    const reg = s.regions[o.to], dcard = s.cards[foe];
    let d = reg.garrison + def.forces * (dcard === "defend" ? R.combat.defendCommit : R.combat.defenderCommit);
    if (m.capital) d *= R.combat.capitalDef; else if (m.core) d *= R.combat.coreDef;
    if (m.fort) d *= R.combat.fortDef;
    if (dcard === "defend") d *= 1.4;
    if (o.route === "land") d *= C.landBonus || 1;
    if (o.route !== "land" && C.straitDefense) d *= C.straitDefense;
    if (foe === (s.attacker === "P" ? "E" : "P")) { // 방어 입장 쪽
      const dm = s.cond[foe].method;
      if (dm === "fortify" && s.turn < s.flags.fortifyUntil) d *= 1.15;
      if (dm === "talks" && s.turn === 1) d *= 0.9;
      if (dm === "counter" && s.turn === 1 && foe === "E") d *= 1.1;
    }
    if (s.interv.US.side === foe && s.interv.US.level >= 3) d *= 1.15;
    d *= 0.6 + def.morale / 250;
    d *= 0.5 + def.supply / 200;
    return d;
  }

  function tickHour(s) {
    if (s.over) return [];
    const R = G.RULES, ev = [];
    s.hour += 1;
    s.offensives.forEach((o) => {
      if (o.done || s.over) return;
      const foe = other(o.side), reg = s.regions[o.to];
      if (reg.owner !== s.sides[foe].id) { o.done = true; return; }
      const A = attackPower(s, o).value, D = defensePower(s, o);
      const ratio = A / (A + D);
      const jitter = 0.85 + s.rand() * 0.3;
      const gl = Math.min(R.combat.garrisonLossK * A * ratio * jitter, Math.max(0, reg.garrison) + 0.01);
      const al = R.combat.attackerLossK * D * (1 - ratio) * jitter;
      reg.garrison -= gl;
      s.sides[foe].forces -= gl * 0.25;
      s.sides[o.side].forces -= al;
      o.ratio = ratio; o.lastAtkLoss = al; o.lastDefLoss = gl * 1.25;
      s.loss = s.loss || { P: 0, E: 0 };
      s.loss[o.side] += al; s.loss[foe] += gl * 1.25;
      if (reg.garrison <= 0) {
        o.done = true; o.result = "captured";
        const why = captureReason(s, o);
        capture(s, o.side, o.to, why);
        ev.push({ kind: "capture", side: o.side, to: o.to });
      }
      clampSide(s.sides.P); clampSide(s.sides.E);
    });
    checkEnd(s);
    return ev;
  }

  function captureReason(s, o) {
    const R = G.RULES, side = o.side, foe = other(side);
    const key = s.cards[side] + ">" + s.cards[foe];
    if (R.counterReason[key]) return R.counterReason[key];
    if (o.route !== "land") return "제해권을 잡아 상륙에 성공했다";
    if (s.turn === 1 && s.flags.firstTurnAtk[side] > 1) return "개전 초 기습 효과가 컸다";
    if (s.sides[foe].supply < 35) return "상대 보급이 바닥나 수비가 무너졌다";
    return `${R.cards[s.cards[side]].name}로 병력 우위를 살렸다`;
  }

  function capture(s, side, id, why) {
    const R = G.RULES, M = regionMap(), me = s.sides[side], foe = s.sides[other(side)];
    const reg = s.regions[id], m = M[id];
    const wasOrigFoe = reg.orig === foe.id, wasMine = reg.orig === me.id;
    reg.owner = me.id;
    const g = Math.min(me.forces * 0.15, 30);
    me.forces -= g * 0.5;
    reg.garrison = Math.max(8, g); reg.gmax = G.COUNTRIES[me.id].garrison; reg.flash = 1;
    me.morale += R.turn.moraleCapture;
    foe.morale -= m.capital ? R.turn.moraleCapital : R.turn.moraleLose;
    if (wasOrigFoe) { me.captured += 1; foe.lost += 1; }
    if (wasMine) { me.lost = Math.max(0, me.lost - 1); foe.captured = Math.max(0, foe.captured - 1); }
    const nm = G.COUNTRIES[me.id].name;
    log(s, "capture", `${nm}, ${m.name} 점령${m.capital ? " (수도)" : ""}`, why);
    const cn = G.RULES.cards[s.cards[side]] ? G.RULES.cards[s.cards[side]].name : "개전";
    addTimeline(s, side === "P" ? cn : `상대 ${cn}`, `${nm} ${m.name} 점령`, why);
    if (m.capital && wasOrigFoe) raiseSupporters(s, other(side), `${G.COUNTRIES[foe.id].name} 수도 함락`);
    else if (m.core && wasOrigFoe && s.rand() < 0.5) raiseSupporters(s, other(side), `${G.COUNTRIES[foe.id].name} 핵심 거점 상실`);
    clampSide(me); clampSide(foe);
  }

  /* ---------- 턴 끝 ---------- */
  function endTurn(s) {
    if (s.over) return;
    const R = G.RULES, C = G.COUNTRIES;
    ["P", "E"].forEach((side) => {
      const me = s.sides[side], foe = other(side), c = C[me.id], fc = s.cond[foe], mc = s.cond[side];
      let sup = -R.turn.supplyDecay;
      const why = [];
      if (R.cards[s.cards[side]] && R.cards[s.cards[side]].offensive) sup -= R.turn.offensiveSupply;
      sup += me.economy * R.turn.economyRecovery;
      if (fc.sea === "partial") { sup -= 4; me.economy -= 1; }
      if (fc.sea === "full") { sup -= c.seaSupplyLong ? 10 : 8; me.economy -= 2; }
      if (fc.sanction === "impose") sup -= c.sanctionedStart ? 1.5 : 3;
      if (c.sanctionedStart) sup -= 3;
      if (s.turn > R.turn.longWarAfter) sup -= R.turn.longWarDecay;
      // 점령지 저항
      const occupied = Object.keys(s.regions).filter((id) => s.regions[id].owner === me.id && s.regions[id].orig === s.sides[foe].id).length;
      if (mc.civil === "unlimited") sup -= occupied * R.turn.resistancePerRegion;
      if (mc.civil === "protect") sup -= occupied * 0.5;
      else if (mc.civil === "limited") sup -= occupied * 1;
      // 개입 효과
      let reinf = me.reinfMult;
      const I = s.interv;
      if (I.US.side === side) { if (I.US.level >= 1) sup += 5; if (I.US.level >= 2) reinf *= 1.4; }
      if (I.NATO.side === side) { if (I.NATO.level >= 2) sup += 6 * natoFactor(s); }
      if (I.NATO.side === foe && I.NATO.level >= 1) { me.morale -= 3 * natoFactor(s); sup -= 3 * natoFactor(s); }
      if (I.RU.side === side) { if (I.RU.level >= 1) sup += 5; if (I.RU.level >= 2) reinf *= 1.25; }
      if (I.CNX.side === side) { if (I.CNX.level >= 1) sup += 6; if (I.CNX.level >= 2) reinf *= 1.3; }
      Object.keys(I).forEach((k) => { if (I[k].side === "mediate") sup -= 2 * I[k].level; });
      me.supply += sup;
      // 증원
      const add = c.reinf * (me.economy / 75) * reinf * (0.5 + me.supply / 100);
      me.forces = Math.min(me.forces + add, me.forces0 * 1.3);
      if (me.supply < 30) me.morale -= 4;
      if (me.opinion < -40) me.morale -= 2;
      clampSide(me);
    });
    // 수비대 회복
    Object.keys(s.regions).forEach((id) => {
      const r = s.regions[id];
      if (r.owner === "N") return;
      r.garrison = Math.min(r.gmax, r.garrison + r.gmax * 0.1);
      r.flash = 0;
    });
    // 중재 정전 제안
    Object.keys(s.interv).forEach((k) => {
      const it = s.interv[k];
      if (it.side === "mediate" && it.level >= 2 && s.turn >= 4 && !s.pending && s.rand() < 0.4)
        s.pending = { kind: "aiOffer", why: `${R.interventions[k].name}의 중재로 정전 협상안이 나왔다` };
    });
    // AI 정전 제안
    if (!s.pending && s.turn >= 3 && s.turn - s.flags.lastAiOffer >= 3 && advantage(s, "E") < -25) {
      s.pending = { kind: "aiOffer", why: "전세가 기운 상대가 정전을 제안해 왔다" };
    }
    if (s.pending) s.flags.lastAiOffer = s.turn;
    // 턴 요약 타임라인
    const pc = R.cards[s.cards.P];
    if (pc && !s.turnLog.some((l) => l.kind === "capture")) {
      const ec = R.cards[s.cards.E];
      addTimeline(s, pc.name, "전선 변화 없음", `상대는 ${ec ? ec.name : "대기"}를 택했다`);
    }
    rollWeather(s);
    s.flags.lastP = s.cards.P;
    s.lastCards = { P: s.cards.P, E: s.cards.E };
    s.cards.P = null; s.cards.E = null; s.targets.P = null; s.targets.E = null;
    checkEnd(s);
    if (!s.over && s.turn >= R.end.safetyTurns) endGame(s, "mediation", "draw", "장기전에 국제 사회가 중재에 나서 전선이 동결됐다");
  }

  function advantage(s, side) {
    const sc = (x) => {
      const m = s.sides[x];
      return (m.forces / m.forces0) * 40 + m.supply * 0.3 + m.morale * 0.3 + (m.captured - m.lost) * 8;
    };
    return sc(side) - sc(other(side));
  }

  function resolveCeasefireOffer(s, side) {
    const foe = other(side);
    const adv = advantage(s, foe);
    const accept = adv < -5 || (adv < 8 && s.rand() < 0.3);
    if (side === "P") {
      if (accept) {
        const res = territoryOutcome(s);
        endGame(s, "ceasefire", res.winner, `정전 제안이 받아들여졌다. ${res.label}`);
        addTimeline(s, "정전 제안", "정전 성립", "상대가 불리하다고 판단했다");
      } else {
        s.sides.P.morale -= 5;
        log(s, "info", "정전 제안이 거절됐다. 사기 −5", "상대는 아직 이길 수 있다고 본다");
        addTimeline(s, "정전 제안", "거절", "상대 전력이 아직 우세했다");
      }
    }
  }

  function territoryOutcome(s) {
    const net = s.sides.P.captured - s.sides.P.lost;
    if (net > 0) return { winner: "P", label: "점령지를 지킨 유리한 정전이다" };
    if (net < 0) return { winner: "E", label: "영토를 잃은 불리한 정전이다" };
    return { winner: "draw", label: "현상 유지 정전이다" };
  }

  function acceptAiOffer(s, yes) {
    const why = s.pending ? s.pending.why : "";
    s.pending = null;
    if (yes) {
      const res = territoryOutcome(s);
      endGame(s, "ceasefire", res.winner, `${why}. ${res.label}`);
      addTimeline(s, "정전안 수락", "정전 성립", why);
    } else {
      s.sides.E.morale -= 5;
      log(s, "info", "정전안을 거절했다. 상대 사기 −5", why);
      addTimeline(s, "정전안 거절", "전쟁 계속", why);
    }
  }

  /* ---------- 종료 판정 ---------- */
  function checkEnd(s) {
    if (s.over) return;
    const M = regionMap(), R = G.RULES;
    for (const side of ["P", "E"]) {
      const me = s.sides[side], foe = s.sides[other(side)];
      const foeOrig = Object.keys(s.regions).filter((id) => s.regions[id].orig === foe.id);
      if (foeOrig.length && foeOrig.every((id) => s.regions[id].owner === me.id)) {
        return endGame(s, "conquest", side, `${G.COUNTRIES[foe.id].name}의 모든 구역을 점령했다`);
      }
      const keyIds = foeOrig.filter((id) => M[id].capital || M[id].core);
      if (keyIds.length && keyIds.every((id) => s.regions[id].owner === me.id)) {
        return endGame(s, "core", side, `${G.COUNTRIES[foe.id].name}의 수도와 핵심 거점을 모두 점령했다`);
      }
    }
    for (const side of ["P", "E"]) {
      const m = s.sides[side];
      const bad = [m.forces < m.forces0 * R.end.forcesFloor, m.supply < R.end.supplyFloor, m.morale < R.end.moraleFloor];
      if (bad.filter(Boolean).length >= 2) {
        const words = [];
        if (bad[0]) words.push("병력"); if (bad[1]) words.push("보급"); if (bad[2]) words.push("사기");
        return endGame(s, "exhaust", other(side), `${G.COUNTRIES[m.id].name}의 ${words.join("·")} 수치가 한계 아래로 떨어져 정전이 성립했다`);
      }
    }
  }

  function endGame(s, type, winner, reason) {
    if (s.over) return;
    s.over = { type, winner, reason, turn: s.turn, hour: s.hour };
    s.offensives.forEach((o) => (o.done = true));
  }

  /* ---------- 기록 ---------- */
  function log(s, kind, text, why) { s.turnLog.push({ kind, text, why: why || "" }); }
  function addTimeline(s, choice, result, reason) { s.timeline.push({ turn: s.turn, choice, result, reason }); }
  function clampSide(m) {
    m.supply = clamp(m.supply, 0, 100); m.morale = clamp(m.morale, 0, 100);
    m.economy = clamp(m.economy, 0, 100); m.opinion = clamp(m.opinion, -100, 100);
    m.forces = Math.max(0, m.forces);
  }

  function resultLabel(over, s) {
    const T = { conquest: "완전 점령", core: "핵심 거점 점령", exhaust: "", ceasefire: "정전", mediation: "중재 정전", nuke: "핵 사용 엔딩", nukeEnemy: "핵 사용 엔딩" };
    let t = T[over.type];
    if (over.type === "exhaust") {
      const defenderWon = (over.winner === "P" && s.attacker === "E") || (over.winner === "E" && s.attacker === "P");
      t = defenderWon ? (over.winner === "P" ? "방어 성공" : "상대의 방어 성공") : (over.winner === "P" ? "상대 전쟁 수행 능력 붕괴" : "전쟁 수행 능력 붕괴");
    }
    const head = over.winner === "P" ? "승리" : over.winner === "E" ? "패배" : over.winner === "draw" ? "무승부" : "모두의 패배";
    return { head, type: t };
  }

  G.Engine = {
    newGame, startTurn, tickHour, endTurn, aiChoose, setPlayerChoice, availableTargets, nukeStatus,
    acceptAiOffer, advantage, resultLabel, regionMap, other, pct,
  };
})(typeof window !== "undefined" ? window : globalThis);
