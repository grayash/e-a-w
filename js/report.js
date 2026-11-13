/* 전황 보고 생성기: 게임 상태를 읽어 시각이 찍힌 보고 문장을 만든다.
   공격 방식(카드)·경로(육로/상륙)·단계(진척)·방어 측 대응·전투 비율·기상·시각(주야)에 따라 문장이 달라진다.
   보고 문장은 연출용이며 게임 결과에는 영향을 주지 않는다. 참혹한 묘사는 하지 않는다. */
(function () {
  "use strict";
  const PL = window.PLACES, C = window.COUNTRIES, R = window.RULES;
  const M = () => window.Engine.regionMap();

  /* 한국어 조사: {D:은} → "북한군은" */
  function hasBatchim(w) {
    const ch = String(w).trim().slice(-1), code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
    return /[0-9lmnr]$/i.test(ch) && !/[2459]$/.test(ch);
  }
  function rieul(w) { const code = String(w).slice(-1).charCodeAt(0); return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8; }
  function josa(w, t) {
    if (window.LANG && window.LANG !== "ko") return w;
    const b = hasBatchim(w);
    if (t === "은") return w + (b ? "은" : "는");
    if (t === "이") return w + (b ? "이" : "가");
    if (t === "을") return w + (b ? "을" : "를");
    if (t === "과") return w + (b ? "과" : "와");
    if (t === "로") return w + (b && !rieul(w) ? "으로" : "로");
    return w;
  }
  window.josa = josa;

  function army(cid) { return PL.army[cid] || C[cid].name; }
  function info(id) { return PL.region[id] || { towns: [M()[id].name], terrain: M()[id].name, coast: M()[id].name }; }
  const rnd = (n) => Math.floor(Math.random() * n);
  function town(id, i) { const t = info(id).towns; return t[i % t.length]; }
  function seaName(o) { if (!o.sea) return ""; const m = M(); return o.sea.split(">").map((x) => m[x].name).join("·"); }

  /* 공격 문장: 카드별 단계(0 준비·1 접전·2 근접·3 돌파)마다 여러 변형 */
  const ATTACK = {
    frontal: [
      [L("{A:은} {F}에서 {T} 방면으로 대규모 포병 준비사격을 시작했다. 자주포와 다연장로켓이 {TER} 전방 진지를 두드린다."),
       L("{A} 포병 관측 드론이 {T} 일대 진지 좌표를 연이어 전송하고 있다. 준비사격이 이어진다."),
       L("{A} 전차 부대가 {F} 집결지를 떠나 {T} 방면 공격 개시선으로 이동했다.")],
      [L("{A} 기갑·기계화 부대가 {T} 외곽 방어선으로 정면 진입했다. 공병이 지뢰 지대에 통로를 열고 있다."),
       L("{A} 전차 중대가 {T} 진입로의 교량을 확보하려다 대전차 미사일 공격을 받고 엄폐했다."),
       L("{TER}에서 {A} 보병이 연막을 치고 {D} 1선 참호로 돌격했다."),
       L("{A} 공병이 대전차 장애물을 폭파해 {T} 쪽 도로를 다시 열었다.")],
      [L("{T} 외곽에서 보병 근접 전투가 이어진다. {D:은} 건물마다 대전차 화기를 두고 버틴다."),
       L("{A:은} {T} 시가지 입구의 교차로를 두고 {D:과} 한 블록씩 주고받고 있다."),
       L("{A} 전투공병이 {T} 외곽 방어 거점의 콘크리트 진지를 하나씩 제거하고 있다.")],
      [L("{A} 후속 제대가 돌파구로 몰려든다. {T} 안쪽 도로망을 따라 전진 중."),
       L("{D} 방어선에 틈이 생겼다. {A} 기갑 예비대가 {T2} 방향으로 전과를 넓힌다."),
       L("{T} 중심부 통신탑이 {A} 통제 아래 들어갔다는 보고.")],
    ],
    flank: [
      [L("{A} 특수작전부대가 야음을 틈타 {TER:을} 넘어 {T} 후방으로 침투했다."),
       L("{A} 헬기 강습 부대가 {T2} 외곽 고지에 내려앉았다."),
       L("{A} 정찰대가 {D} 방어선 사이의 빈틈을 찾아 기동로를 표시했다.")],
      [L("{A} 기동부대가 주 방어선을 피해 {T} 측면으로 우회하고 있다. 목표는 {T2} 방향 보급로."),
       L("{A} 경장갑 부대가 {TER}의 산길을 따라 {T2} 쪽으로 빠르게 움직인다."),
       L("{A} 특수부대가 {T2} 인근 교량과 철도 분기점을 장악했다.")],
      [L("{T}–{T2} 간 보급로가 {A} 우회 부대에 끊겼다. {D} 전방 부대가 고립될 위기다."),
       L("{D} 후방 보급 차량 행렬이 {A} 매복에 막혀 되돌아갔다."),
       L("{D} 전방 지휘소와 후방 사이 통신이 끊겼다는 감청 보고.")],
      [L("포위망이 좁혀진다. {D} 일부 부대가 {T2} 쪽으로 철수를 시작했다."),
       L("{A} 우회 부대와 정면 부대가 {T} 동쪽에서 만났다. 포위가 완성되어 간다.")],
    ],
    air: [
      [L("{A} 전투기 편대가 {T} 상공 제공권 확보에 나섰다. 후방에서 조기경보기가 공중전을 지휘한다."),
       L("{A} 공중급유기가 전방 공역으로 올라왔다. 장시간 공중 작전 준비."),
       L("{A} 정찰기가 {T} 일대 방공 레이더 위치를 수집하고 있다.")],
      [L("방공망 제압 작전: 전자전기와 대레이더 미사일이 {D} 지대공 레이더를 노린다."),
       L("{D} 방공 레이더 여러 곳이 전파 방해로 꺼졌다. {A} 공격 편대가 저고도로 진입한다."),
       L("{T} 상공에서 {A:과} {D} 전투기의 공중전이 벌어졌다.")],
      [L("정밀유도폭탄이 {T} 일대 지휘소와 탄약고를 타격했다."),
       L("{A} 공격기가 {T2} 철도 조차장과 연료 저장소를 연이어 폭격했다."),
       L("{A} 무인기가 {TER}의 {D} 포병 진지를 찾아 유도탄으로 무력화했다.")],
      [L("근접항공지원 아래 {A} 지상군이 {T:로} 전진한다."),
       L("{D} 방공망이 무너지면서 {A} 지상군이 {T2:을} 향해 낮에도 움직이기 시작했다.")],
    ],
    interdict: [
      [L("{A} 잠수함과 초계함이 {SEA}에서 {D} 수송 선단을 추적하고 있다."),
       L("{A} 해상초계기가 {SEA} 상공에서 {D} 선박 움직임을 감시한다.")],
      [L("{SEA} 항로에 기뢰가 부설됐다는 첩보. 상선들이 항로를 바꾸고 있다."),
       L("{A} 구축함이 {SEA}에서 {D} 보급선 두 척의 항로를 막았다.")],
      [L("{D} 연료 수송선이 {SEA}에서 되돌아갔다. 전방 연료 사정이 나빠진다."),
       L("{A} 대함미사일 부대가 {CO} 앞바다를 사정권에 넣었다.")],
      [L("{A} 소규모 상륙 부대가 {T} 해안 레이더 기지를 기습했다."),
       L("{D} 항만 하역이 사실상 멈췄다는 위성사진 분석.")],
    ],
  };
  ATTACK.drone = [
    [L("{A} 정찰 드론 수십 대가 {T} 상공을 선회하며 표적을 찾고 있다."), L("{A} 드론 운용팀이 {F} 후방에서 자폭 드론을 연이어 띄웠다.")],
    [L("{A} 자폭 드론 떼가 {TER}의 {D} 포병 진지로 날아들었다."), L("{D} 방공포가 저공 드론을 쫓느라 사격을 쉬지 못하고 있다."), L("{A} 드론이 {T} 외곽 장갑차 대기 지점을 정밀 타격했다.")],
    [L("{A} 배회형 탄약이 {T} 시가지 입구 진지를 차례로 무력화하고 있다."), L("{D} 전파 교란 장비가 일부 드론을 떨어뜨렸지만 공격 파도가 계속된다.")],
    [L("{D} 방어 진지 상당수가 드론 공격으로 비었다. {A} 지상군이 {T:로} 들어간다."), L("{A} 드론 영상에 {D} 부대가 {T2} 쪽으로 물러나는 모습이 잡혔다.")],
  ];
  const HARASS = {
    cyber: [L("{D} 철도 관제 시스템이 악성코드로 멈췄다. 보급 열차가 역마다 대기 중."), L("{D} 군 통신망 일부가 접속 장애를 겪고 있다. 예비 무선망으로 전환."),
            L("{D} 항만 물류 전산이 마비돼 하역 작업이 중단됐다."), L("{D} 전력망 관제 센터에 침입 흔적. {T} 일대가 순환 정전에 들어갔다.")],
    spy: [L("공작원이 {T} 일대 통신 케이블을 절단했다는 보고."), L("허위 항복 권고 문자가 {D} 병사들의 휴대폰에 퍼지고 있다."),
          L("{T2} 연료 저장소에서 원인 불명의 화재. 사보타주가 의심된다."), L("{D} 지휘부 내부에 지휘관 교체설이 돌고 있다는 감청 보고.")],
    interdict: [L("{A} 초계함이 {SEA}에서 {D} 선박을 검문하고 있다."), L("{SEA}의 민간 해운사들이 보험료 급등으로 운항을 멈췄다.")],
  };
  const INTERDICT_LAND = [
    [L("{A} 장거리 포병이 {T2} 방면 {D} 후방 보급로를 사정권에 넣었다."), L("{A} 무인기가 {D} 보급 차량 행렬을 추적하고 있다.")],
    [L("{A} 포병이 {T2}–{T} 간 도로의 교량을 집중 포격했다."), L("{A} 공격 헬기가 {D} 연료 수송 차량을 노렸다.")],
    [L("{D} 전방 부대의 탄약 재보급이 늦어지고 있다는 감청 보고."), L("{T2} 철도역이 마비돼 {D} 증원 열차가 멈췄다.")],
    [L("{A} 소규모 부대가 {T} 후방 보급 거점을 습격했다."), L("{D} 전방 진지가 보급 부족으로 사격을 아끼고 있다.")],
  ];
  const AMPHIB = [
    [L("상륙 준비: {A} 함정이 {CO}에 함포 사격을 퍼붓고, 소해함이 접근로의 기뢰를 걷어내고 있다."),
     L("{A} 상륙함 선단이 {SEA:을} 건너 {CO} 앞바다에 도착했다."),
     L("{A} 수중 폭파팀이 {CO} 해안의 장애물을 제거하고 있다.")],
    [L("{A} 상륙정 제1파가 {CO:로} 접근한다. {D} 해안포와 대함미사일이 응전한다."),
     L("{D} 해안 방어 부대가 상륙 해안에 포격을 집중하고 있다. {A} 제1파 일부가 바다로 물러났다."),
     L("{A} 공기부양정이 {CO}의 모래톱을 넘어 장갑차를 내려놓았다.")],
    [L("{A} 해병대가 {CO} 해안선에 상륙해 교두보 확보를 시도한다."),
     L("교두보 확보: {A} 해병대가 해안 도로와 첫 번째 언덕을 장악했다."),
     L("{A} 헬기가 해안 뒤편 {T2}에 병력을 내려 교두보를 넓히고 있다.")],
    [L("교두보가 넓어진다. {A} 증원 병력이 {T} 방면으로 내륙 진격을 시작했다."),
     L("{A} 수송함이 전차와 보급품을 해안에 하역하고 있다. {T} 외곽까지 전선이 밀렸다.")],
  ];
  const DEFENSE = {
    defend: [L("{D:은} 참호와 지뢰 지대를 앞세우고 예비대를 투입했다."), L("{D} 포병이 대포병 사격으로 공격 측 포대를 찾아 반격한다."),
             L("{D} 방공부대가 저고도 접근로를 막고 있다."), L("{D} 예비 연대가 {T2}에서 2선 진지로 들어갔다."), L("{D} 공병이 {T} 진입로 교량을 폭파해 진격을 늦췄다.")],
    frontal: [L("{D:도} 맞불 공세로 일부 부대를 전방에 밀어 넣었다."), L("{D} 기갑 예비대가 {T2} 쪽에서 역습을 시도한다."), L("{D} 포병이 공격 측 집결지를 향해 사격을 퍼붓는다.")],
    flank: [L("{D} 경보병이 측면 고지에서 매복전을 펼친다."), L("{D} 기동 예비대가 우회로를 따라 공격 측 측면을 노린다.")],
    air: [L("{D} 전투기가 요격에 나서 공중전이 벌어졌다."), L("{D} 지대공 미사일이 공격 편대를 견제한다."), L("{D} 무인기가 공격 측 포병 위치를 찾고 있다.")],
    interdict: [L("{D} 함정이 연안을 순찰하며 상륙로를 감시한다."), L("{D} 초계기가 해상에서 공격 측 보급선을 쫓고 있다.")],
    diplomacy: [L("{D:은} 외교에 집중하느라 전방 증원이 늦다."), L("{D} 정부 대변인이 국제 사회에 중재를 요청했다.")],
    ceasefire: [L("{D:은} 정전 협상 신호를 보내며 방어선만 유지하고 있다.")],
    nukeThreat: [L("{D} 지휘부의 핵 위협 성명 뒤, 전방은 긴장 속에 진지를 지키고 있다.")],
    nukeUse: [L("{D} 지휘부가 혼란에 빠졌다.")],
  };

  function fill(t, v) {
    return t.replace(/\{(\w+)(?::(\S))?\}/g, (_, k, j) => {
      const w = v[k] != null ? v[k] : "";
      if (j === "도") return window.LANG && window.LANG !== "ko" ? w : w + "도";
      return j ? josa(w, j) : w;
    });
  }
  function vars(s, o) {
    const atk = s.sides[o.side].id, def = s.sides[o.side === "P" ? "E" : "P"].id;
    const ti = info(o.to), n = info(o.to).towns.length, i = rnd(n);
    return { A: army(atk), D: army(def), F: town(o.from, rnd(2)), T: town(o.to, i), T2: town(o.to, i + 1 + rnd(Math.max(1, n - 1))),
      TER: ti.terrain, CO: ti.coast, SEA: seaName(o) || nearSea(o.to) };
  }
  function nearSea(id) { const m = M(), a = m[id].adj.find((x) => m[x].type === "sea"); return a ? m[a].name : L("인근 해역"); }
  function phaseOf(s, o) {
    const reg = s.regions[o.to], start = Math.max(1, reg.gstart || reg.gmax);
    const p = Math.max(0, Math.min(1, 1 - reg.garrison / start));
    const h = o.hours || 0;
    return { p, idx: h <= 1 ? 0 : p < 0.35 ? 1 : p < 0.7 ? 2 : 3 };
  }
  function night(min) { const h = Math.floor(min / 60) % 24; return h >= 20 || h < 5; }
  // 같은 문장이 연달아 나오지 않게 고른다
  function choose(list, o) {
    o._used = o._used || [];
    const fresh = list.filter((x) => o._used.indexOf(x) < 0);
    const t = (fresh.length ? fresh : list)[rnd((fresh.length ? fresh : list).length)];
    o._used.push(t); if (o._used.length > 6) o._used.shift();
    return t;
  }

  /* 한 시간 단위 보고: 공세마다 1개 */
  function hour(s, min) {
    const out = [];
    s.offensives.forEach((o) => {
      if (o.done) return;
      o.hours = (o.hours || 0) + 1;
      const v = vars(s, o), ph = phaseOf(s, o), card = s.cards[o.side];
      const set = card === "interdict" ? (o.route === "land" ? INTERDICT_LAND : ATTACK.interdict) : o.route !== "land" ? AMPHIB : (ATTACK[card] || ATTACK.frontal);
      let text = fill(choose(set[ph.idx], o), v);
      if (night(min) && card !== "flank") text = L("[야간] ") + text;
      const reg = s.regions[o.to], ratio = o.ratio || 0.5;
      const drop = (o._lastG != null) ? o._lastG - reg.garrison : 0; o._lastG = reg.garrison;
      const trend = drop > 4 ? L("방어선이 크게 흔들린다") : ratio > 0.6 ? L("방어선이 밀리고 있다") : ratio < 0.42 ? L("공세가 둔화되고 공격 측 손실이 커진다") : L("치열한 공방이 이어진다");
      const cat = card === "interdict" ? "harass" : "atk";
      out.push({ t: min, side: o.side, cat, tag: o.side === "P" ? L("아군 공세") : L("적 공세"), text,
        sub: L("{0} · {1} · 수비 {2} 남음 · 진척 {3}%", M()[o.to].name, trend, Math.max(0, Math.round(reg.garrison)), Math.round(ph.p * 100)),
        dmg: damage(s, o, card, v) });
    });
    return out;
  }

  /* 피해 문장: 실제 계산된 손실량을 규모와 장비로 풀어 쓴다 */
  function scale(x) { return x < 0.6 ? L("경미한") : x < 1.5 ? L("소대급") : x < 3 ? L("중대급") : x < 6 ? L("대대급") : L("연대급"); }
  function damage(s, o, card, v) {
    const a = o.lastAtkLoss || 0, d = o.lastDefLoss || 0;
    const sea = o.route !== "land";
    const atkEq = card === "drone" ? L("드론") : sea && card !== "air" ? L("상륙정·장갑차") : ({ frontal: L("전차·장갑차"), flank: L("경장갑 차량·헬기"), air: L("전투기·공격기"), interdict: L("함정·초계기") }[card] || L("장비"));
    const defEq = sea ? L("해안 방어 진지·대함 포대") : s.cards[o.side === "P" ? "E" : "P"] === "defend" ? L("참호 진지·포대") : L("방어 진지·차량");
    const part = (x, eq, k, unit) => {
      if (x < 0.15) return L("피해 거의 없음");
      const cnt = Math.round(x * k);
      return L("{0} 병력 손실{1}", scale(x), cnt >= 1 ? L(", {0} {1} 안팎", eq, L(unit, cnt)) : "");
    };
    const atkTxt = card === "drone" ? L("드론 약 {0}대 손실", Math.round(a * 9) + 2) : part(a, atkEq, 2, "{0}대");
    return L("피해 · {0} 전력 −{1} ({2}) / {3} 전력 −{4} ({5})", v.A, a.toFixed(1), atkTxt, v.D, d.toFixed(1), part(d, defEq, 1.5, "{0}곳"));
  }

  /* 30분 단위 보고: 방어 측 대응과 견제 활동 */
  function half(s, min) {
    const out = [];
    s.offensives.forEach((o) => {
      if (o.done || Math.random() < 0.3) return;
      const defSide = o.side === "P" ? "E" : "P";
      const list = DEFENSE[s.cards[defSide]] || DEFENSE.frontal;
      out.push({ t: min, side: defSide, cat: "def", tag: defSide === "P" ? L("아군 방어") : L("적 방어"), text: fill(choose(list, o), vars(s, o)) });
    });
    ["P", "E"].forEach((side) => {
      const card = s.cards[side];
      if ((card !== "cyber" && card !== "spy") || Math.random() < 0.5) return;
      const foe = side === "P" ? "E" : "P";
      const M2 = M(), ids = Object.keys(s.regions).filter((id) => s.regions[id].owner === s.sides[foe].id);
      const to = ids[Math.floor(Math.random() * ids.length)];
      const fake = { side, from: to, to, route: "land", sea: null };
      s._harass = s._harass || {};
      out.push({ t: min, side, cat: "harass", tag: (side === "P" ? L("아군 ") : L("적 ")) + (card === "cyber" ? L("사이버") : L("공작")), text: fill(choose(HARASS[card], s._harass[side] = s._harass[side] || {}), vars(s, fake)) });
    });
    if (!s.offensives.some((o) => !o.done) && Math.random() < 0.4) {
      const quiet = [L("전선 소강. 양측이 진지를 보강하며 정찰 드론을 띄우고 있다."), L("포성이 잦아들었다. 보급 차량 행렬이 야간 이동을 준비한다."),
        L("전방 관측소: 적 진지에서 큰 움직임은 없다."), L("공병대가 무너진 도로와 교량을 복구하고 있다.")];
      out.push({ t: min, tag: L("전선"), text: quiet[rnd(quiet.length)] });
    }
    return out;
  }

  function fromLog(s, min, from) {
    return s.turnLog.slice(from).map((l) => {
      const tag = l.kind === "capture" ? L("속보") : l.kind === "interv" ? L("국제") : l.kind === "nuke" ? L("긴급") : l.kind === "harass" ? L("견제") : l.kind === "supply" ? L("보급") : L("상황");
      const cat = l.kind === "capture" || l.kind === "nuke" ? "news" : l.kind === "interv" ? "intl" : l.kind === "harass" || l.kind === "supply" ? "harass" : null;
      return { t: min, tag, cat, text: l.text, sub: l.why ? L("이유 · ") + l.why : "", strong: l.kind === "capture" || l.kind === "nuke" };
    });
  }

  function turnStart(s, min) {
    const out = [], w = s.weather;
    out.push({ t: min, tag: L("기상"), text: L("향후 12시간 {0}.", w.name), sub: w.note });
    const pc = R.cards[s.cards.P], ec = R.cards[s.cards.E];
    const mine = s.offensives.find((o) => o.side === "P"), theirs = s.offensives.find((o) => o.side === "E");
    const kindOf = (c) => (c && c.kind) || (c && c.offensive ? "atk" : c && (c === R.cards.defend) ? "def" : null);
    out.push({ t: min, tag: L("작전 명령"), side: "P", cat: kindOf(pc), text: L("아군 {0}{1}", pc ? pc.name : "-", mine ? L(" 개시. 목표 {0}.", M()[mine.to].name) : ".") });
    out.push({ t: min, tag: L("정보"), side: "E", cat: kindOf(ec), text: theirs ? L("정찰 보고: 적은 {0}{1} {2} 노린다.", ec.name, hasBatchim(ec.name) ? "으로" : "로", josa(M()[theirs.to].name, "을")) : L("정찰 보고: 적은 {0} 택한 것으로 보인다.", ec ? josa(ec.name, "을") : "-") });
    if (s.cards.P === "defend") out.push({ t: min, tag: L("아군 방어"), side: "P", cat: "def", text: L("전 전선에 방어 태세 발령. 예비대를 후방 거점에 배치하고 진지를 보강한다.") });
    if (s.cards.P === "diplomacy") out.push({ t: min, tag: L("외교"), side: "P", text: L("외교부가 동맹국·중립국 대사들과 연쇄 회담에 들어갔다.") });
    return out;
  }

  function status(s, min, prev) {
    const out = [], P = s.sides.P;
    if (prev && prev.supply >= 40 && P.supply < 40) out.push({ t: min, tag: L("보급 경고"), text: L("아군 보급이 {0}까지 떨어졌다. 탄약·연료 배급을 줄인다.", Math.round(P.supply)), sub: L("방어 태세로 보급을 회복할 수 있다") });
    if (prev && prev.morale >= 35 && P.morale < 35) out.push({ t: min, tag: L("사기 경고"), text: L("아군 사기 {0}. 전방 부대의 피로가 쌓이고 있다.", Math.round(P.morale)) });
    return out;
  }

  window.Report = { hour, half, fromLog, turnStart, status, josa };
})();
