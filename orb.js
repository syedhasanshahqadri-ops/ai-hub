/* AI HUB orb — a small canvas-based 3D particle sphere.
   No libraries. Follows the pointer, speeds up on click, pauses when hidden. */
(function () {
  var N = 380;
  var pts = [];
  for (var i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }

  var canvas, ctx, raf = 0, motion = true, visible = true, last = 0;
  var ay = 0, ax = 0.35, px = 0, py = 0, tx = 0, ty = 0, kick = 0, busy = 0, busyTarget = 0;
  var rgb = [120, 240, 215];

  function readColor() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(v);
    if (m) { var n = parseInt(m[1], 16); rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 220, h = canvas.clientHeight || 220;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  }

  function ring(cx, cy, R, tilt, spin, alpha, dpr) {
    ctx.beginPath();
    for (var a = 0; a <= 64; a++) {
      var t = (a / 64) * Math.PI * 2;
      var x = Math.cos(t), z = Math.sin(t), yy = 0;
      var y1 = yy * Math.cos(tilt) - z * Math.sin(tilt), z1 = yy * Math.sin(tilt) + z * Math.cos(tilt);
      var x2 = x * Math.cos(spin) + z1 * Math.sin(spin), z2 = -x * Math.sin(spin) + z1 * Math.cos(spin);
      var s = 1.6 / (1.6 - z2 * 0.6);
      var X = cx + x2 * R * 1.12 * s, Y = cy + (y1 * Math.cos(ax) - z2 * Math.sin(ax)) * R * 1.12 * s;
      if (a === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }

  function draw(dt) {
    resize();
    var dpr = canvas.width / (canvas.clientWidth || 220);
    var W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34;
    ctx.clearRect(0, 0, W, H);

    px += (tx - px) * 0.06; py += (ty - py) * 0.06;
    busy += (busyTarget - busy) * 0.05;
    kick *= 0.96;
    ay += dt * (0.22 + busy * 1.2 + kick * 2.2);
    ax = 0.32 + py * 0.35;
    var yaw = ay + px * 0.6;

    var g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.45);
    var ga = 0.2 + busy * 0.12 + kick * 0.1;
    g.addColorStop(0, "rgba(" + rgb.join(",") + "," + ga + ")");
    g.addColorStop(1, "rgba(" + rgb.join(",") + ",0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ring(cx, cy, R, 0.5, yaw * 0.7, 0.22, dpr);
    ring(cx, cy, R, -0.9, -yaw * 0.5, 0.16, dpr);

    var cy_ = Math.cos(yaw), sy = Math.sin(yaw), cx_ = Math.cos(ax), sx = Math.sin(ax);
    var breathe = 1 + Math.sin(last * 0.0016) * 0.015 + busy * 0.03;
    for (var i = 0; i < N; i++) {
      var p = pts[i];
      var x1 = p[0] * cy_ + p[2] * sy, z1 = -p[0] * sy + p[2] * cy_;
      var y2 = p[1] * cx_ - z1 * sx, z2 = p[1] * sx + z1 * cx_;
      var s = 1.6 / (1.6 - z2 * 0.6), d = (z2 + 1) / 2;
      var X = cx + x1 * R * s * breathe, Y = cy + y2 * R * s * breathe;
      ctx.globalAlpha = 0.12 + 0.88 * d * d;
      ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
      ctx.beginPath();
      ctx.arc(X, Y, (0.6 + 1.7 * d) * dpr * s * 0.9, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* core sparkle — echoes the brand mark */
    var k = R * 0.2 * (1 + busy * 0.25);
    ctx.fillStyle = document.documentElement.dataset.theme === "light" ? "rgb(" + rgb.join(",") + ")" : "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.moveTo(cx, cy - k); ctx.quadraticCurveTo(cx, cy, cx + k, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + k); ctx.quadraticCurveTo(cx, cy, cx - k, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy - k); ctx.fill();
  }

  function loop(now) {
    raf = 0;
    if (!motion || !visible || document.hidden) return;
    var dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    draw(dt);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && motion && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } }

  window.AIHubOrb = {
    init: function (el) {
      canvas = el; ctx = canvas.getContext("2d"); if (!ctx) return;
      readColor(); draw(0);
      window.addEventListener("pointermove", function (e) {
        var r = canvas.getBoundingClientRect();
        tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      }, { passive: true });
      canvas.addEventListener("click", function () { kick = 1; });
      document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); }).observe(canvas);
      }
      start();
    },
    setMotion: function (on) { motion = !!on; if (ctx) { readColor(); if (on) start(); else draw(0); } },
    setBusy: function (b) { busyTarget = b ? 1 : 0; },
    refreshColor: function () { if (!ctx) return; readColor(); if (!motion) draw(0); }
  };
})();
