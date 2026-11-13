/* 도트 지도 렌더러: 구역 색, 경계, 점령 표시, 병력 화살표, 터치 이동·확대 */
(function () {
  "use strict";
  const K = 6; // 기본 이미지의 셀당 픽셀
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
    this.state = null; this.highlight = null; this.t = 0;
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
    v.w = Math.max(26, Math.min(D.cols, v.w));
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
    return { fill: involved ? C.color : shade(C.color, 0.55), occupied: owner !== orig, origColor: window.COUNTRIES[orig].color, dim: !involved };
  };

  /* 기본 이미지 다시 그리기 (소유가 바뀔 때만) */
  MapView.prototype.redrawBase = function () {
    const g = this.base.getContext("2d"), D = this.D;
    g.fillStyle = SEA_DEEP; g.fillRect(0, 0, this.base.width, this.base.height);
    const cache = {};
    const isSea = (r, c) => { const id = this.cellReg[r] && this.cellReg[r][c]; return !id || this.reg[id].type === "sea"; };
    for (let r = 0; r < D.rows; r++) for (let c = 0; c < D.cols; c++) {
      const id = this.cellReg[r][c];
      if (!id) continue;
      const reg = this.reg[id];
      const col = cache[id] || (cache[id] = this.colorOf(id));
      const h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
      if (reg.type === "sea") {
        // 해안 가까운 바다는 얕은 물빛
        let near = false;
        for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if (!isSea(r + dr, c + dc)) { near = true; break; }
        g.fillStyle = near ? "#12406a" : col.fill; g.fillRect(c * K, r * K, K, K);
        if (col.tint) { g.globalAlpha = 0.07; g.fillStyle = col.tint; g.fillRect(c * K, r * K, K, K); g.globalAlpha = 1; }
        if (h % 23 === 0) { g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(c * K + 1, r * K + 2, 3, 1); }
        continue;
      }
      g.fillStyle = col.fill; g.fillRect(c * K, r * K, K, K);
      // 땅 질감: 셀마다 밝고 어두운 픽셀 한두 개
      g.fillStyle = "rgba(0,0,0,0.10)"; g.fillRect(c * K + (h % 5), r * K + ((h >> 3) % 5), 1, 1);
      if (h % 3 === 0) { g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(c * K + ((h >> 5) % 5), r * K + ((h >> 7) % 5), 1, 1); }
      // 산지: 작은 산 모양 픽셀
      if (D.terrain && D.terrain[r][c] === "m") {
        g.fillStyle = "rgba(0,0,0,0.26)";
        g.fillRect(c * K + 2, r * K + 1, 1, 1); g.fillRect(c * K + 1, r * K + 2, 3, 1); g.fillRect(c * K, r * K + 3, 5, 1);
        g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(c * K + 2, r * K + 1, 1, 1);
      }
      if (col.occupied && (r + c) % 2 === 0) { g.fillStyle = col.origColor; g.fillRect(c * K + 2, r * K + 2, 2, 2); }
      // 해안선 하이라이트
      g.fillStyle = "rgba(255,255,255,0.22)";
      if (isSea(r - 1, c)) g.fillRect(c * K, r * K, K, 1);
      if (isSea(r, c - 1)) g.fillRect(c * K, r * K, 1, K);
      g.fillStyle = "rgba(0,0,0,0.35)";
      if (isSea(r + 1, c)) g.fillRect(c * K, r * K + K - 1, K, 1);
      if (isSea(r, c + 1)) g.fillRect(c * K + K - 1, r * K, 1, K);
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
        if (ra.type === "sea" && rb.type === "sea") { g.fillStyle = "rgba(255,255,255,0.08)"; }
        else if (ra.type === "sea" || rb.type === "sea") { g.fillStyle = "rgba(0,0,0,0.55)"; }
        else {
          const oa = this.state ? this.state.regions[a] && this.state.regions[a].owner : ra.owner;
          const ob = this.state ? this.state.regions[b] && this.state.regions[b].owner : rb.owner;
          g.fillStyle = oa === ob ? "rgba(0,0,0,0.28)" : "#0b0f18";
        }
        if (dc) g.fillRect(cc * K - 1, r * K, 1, K); else g.fillRect(c * K, rr * K - 1, K, 1);
      });
    }
    // 도시 불빛
    const B = D.bounds;
    (window.PLACES ? window.PLACES.cities : []).forEach((ct) => {
      const x = (ct.lon - B.lon[0]) / B.step * K, y = (B.lat[1] - ct.lat) / B.step * K;
      g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(x - 2, y - 2, ct.big ? 5 : 4, ct.big ? 5 : 4);
      g.fillStyle = ct.big ? "#fff6c8" : "#f3f4f6"; g.fillRect(x - 1, y - 1, ct.big ? 3 : 2, ct.big ? 3 : 2);
    });
  };

  MapView.prototype.setState = function (s) { this.state = s; this.redrawBase(); };

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
        if (!S.regions[id].flash || !blink) continue;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        this.fillRegion(id, ctx);
      }
    }
    if (this.highlight) { ctx.fillStyle = "rgba(255,211,77,0.35)"; this.fillRegion(this.highlight, ctx); }

    // 화살표
    if (S && S.offensives) S.offensives.forEach((o) => this.drawArrow(o, cell));
    if (this.preview) this.drawArrow(this.preview, cell, true);

    // 확대했을 때 도시 이름
    if (cell >= 5 && window.PLACES) {
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
      const sz = Math.max(5, Math.min(8, cell * 1.4));
      if (r.capital) this.star(ctx, x, y - (S && cell >= 3 && involved ? sz + 4 : 0), sz);
      else if (r.core) { ctx.fillStyle = "#111"; ctx.fillRect(x - sz / 2 - 1, y - sz / 2 - 1 - (S && cell >= 3 && involved ? sz + 4 : 0), sz + 2, sz + 2); ctx.fillStyle = "#ffd34d"; ctx.fillRect(x - sz / 2, y - sz / 2 - (S && cell >= 3 && involved ? sz + 4 : 0), sz, sz); }
      if (S && involved && cell >= 3) {
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
    for (let r = Math.floor(v.y); r < Math.min(this.D.rows, v.y + v.h + 1); r++)
      for (let c = Math.floor(v.x); c < Math.min(this.D.cols, v.x + v.w + 1); c++)
        if (this.cellReg[r][c] === id) ctx.fillRect((c - v.x) * s, (r - v.y) * s, s + 0.5, s + 0.5);
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
    const width = Math.max(3, Math.min(7, cell * 1.3));
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
