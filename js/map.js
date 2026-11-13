/* 도트 지도 렌더러: 구역 색, 경계, 점령 표시, 병력 화살표, 터치 이동·확대 */
(function () {
  "use strict";
  const K = 4; // 기본 이미지의 셀당 픽셀
  const NEUTRAL = "#3a4150", SEA = "#0d2a45", SEA_DEEP = "#0a2238";

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, f) { const [r, g, b] = hexToRgb(h); const m = (v) => Math.round(Math.max(0, Math.min(255, v * f))); return `rgb(${m(r)},${m(g)},${m(b)})`; }

  function MapView(canvas, opt) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.opt = Object.assign({ interactive: true, aspect: 0.75, onTap: null }, opt || {});
    const D = window.MAP_DATA;
    this.D = D;
    this.idOf = {}; D.regions.forEach((r, i) => (this.idOf[D.alpha[i]] = r.id));
    this.reg = {}; D.regions.forEach((r) => (this.reg[r.id] = r));
    this.cellReg = D.grid.map((row) => row.split("").map((ch) => (ch === "." ? null : this.idOf[ch])));
    this.base = document.createElement("canvas");
    this.base.width = D.cols * K; this.base.height = D.rows * K;
    this.view = { x: 0, y: 0, w: D.cols, h: D.cols * this.opt.aspect };
    this.state = null; this.highlight = null; this.t = 0; this.scar = {}; this.fx = []; this.flags = {};
    if (this.opt.interactive) this.bindInput();
    this.resize();
  }

  MapView.prototype.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = this.c.clientWidth || 340;
    const h = Math.round(w * this.opt.aspect);
    this.c.style.height = h + "px";
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    this.clampView();
  };

  MapView.prototype.clampView = function () {
    const D = this.D, v = this.view;
    v.w = Math.max(40, Math.min(D.cols, v.w));
    v.h = v.w * this.opt.aspect;
    if (v.h > D.rows) { v.h = D.rows; v.w = v.h / this.opt.aspect; }
    v.x = Math.max(0, Math.min(D.cols - v.w, v.x));
    v.y = Math.max(0, Math.min(D.rows - v.h, v.y));
  };

  MapView.prototype.fitRegions = function (ids, pad) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let r = 0; r < this.D.rows; r++) for (let c = 0; c < this.D.cols; c++) {
      if (ids.indexOf(this.cellReg[r][c]) >= 0) { x0 = Math.min(x0, c); y0 = Math.min(y0, r); x1 = Math.max(x1, c + 1); y1 = Math.max(y1, r + 1); }
    }
    if (x0 > x1) return;
    pad = pad == null ? 3 : pad;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    let w = x1 - x0, h = y1 - y0;
    if (h / w > this.opt.aspect) w = h / this.opt.aspect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    this.view.w = w; this.view.h = w * this.opt.aspect;
    this.view.x = cx - this.view.w / 2; this.view.y = cy - this.view.h / 2;
    this.clampView();
  };
  MapView.prototype.showAll = function () { this.view = { x: 0, y: 0, w: this.D.cols, h: this.D.cols * this.opt.aspect }; this.clampView(); };
  MapView.prototype.zoom = function (f) {
    const v = this.view, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    v.w /= f; v.h = v.w * this.opt.aspect; v.x = cx - v.w / 2; v.y = cy - v.h / 2; this.clampView();
  };

  /* 색 */
  MapView.prototype.colorOf = function (id) {
    const r = this.reg[id], S = this.state;
    if (r.type === "sea") {
      if (S && S.seas[id] && S.seas[id].ctrl) return { fill: SEA, tint: window.COUNTRIES[S.sides[S.seas[id].ctrl].id].color };
      return { fill: SEA };
    }
    if (r.type === "neutral") return { fill: NEUTRAL };
    const owner = S ? S.regions[id].owner : r.owner, orig = S ? S.regions[id].orig : r.owner;
    const C = window.COUNTRIES[owner];
    const involved = !S || owner === S.sides.P.id || owner === S.sides.E.id;
    return { fill: involved ? C.color : shade(C.color, 0.55), base: C.color, occupied: owner !== orig, origColor: window.COUNTRIES[orig].color, dim: !involved };
  };

  /* 기본 이미지 다시 그리기 (소유가 바뀔 때만) */
  /* 지형 팔레트: 고도 0~9 (평야 → 구릉 → 산 → 바위 → 눈) */
  const TERRAIN = ["#5f8a46", "#6b9450", "#7c9c56", "#909f5c", "#a19a62", "#a08a5e", "#8f7a5c", "#857867", "#9b958c", "#e4e1da"];
  const SEA_D = ["#2a6f9c", "#1f5b85", "#174a6e", "#113a59"];
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t));
  }
  const rgb = (c, f) => `rgb(${Math.max(0, Math.min(255, Math.round(c[0] * f)))},${Math.max(0, Math.min(255, Math.round(c[1] * f)))},${Math.max(0, Math.min(255, Math.round(c[2] * f)))})`;

  MapView.prototype.redrawBase = function () {
    const g = this.base.getContext("2d"), D = this.D;
    g.fillStyle = SEA_DEEP; g.fillRect(0, 0, this.base.width, this.base.height);
    const cache = {};
    const elevAt = (r, c) => { const row = D.elev && D.elev[r]; const ch = row && row[c]; return ch && ch !== "." ? +ch : -1; };
    const isSea = (r, c) => { const id = this.cellReg[r] && this.cellReg[r][c]; return !id || this.reg[id].type === "sea"; };
    for (let r = 0; r < D.rows; r++) for (let c = 0; c < D.cols; c++) {
      const id = this.cellReg[r][c];
      const x = c * K, y = r * K;
      const h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
      if (!id || this.reg[id].type === "sea") {
        // 바다: 해안에서 멀수록 깊은 색, 드문드문 물결 픽셀
        const dch = D.depth && D.depth[r] && D.depth[r][c];
        const d = dch && dch !== "." ? +dch : 3;
        g.fillStyle = SEA_D[d]; g.fillRect(x, y, K, K);
        const col = id && (cache[id] || (cache[id] = this.colorOf(id)));
        if (col && col.tint) { g.globalAlpha = 0.08; g.fillStyle = col.tint; g.fillRect(x, y, K, K); g.globalAlpha = 1; }
        if (h % 29 === 0) { g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(x, y + 1, 3, 1); }
        continue;
      }
      const col = cache[id] || (cache[id] = this.colorOf(id));
      const e = Math.max(0, elevAt(r, c));
      // 지형색 위에 나라 색을 반투명하게 덮는다 (중립·관련 없는 나라는 옅게)
      const tintAmt = this.reg[id].type === "neutral" ? 0.6 : col.dim ? 0.55 : 0.74;
      const tint = this.reg[id].type === "neutral" ? "#5b6170" : col.dim ? col.base : col.fill;
      let base = mix(TERRAIN[e], tint, tintAmt);
      // 언덕 음영: 북서쪽 칸보다 높으면 밝게, 낮으면 어둡게
      const nw = elevAt(r - 1, c - 1);
      const shade = nw < 0 ? 1 : e > nw ? 1.1 : e < nw ? 0.88 : 1;
      g.fillStyle = rgb(base, shade); g.fillRect(x, y, K, K);
      // 땅 질감 픽셀
      g.fillStyle = "rgba(0,0,0,0.10)"; g.fillRect(x + (h % 4), y + ((h >> 3) % 4), 1, 1);
      if (h % 3 === 0) { g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(x + ((h >> 5) % 4), y + ((h >> 7) % 4), 1, 1); }
      // 높은 산: 작은 봉우리와 눈
      if (e >= 6 && h % 4 === 0) {
        g.fillStyle = "rgba(40,30,20,0.35)"; g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x, y + 2, 3, 1);
        g.fillStyle = e >= 8 ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)"; g.fillRect(x + 1, y + 1, 1, 1);
      }
      // 전투 흔적: 싸움이 많았던 구역일수록 그을린 땅이 늘어난다
      const sc = this.scar[id] || 0;
      if (sc && (h >> 4) % 26 < Math.min(6, sc)) {
        g.fillStyle = "rgba(30,22,16,0.55)"; g.fillRect(x, y, K, K);
        if ((h >> 9) % 3 === 0) { g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(x + 1, y + 1, 2, 2); }
      }
      // 강
      if (D.river && D.river[r][c] === "r") { g.fillStyle = "#3f86c0"; g.fillRect(x, y, K, K); g.fillStyle = "#6fb0e0"; g.fillRect(x + 1, y + 1, 2, 2); }
      // 점령지: 원래 나라 색 점무늬
      if (col.occupied && (r + c) % 4 === 0 && r % 2 === 0) { g.fillStyle = col.origColor; g.fillRect(x + 1, y + 1, 2, 2); }
      // 해안선: 모래빛 테두리
      if (isSea(r - 1, c)) { g.fillStyle = "rgba(230,214,160,0.55)"; g.fillRect(x, y, K, 1); }
      if (isSea(r, c - 1)) { g.fillStyle = "rgba(230,214,160,0.55)"; g.fillRect(x, y, 1, K); }
      if (isSea(r + 1, c)) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, y + K - 1, K, 1); }
      if (isSea(r, c + 1)) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x + K - 1, y, 1, K); }
    }
    // 경계선
    for (let r = 0; r < D.rows; r++) for (let c = 0; c < D.cols; c++) {
      const a = this.cellReg[r][c];
      if (!a) continue;
      const ra = this.reg[a];
      const nb = [[1, 0], [0, 1]];
      nb.forEach(([dc, dr]) => {
        const rr = r + dr, cc = c + dc;
        if (rr >= D.rows || cc >= D.cols) return;
        const b = this.cellReg[rr][cc];
        if (!b || b === a) return;
        const rb = this.reg[b];
        if (ra.type === "sea" && rb.type === "sea") { g.fillStyle = "rgba(255,255,255,0.05)"; }
        else if (ra.type === "sea" || rb.type === "sea") { return; }
        else {
          const oa = this.state ? this.state.regions[a] && this.state.regions[a].owner : ra.owner;
          const ob = this.state ? this.state.regions[b] && this.state.regions[b].owner : rb.owner;
          g.fillStyle = oa === ob ? "rgba(0,0,0,0.22)" : "rgba(10,12,20,0.9)";
          if (oa !== ob) { if (dc) g.fillRect(cc * K - 1, r * K, 2, K); else g.fillRect(c * K, rr * K - 1, K, 2); return; }
        }
        if (dc) g.fillRect(cc * K - 1, r * K, 1, K); else g.fillRect(c * K, rr * K - 1, K, 1);
      });
    }
    // 도시 불빛
    const B = D.bounds;
    (window.PLACES ? window.PLACES.cities : []).forEach((ct) => {
      const x = (ct.lon - B.lon[0]) / B.step * K, y = (B.lat[1] - ct.lat) / B.step * K;
      const sz = ct.big ? 4 : 3;
      g.fillStyle = "rgba(255,220,140,0.25)"; g.fillRect(x - sz, y - sz, sz * 2 + 1, sz * 2 + 1);
      g.fillStyle = "rgba(20,16,10,0.7)"; g.fillRect(x - sz + 1, y - sz + 1, sz * 2 - 1, sz * 2 - 1);
      g.fillStyle = ct.big ? "#fff3c4" : "#f1e6c8"; g.fillRect(x - sz + 2, y - sz + 2, sz * 2 - 3, sz * 2 - 3);
      if (ct.big) { g.fillStyle = "#ffffff"; g.fillRect(x, y, 1, 1); }
    });
  };

  MapView.prototype.setState = function (s) {
    if (s !== this.state) { this.fx = []; this.flags = {}; this.snap = null; this.scar = {}; }
    this.state = s; this.redrawBase();
  };

  /* ===== 전황 효과: 도트만 봐도 무슨 일이 일어나는지 ===== */
  MapView.prototype.cellsOf = function (id) {
    if (!this._cells) {
      this._cells = {};
      for (let r = 0; r < this.D.rows; r++) for (let c = 0; c < this.D.cols; c++) {
        const k = this.cellReg[r][c]; if (k) (this._cells[k] || (this._cells[k] = [])).push([c, r]);
      }
    }
    return this._cells[id] || [];
  };
  // 공격 구역과 맞닿은 목표 구역 칸 = 전선
  MapView.prototype.frontCells = function (from, to) {
    const key = from + ">" + to; this._front = this._front || {};
    if (this._front[key]) return this._front[key];
    const out = [], CR = this.cellReg;
    this.cellsOf(to).forEach(([c, r]) => {
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const row = CR[r + dr]; if (row && row[c + dc] === from) { out.push([c, r]); return; }
      }
    });
    if (!out.length) { // 상륙: 목표 구역의 해안 칸
      this.cellsOf(to).forEach(([c, r]) => {
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const id = CR[r + b] && CR[r + b][c + a]; return !id || this.reg[id].type === "sea"; });
        if (n) out.push([c, r]);
      });
    }
    if (!out.length) out.push([this.reg[to].cx, this.reg[to].cy]);
    return (this._front[key] = out);
  };
  MapView.prototype.boom = function (gx, gy, big, delay) { this.fx.push({ k: "boom", x: gx, y: gy, t0: this.t + (delay || 0), big: !!big, life: big ? 900 : 650 }); };
  MapView.prototype.popText = function (gx, gy, txt, col) { this.fx.push({ k: "txt", x: gx, y: gy, t0: this.t, life: 1500, txt, col }); };

  // 매 프레임 상태를 비교해 새로 생긴 일을 효과로 바꾼다
  MapView.prototype.diffState = function () {
    const S = this.state; if (!S || !S.regions) return;
    const now = {};
    for (const id in S.regions) now[id] = { o: S.regions[id].owner, g: S.regions[id].garrison };
    const offs = (S.offensives || []).map((o) => o.lastAtkLoss || 0);
    if (!this.snap) { this.snap = { r: now, offs, offsRef: S.offensives }; return; }
    let scarred = false;
    for (const id in now) {
      const a = this.snap.r[id], b = now[id]; if (!a) continue;
      const R = this.reg[id];
      if (a.o !== b.o) {
        // 점령: 새 주인 색이 퍼져나가고 깃발이 꽂힌다
        const o = (S.offensives || []).find((x) => x.to === id);
        const src = o ? this.reg[o.from] : R;
        this.fx.push({ k: "wave", id, t0: this.t, life: 1800, col: window.COUNTRIES[b.o].color, ox: src.cx, oy: src.cy });
        this.flags[id] = { t0: this.t, owner: b.o };
        for (let i = 0; i < 6; i++) this.boom(R.cx + (Math.random() - 0.5) * 8, R.cy + (Math.random() - 0.5) * 6, i < 2, i * 140);
        this.popText(R.cx, R.cy - 3, "점령!", window.COUNTRIES[b.o].color);
        this.scar[id] = (this.scar[id] || 0) + 2; scarred = true;
      } else if (b.g < a.g - 0.5) {
        const lost = Math.round(a.g - b.g);
        const o = (S.offensives || []).find((x) => x.to === id && !x.done);
        const cells = o ? this.frontCells(o.from, o.to) : this.cellsOf(id);
        const n = Math.min(5, 1 + Math.floor(lost / 3));
        for (let i = 0; i < n; i++) { const p = cells[(Math.random() * cells.length) | 0]; this.boom(p[0] + 0.5, p[1] + 0.5, lost >= 8 && i === 0, i * 120); }
        this.popText(R.cx, R.cy - 2, "-" + lost, "#ff6b5b");
        if (lost >= 3) { this.scar[id] = (this.scar[id] || 0) + 1; scarred = true; }
      }
    }
    // 공격 측 손실은 화살표 중간에
    if (S.offensives === this.snap.offsRef) S.offensives.forEach((o, i) => {
      const l = o.lastAtkLoss || 0;
      if (l && l !== this.snap.offs[i]) {
        const A = this.reg[o.from], B = this.reg[o.to];
        this.popText((A.cx + B.cx) / 2, (A.cy + B.cy) / 2, "-" + Math.round(l), "#ffb347");
      }
    });
    this.snap = { r: now, offs, offsRef: S.offensives };
    if (scarred) this.redrawBase();
  };

  // 픽셀 스프라이트: X=나라색, D=어두운색, W=흰색
  const SPR = {
    tank: ["...XXBBB", ".XXXXX..", "DDDDDDD.", ".D.D.D.."],
    ship: ["....W....", "...XXX...", "XXXXXXXXX", ".DDDDDDD."],
    flag: ["WDDDDD", "WXXXXD", "WXXXXD", "WDDDDD", "W.....", "W.....", "W....."],
    flag2: ["WDDDD.", "WXXXXD", "WXXXXD", "WDDDDD", "W.....", "W.....", "W....."],
  };
  MapView.prototype.sprite = function (ctx, spr, x, y, p, col, flip) {
    const map = { X: col, D: "#1b1f2a", B: "#2a2f3a", W: "#f4f4f4" };
    const w = spr[0].length, h = spr.length;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (spr[j][i] !== ".") ctx.fillRect(x + (flip ? w - 1 - i : i) * p - w * p / 2 + 1, y + j * p - h * p + 1, p, p);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = spr[j][i]; if (ch === ".") continue;
      ctx.fillStyle = map[ch]; ctx.fillRect(x + (flip ? w - 1 - i : i) * p - w * p / 2, y + j * p - h * p, p, p);
    }
  };

  MapView.prototype.drawFx = function (cell) {
    const S = this.state, ctx = this.ctx, t = this.t;
    const p = Math.max(2.2, Math.min(4, cell * 0.8));
    const v = this.view;
    const scr = (gx, gy) => this.toScreen(gx, gy);
    // 진행 중인 전선: 불길이 일렁이고 포탄이 떨어진다
    (S.offensives || []).forEach((o, oi) => {
      if (o.done) return;
      const cells = this.frontCells(o.from, o.to);
      const n = Math.min(cells.length, 22);
      for (let i = 0; i < n; i++) {
        const [c, r] = cells[(i * 7919 + oi * 31) % cells.length];
        const ph = (t / 110 + i * 1.7) % 6;
        const [x, y] = scr(c + 0.5, r + 0.5);
        if (x < -10 || y < -10 || x > this.cssW + 10 || y > this.cssH + 10) continue;
        ctx.fillStyle = ph < 2 ? "#ffd34d" : ph < 4 ? "#ff7a2e" : "#d63a2a";
        ctx.fillRect(x - p / 2, y - p / 2 - (ph % 2) * p * 0.5, p, p);
        ctx.fillStyle = "rgba(60,60,60,0.45)";
        ctx.fillRect(x - p / 2 + ((i % 2) ? p : -p) * 0.5, y - p * (1.5 + (ph % 3) * 0.7), p, p);
      }
      // 시간 흐름에 맞춰 포격
      o._nb = o._nb || 0;
      if (t > (this._boomAt || 0) + 260 && Math.random() < 0.5) {
        const [c, r] = cells[(Math.random() * cells.length) | 0];
        this.boom(c + 0.5, r + 0.5, false);
        this._boomAt = t;
      }
      // 줄다리기 막대: 공격 우세면 공격국 색이 밀고 들어간다
      {
        const T = this.reg[o.to], [tx, ty] = scr(T.cx, T.cy);
        const r = o.ratio || 1, frac = Math.max(0.08, Math.min(0.92, r / (1 + r)));
        const W = 44, H = 6, bx0 = tx - W / 2, by0 = ty - 30;
        const ac = window.COUNTRIES[S.sides[o.side].id].color, dc = window.COUNTRIES[S.regions[o.to].owner].color;
        ctx.fillStyle = "#000"; ctx.fillRect(bx0 - 2, by0 - 2, W + 4, H + 4);
        ctx.fillStyle = dc; ctx.fillRect(bx0, by0, W, H);
        ctx.fillStyle = ac; ctx.fillRect(bx0, by0, Math.round(W * frac), H);
        const sx = bx0 + Math.round(W * frac);
        ctx.fillStyle = (Math.floor(t / 120) % 2) ? "#fff" : "#ffd34d"; ctx.fillRect(sx - 1, by0 - 2, 2, H + 4);
        ctx.font = "700 9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillStyle = "#000"; ctx.fillText(r >= 1.15 ? "공세" : r <= 0.87 ? "저항" : "교착", tx + 1, by0 - 2);
        ctx.fillStyle = r >= 1.15 ? "#ffd34d" : r <= 0.87 ? "#9cc9ff" : "#ddd"; ctx.fillText(r >= 1.15 ? "공세" : r <= 0.87 ? "저항" : "교착", tx, by0 - 3);
      }
      // 화살표를 따라 진군하는 부대
      const A = this.reg[o.from], B = this.reg[o.to];
      let [x1, y1] = scr(A.cx, A.cy); const [x2, y2] = scr(B.cx, B.cy);
      const L0 = Math.hypot(x2 - x1, y2 - y1), MIN = 56;
      if (L0 < MIN) { const ux0 = L0 ? (x2 - x1) / L0 : 0, uy0 = L0 ? (y2 - y1) / L0 : -1; x1 = x2 - ux0 * MIN; y1 = y2 - uy0 * MIN; }
      const dx = x2 - x1, dy = y2 - y1;
      const sea = o.route && o.route !== "land";
      const bend = sea ? 0.25 : 0.08;
      const mx = (x1 + x2) / 2 - dy * bend, my = (y1 + y2) / 2 + dx * bend;
      const col = window.COUNTRIES[S.sides[o.side].id].color;
      const strength = Math.max(2, Math.min(4, Math.round((o.ratio || 1) * 2.5)));
      for (let k = 0; k < strength; k++) {
        const u = 0.4 + ((t / 2200) + k / strength) % 1 * 0.42;
        const bx = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * mx + u * u * x2;
        const by = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * my + u * u * y2 - (sea ? 0 : (Math.floor(t / 150 + k) % 2));
        ctx.globalAlpha = u > 0.74 ? Math.max(0, (0.82 - u) / 0.08) : u < 0.46 ? (u - 0.4) / 0.06 : 1;
        this.sprite(ctx, sea ? SPR.ship : SPR.tank, bx, by + 2, p, col, dx < 0);
        ctx.globalAlpha = 1;
      }
    });
    // 일회성 효과
    this.fx = this.fx.filter((f) => t < f.t0 + f.life);
    this.fx.forEach((f) => {
      const a = (t - f.t0) / f.life; if (a < 0) return;
      if (f.k === "wave") {
        const cells = this.cellsOf(f.id), s = this.cssW / v.w;
        let maxd = 1; cells.forEach(([c, r]) => { maxd = Math.max(maxd, Math.hypot(c - f.ox, r - f.oy)); });
        const front = Math.min(1, a / 0.55) * maxd;
        ctx.fillStyle = f.col;
        cells.forEach(([c, r]) => {
          const d = Math.hypot(c - f.ox, r - f.oy); if (d > front) return;
          const edge = front - d < 1.5 && a < 0.55;
          ctx.globalAlpha = edge ? 0.95 : Math.max(0, 0.6 * (1 - Math.max(0, a - 0.55) / 0.45));
          if (edge) ctx.fillStyle = "#fff6c8"; else ctx.fillStyle = f.col;
          ctx.fillRect((c - v.x) * s, (r - v.y) * s, s + 0.5, s + 0.5);
        });
        ctx.globalAlpha = 1;
      } else if (f.k === "boom") {
        const [x, y] = scr(f.x, f.y);
        const q = p * (f.big ? 1.6 : 1);
        const fr = Math.floor(a * 5);
        const R = [1, 2, 3, 3, 2][fr] || 1;
        const cols = ["#ffffff", "#fff3a0", "#ffb347", "#e0522d", "#555"];
        for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
          if (Math.abs(i) + Math.abs(j) > R + (fr > 1 ? 1 : 0)) continue;
          const ring = Math.abs(i) + Math.abs(j);
          ctx.fillStyle = fr >= 4 ? "rgba(80,80,80,0.6)" : cols[Math.min(4, ring + fr)];
          ctx.fillRect(x + i * q - q / 2, y + j * q - q / 2 - (fr >= 3 ? (a - 0.6) * 18 : 0), q, q);
        }
      } else if (f.k === "txt") {
        const [x, y] = scr(f.x, f.y);
        ctx.font = "800 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.globalAlpha = a > 0.7 ? (1 - a) / 0.3 : 1;
        const yy = y - a * 22;
        ctx.fillStyle = "#000"; ctx.fillText(f.txt, x + 1, yy + 1);
        ctx.fillStyle = f.col; ctx.fillText(f.txt, x, yy);
        ctx.globalAlpha = 1;
      }
    });
    // 점령 깃발: 꽂히는 순간 떨어져 내려와 펄럭인다
    for (const id in this.flags) {
      const F = this.flags[id];
      if (!S.regions[id] || S.regions[id].owner !== F.owner) { delete this.flags[id]; continue; }
      const R = this.reg[id];
      const [x, y] = scr(R.cx, R.cy);
      const drop = Math.max(0, 1 - (t - F.t0) / 400);
      const spr = Math.floor(t / 300) % 2 ? SPR.flag : SPR.flag2;
      this.sprite(ctx, spr, x + 10, y - 8 - drop * 30, p * 1.1, window.COUNTRIES[F.owner].color, false);
    }
  };

  /* 그리기 */
  MapView.prototype.toScreen = function (gx, gy) {
    const v = this.view, s = this.cssW / v.w;
    return [(gx - v.x) * s, (gy - v.y) * s];
  };

  MapView.prototype.draw = function (dt) {
    this.t += dt || 0;
    const ctx = this.ctx, v = this.view, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = SEA_DEEP; ctx.fillRect(0, 0, this.c.width, this.c.height);
    ctx.drawImage(this.base, v.x * K, v.y * K, v.w * K, v.h * K, 0, 0, this.c.width, this.c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = this.state, cell = this.cssW / v.w;

    // 막 점령된 구역 깜빡임
    if (S) {
      const blink = Math.floor(this.t / 250) % 2 === 0;
      for (const id in S.regions) {
        if (!S.regions[id].flash || !blink || this.flags[id]) continue;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        this.fillRegion(id, ctx);
      }
    }
    if (this.highlight) { ctx.fillStyle = "rgba(255,211,77,0.35)"; this.fillRegion(this.highlight, ctx); }
    if (S && !this.opt.static) this.diffState();

    // 화살표
    if (S && S.offensives) S.offensives.forEach((o) => this.drawArrow(o, cell));
    if (this.preview) this.drawArrow(this.preview, cell, true);
    if (S && !this.opt.static) this.drawFx(cell);

    // 확대했을 때 도시 이름
    if (cell >= 2.5 && window.PLACES) {
      const B = this.D.bounds;
      ctx.font = "600 11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      window.PLACES.cities.forEach((ct) => {
        const [x, y] = this.toScreen((ct.lon - B.lon[0]) / B.step, (B.lat[1] - ct.lat) / B.step);
        if (x < 0 || y < 0 || x > this.cssW || y > this.cssH) return;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(ct.n, x + 5, y + 1);
        ctx.fillStyle = "#e5e7eb"; ctx.fillText(ct.n, x + 4, y);
      });
    }
    // 수도·거점 표시와 병력
    for (const id in this.reg) {
      const r = this.reg[id];
      if (r.type !== "land") continue;
      const [x, y] = this.toScreen(r.cx, r.cy);
      if (x < -20 || y < -20 || x > this.cssW + 20 || y > this.cssH + 20) continue;
      const involved = !S || [S.sides.P.id, S.sides.E.id].indexOf(S.regions[id].owner) >= 0 || [S.sides.P.id, S.sides.E.id].indexOf(S.regions[id].orig) >= 0;
      const sz = Math.max(5, Math.min(8, cell * 2.8));
      if (r.capital) this.star(ctx, x, y - (S && cell >= 1.5 && involved ? sz + 4 : 0), sz);
      else if (r.core) { ctx.fillStyle = "#111"; ctx.fillRect(x - sz / 2 - 1, y - sz / 2 - 1 - (S && cell >= 1.5 && involved ? sz + 4 : 0), sz + 2, sz + 2); ctx.fillStyle = "#ffd34d"; ctx.fillRect(x - sz / 2, y - sz / 2 - (S && cell >= 1.5 && involved ? sz + 4 : 0), sz, sz); }
      if (S && involved && cell >= 1.5) {
        const g = Math.max(0, Math.round(S.regions[id].garrison));
        const txt = String(g);
        ctx.font = "700 11px system-ui, sans-serif";
        const w = ctx.measureText(txt).width + 8;
        ctx.fillStyle = "rgba(10,14,22,0.82)"; ctx.fillRect(x - w / 2, y - 1, w, 15);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(txt, x, y + 1);
      }
    }
  };

  MapView.prototype.fillRegion = function (id, ctx) {
    const v = this.view, s = this.cssW / v.w;
    this.cellsOf(id).forEach(([c, r]) => ctx.fillRect((c - v.x) * s, (r - v.y) * s, s + 0.5, s + 0.5));
  };

  MapView.prototype.star = function (ctx, x, y, s) {
    const p = Math.max(1, Math.round(s / 3));
    const pts = [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [-1, 2], [1, 2]];
    ctx.fillStyle = "#111"; pts.forEach(([a, b]) => ctx.fillRect(x + a * p - p / 2 - 1, y + b * p - p / 2 - 1, p + 2, p + 2));
    ctx.fillStyle = "#ffd34d"; pts.forEach(([a, b]) => ctx.fillRect(x + a * p - p / 2, y + b * p - p / 2, p, p));
  };

  MapView.prototype.drawArrow = function (o, cell, preview) {
    const S = this.state, ctx = this.ctx;
    const A = this.reg[o.from], B = this.reg[o.to];
    if (!A || !B) return;
    let [x1, y1] = this.toScreen(A.cx, A.cy);
    const [x2, y2] = this.toScreen(B.cx, B.cy);
    // 구역 중심이 가까우면 화살표가 보이도록 출발점을 뒤로 늘린다
    const L0 = Math.hypot(x2 - x1, y2 - y1), MIN = 56;
    if (L0 < MIN) { const ux0 = L0 ? (x2 - x1) / L0 : 0, uy0 = L0 ? (y2 - y1) / L0 : -1; x1 = x2 - ux0 * MIN; y1 = y2 - uy0 * MIN; }
    const col = preview ? "#ffd34d" : window.COUNTRIES[S.sides[o.side].id].color;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    // 바다 경로는 휘게 그린다
    const bend = o.route && o.route !== "land" ? 0.25 : 0.08;
    const mx = (x1 + x2) / 2 - dy * bend, my = (y1 + y2) / 2 + dx * bend;
    const ux = (x2 - mx), uy = (y2 - my), ul = Math.hypot(ux, uy) || 1;
    const ex = x2 - (ux / ul) * 8, ey = y2 - (uy / ul) * 8;
    const width = Math.max(3, Math.min(7, cell * 2.6));
    ctx.save();
    ctx.lineCap = "butt";
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = width + 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = width;
    ctx.setLineDash([width * 1.6, width * 1.1]);
    ctx.lineDashOffset = -(this.t / 40) % 1000;
    if (o.done && !preview) { ctx.setLineDash([]); ctx.globalAlpha = 0.45; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    // 화살촉
    const ang = Math.atan2(uy, ux), hs = width * 2.4;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    tri(ctx, x2, y2, ang, hs + 3);
    ctx.fillStyle = col; tri(ctx, x2, y2, ang, hs);
    ctx.restore();
    function tri(c, x, y, a, s) {
      c.beginPath(); c.moveTo(x, y);
      c.lineTo(x - Math.cos(a - 0.5) * s, y - Math.sin(a - 0.5) * s);
      c.lineTo(x - Math.cos(a + 0.5) * s, y - Math.sin(a + 0.5) * s);
      c.closePath(); c.fill();
    }
  };

  /* 입력 */
  MapView.prototype.bindInput = function () {
    const c = this.c; let drag = null, moved = false; const pts = new Map(); let pinch = null;
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: this.view.w }; moved = true; }
    });
    c.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const v = this.view, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
        v.w = pinch.w * pinch.d / Math.max(20, d); v.h = v.w * this.opt.aspect; v.x = cx - v.w / 2; v.y = cy - v.h / 2; this.clampView();
        return;
      }
      if (!drag) return;
      const s = this.view.w / this.cssW, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      this.view.x = drag.vx - dx * s; this.view.y = drag.vy - dy * s; this.clampView();
    });
    const up = (e) => {
      const wasTap = pts.size === 1 && !moved;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (wasTap && this.opt.onTap) {
        const rect = c.getBoundingClientRect();
        const gx = this.view.x + (e.clientX - rect.left) / this.cssW * this.view.w;
        const gy = this.view.y + (e.clientY - rect.top) / this.cssW * this.view.w;
        const row = this.cellReg[Math.floor(gy)];
        const id = row && row[Math.floor(gx)];
        if (id) this.opt.onTap(id);
      }
      if (!pts.size) drag = null;
    };
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
  };

  window.MapView = MapView;
  window.MapColors = { NEUTRAL, SEA, SEA_DEEP, shade };
})();
