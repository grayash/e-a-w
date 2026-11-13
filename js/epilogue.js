/* 에필로그: 종료 후 여파를 도트 4컷으로 보여준다.
   장면의 모든 변수는 플레이어가 고른 조건과 전황 결과에서 나온다. 참혹한 장면은 그리지 않는다.
*/
(function () {
  "use strict";
  const W = 160, H = 100; // 저해상도 도트 화면

  function build(s, mapView) {
    const C = window.COUNTRIES, R = window.RULES;
    const P = s.sides.P, E = s.sides.E, o = s.over;
    const cp = s.cond.P, ce = s.cond.E;
    const nuke = o.type === "nuke" || o.type === "nukeEnemy";
    const lab = window.Engine.resultLabel(o, s);
    const occupiedByP = P.captured, lostByP = P.lost;

    // 2컷 도시: 내가 이겼고 점령지가 있으면 점령지 도시, 아니면 내 나라 도시
    const civilPolicy = (occupiedByP > 0 && o.winner === "P") ? cp.civil : ce.civil;
    let lit = { protect: 0.85, limited: 0.6, unlimited: 0.3 }[civilPolicy] || 0.6;
    if (nuke) lit = 0.1;
    const refugees = civilPolicy === "unlimited" || lostByP >= 2 || nuke;
    const cityWhose = occupiedByP > 0 && o.winner === "P" ? L("점령지 도시") : L("{0}의 도시", C[P.id].name);
    const cityWhy = (occupiedByP > 0 && o.winner === "P" ? L("내가 고른 ") : L("상대가 고른 ")) + L("민간 피해 정책: ") +
      (R.attackConditions[1].options.find((x) => x.id === civilPolicy) || {}).label;

    // 3컷 항구: 해상로 차단·제재·경제
    const worstSea = cp.sea === "full" || ce.sea === "full" ? "full" : cp.sea === "partial" || ce.sea === "partial" ? "partial" : "none";
    let ships = { none: 5, partial: 3, full: 1 }[worstSea];
    if (cp.sanction === "impose" || ce.sanction === "impose") ships = Math.max(0, ships - 1);
    if (P.economy < 40) ships = Math.max(0, ships - 1);
    if (nuke) ships = 0;
    const seaLine = nuke ? L("핵 사용 이후 항로가 모두 멈췄다") : R.epilogue.sea[worstSea];
    const seaWhy = L("해상로: 나 {0} · 상대 {1}, 경제 {2}", optLabel(2, cp.sea), optLabel(2, ce.sea), Math.round(P.economy));

    // 4컷 국제 반응
    const I = s.interv;
    const flags = ["US", "NATO", "RU", "CNX"].filter((k) => I[k].side).map((k) => ({
      key: k, name: R.interventions[k].name, level: I[k].level,
      side: I[k].side, color: I[k].side === "mediate" ? "#cbd5e1" : C[s.sides[I[k].side].id].color,
    }));
    const intlLine = nuke ? L("국제 사회가 등을 돌렸다. 깃발이 반쯤 내려갔다")
      : P.opinion >= 0 ? L("국제 여론은 대체로 우호적으로 남았다")
      : P.opinion > -40 ? L("국제 여론이 차가워졌다") : L("국제 여론이 크게 등을 돌렸다");
    const intlWhy = L("국제 여론 {0}, ", Math.round(P.opinion)) + flags.map((f) => L("{0} {1}단계", f.name, f.level)).join(" · ");

    const cuts = [
      { key: "map", title: L("1 지도"), line: `${lab.head}: ${lab.type || L("전쟁 종료")}`,
        why: L("{0} 점령 {1}구역 · 상실 {2}구역 · {3}", C[P.id].name, occupiedByP, lostByP, o.reason) },
      { key: "city", title: "2 " + cityWhose, line: nuke ? L("도시의 불빛이 거의 꺼졌다") : R.epilogue.civil[civilPolicy], why: cityWhy, lit, refugees },
      { key: "port", title: L("3 항구"), line: seaLine, why: seaWhy, ships },
      { key: "intl", title: L("4 국제 반응"), line: intlLine, why: intlWhy, flags, nuke },
    ];
    return { cuts, mapView };
  }
  function optLabel(i, id) { const o = window.RULES.attackConditions[i].options.find((x) => x.id === id); return o ? o.label : "-"; }

  /* 장면 그리기 (저해상도 → 확대) */
  function drawCut(ctx, cut, frame, mapImg) {
    ctx.imageSmoothingEnabled = false;
    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    if (cut.key === "map") {
      px(0, 0, W, H, "#0a2238");
      if (mapImg) {
        // 천천히 물러나는 줌아웃 느낌: 프레임마다 1px씩 여백
        const m = frame % 3;
        ctx.drawImage(mapImg.src, mapImg.sx, mapImg.sy, mapImg.sw, mapImg.sh, 4 + m, 4 + m, W - 8 - 2 * m, H - 8 - 2 * m);
      }
      return;
    }
    if (cut.key === "city") {
      px(0, 0, W, H, "#0b1020");
      for (let i = 0; i < 18; i++) px((i * 37) % W, (i * 13) % 40, 1, 1, frame % 2 && i % 3 === 0 ? "#555" : "#9aa");
      px(0, 82, W, 18, "#151a26");
      const bs = [[6, 34], [26, 48], [44, 26], [60, 56], [82, 38], [100, 50], [120, 30], [138, 44]];
      let seed = 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      bs.forEach(([x, h]) => {
        px(x, 82 - h, 16, h, "#262d3d");
        for (let wy = 82 - h + 4; wy < 78; wy += 6) for (let wx = x + 3; wx < x + 14; wx += 5) {
          const on = rnd() < cut.lit;
          const flick = on && rnd() < 0.08 && frame % 2;
          px(wx, wy, 3, 3, on && !flick ? "#ffd34d" : "#1a1f2b");
        }
      });
      if (cut.refugees) for (let i = 0; i < 9; i++) {
        const x = (i * 14 + frame * 2) % W;
        px(W - x, 88, 2, 4, "#b8c0cc"); px(W - x, 86, 2, 2, "#d9c3a5");
      }
      return;
    }
    if (cut.key === "port") {
      px(0, 0, W, H, "#1b2a44");
      px(0, 0, W, 30, "#22365a");
      px(0, 60, W, 40, "#0e2a45");
      for (let i = 0; i < 20; i++) px((i * 23 + frame * 3) % W, 66 + (i * 7) % 30, 4, 1, "#24507a");
      px(0, 52, 60, 8, "#4a5568"); // 부두
      px(10, 20, 3, 32, "#ffd34d"); px(10, 20, 22, 3, "#ffd34d"); px(30, 23, 1, 14, "#cbd5e1"); // 크레인
      px(36, 30, 3, 22, "#ffd34d"); px(36, 30, 18, 3, "#ffd34d");
      for (let i = 0; i < cut.ships; i++) {
        const x = 70 + i * 17, y = 58 + (i % 2) * 10 + ((frame + i) % 2);
        px(x, y, 14, 4, "#94a3b8"); px(x + 3, y - 4, 6, 4, "#e5534b"); px(x + 2, y + 4, 10, 1, "#0a1a2c");
      }
      if (cut.ships === 0) { px(66, 64, 30, 1, "#2c4d70"); }
      return;
    }
    if (cut.key === "intl") {
      px(0, 0, W, H, cut.nuke ? "#120c0c" : "#16233d");
      px(0, 84, W, 16, cut.nuke ? "#1f1414" : "#1d2a3f");
      const n = Math.max(1, cut.flags.length), gap = W / (n + 1);
      cut.flags.forEach((f, i) => {
        const x = Math.round(gap * (i + 1)) - 10;
        px(x, 22, 2, 62, "#94a3b8");
        const top = cut.nuke ? 50 : 24;
        const wave = frame % 2;
        for (let k = 0; k < 18; k += 3) px(x + 2 + k, top + ((k / 3 + wave) % 2), 3, 12, f.color);
        for (let l = 0; l < f.level; l++) px(x + 4 + l * 5, top + 16, 3, 3, "#ffd34d"); // 개입 단계 점
      });
      return;
    }
  }

  function mapSource(mapView, s) {
    // 작은 나라 쪽과 주인이 바뀐 구역에 맞춘다 (큰 나라 전체를 잡으면 전장이 너무 작게 보임)
    const own = (cid) => Object.keys(s.regions).filter((id) => s.regions[id].orig === cid);
    const a = own(s.sides.P.id), b = own(s.sides.E.id);
    const small = a.length <= b.length ? a : b;
    const changed = Object.keys(s.regions).filter((id) => s.regions[id].owner !== s.regions[id].orig);
    mapView.fitRegions(small.concat(changed), 18);
    const K = mapView.base.width / mapView.D.cols, v = mapView.view;
    return { src: mapView.base, sx: v.x * K, sy: v.y * K, sw: v.w * K, sh: v.h * K };
  }

  function Epilogue(canvas) {
    this.c = canvas; this.low = document.createElement("canvas"); this.low.width = W; this.low.height = H;
    this.frame = 0; this.idx = 0; this.timer = 0;
  }
  Epilogue.prototype.start = function (s, mapView, onCut) {
    this.data = build(s, mapView);
    this.mapImg = mapSource(mapView, s);
    this.idx = 0; this.onCut = onCut; this.frame = 0; this.acc = 0;
    this.show(0);
  };
  Epilogue.prototype.show = function (i) { this.idx = i; this.onCut && this.onCut(this.data.cuts[i], i, this.data.cuts.length); this.render(); };
  Epilogue.prototype.tick = function (dt) {
    this.acc += dt;
    if (this.acc > 420) { this.acc = 0; this.frame++; this.render(); }
  };
  Epilogue.prototype.render = function () {
    const ctx = this.low.getContext("2d");
    drawCut(ctx, this.data.cuts[this.idx], this.frame, this.mapImg);
    const w = this.c.clientWidth || 360, dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(w * dpr * H / W);
    this.c.style.height = Math.round(w * H / W) + "px";
    const g = this.c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(this.low, 0, 0, this.c.width, this.c.height);
    const cut = this.data.cuts[this.idx];
    if (cut.key === "intl") { // 깃발 이름은 고해상도 글자로
      g.font = `700 ${Math.round(12 * dpr)}px system-ui, sans-serif`; g.textAlign = "center"; g.fillStyle = "#e5e7eb";
      const n = Math.max(1, cut.flags.length), gap = W / (n + 1), sc = this.c.width / W;
      cut.flags.forEach((f, i) => g.fillText(f.name, (Math.round(gap * (i + 1)) - 9) * sc, 96 * sc));
    }
  };
  window.Epilogue = Epilogue;
})();
