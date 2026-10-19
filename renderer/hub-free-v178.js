/* Continuous navigation and smooth exploration. Collision checks sweep a disc. */
(function (root) {
  "use strict";
  const S = root.GRPGHubSpatialV157,
    C = root.GRPGHubCoreV156,
    oldCenter = S.center,
    oldSight = S.lineOfSight,
    oldVision = S.vision,
    oldWalls = S.wallsMarkup;
  const radius = (m) =>
    Math.max(8, Math.min(80, Number(m.playerWidth) || 40)) / 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function wallSegments(m) {
    return (m.walls || []).flatMap((w) =>
      (w.points || []).slice(1).map((b, i) => ({ a: w.points[i], b, w })),
    );
  }
  function corners(o) {
    const w = Number(o.width) || 90,
      h = Number(o.height) || 70,
      cx = (+o.x || 0) + w / 2,
      cy = (+o.y || 0) + h / 2,
      a = ((+o.rotation || 0) * Math.PI) / 180;
    return [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) => ({
      x: cx + x * Math.cos(a) - y * Math.sin(a),
      y: cy + x * Math.sin(a) + y * Math.cos(a),
    }));
  }
  function open(o, s) {
    return o.type === "door" && s.objectStates?.[o.id] === "open";
  }
  function inside(p, poly) {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i],
        b = poly[j];
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      )
        yes = !yes;
    }
    return yes;
  }
  function canMove(m, s, x, y) {
    const r = radius(m),
      a = { x: s.x, y: s.y },
      b = { x, y };
    if (
      ![x, y, a.x, a.y].every(Number.isFinite) ||
      x < r ||
      y < r ||
      x > m.width - r ||
      y > m.height - r
    )
      return false;
    if (
      wallSegments(m).some(
        ({ a: c, b: d, w }) =>
          w.blockMovement !== false &&
          S.segmentDistance(a, b, c, d) < r + (+w.thickness || 8) / 2 - 0.001,
      )
    )
      return false;
    for (const o of m.objects || []) {
      if (!o.blockMovement || open(o, s)) continue;
      const poly = corners(o);
      if (
        inside(a, poly) ||
        inside(b, poly) ||
        poly.some(
          (p, i) => S.segmentDistance(a, b, p, poly[(i + 1) % 4]) < r - 0.001,
        )
      )
        return false;
    }
    return true;
  }
  function path(m, s, x, y) {
    const r = radius(m),
      goal = { x: clamp(x, r, m.width - r), y: clamp(y, r, m.height - r) },
      start = { x: s.x, y: s.y };
    if (
      Math.hypot(goal.x - start.x, goal.y - start.y) < 0.5 ||
      !canMove(m, { ...s, ...goal }, goal.x, goal.y)
    )
      return [];
    let points;
    if (canMove(m, s, goal.x, goal.y)) points = [start, goal];
    else {
      const nodes = [start, goal],
        add = (p) => {
          if (canMove(m, { ...s, ...p }, p.x, p.y)) nodes.push(p);
        };
      for (const { a, b, w } of wallSegments(m)) {
        if (w.blockMovement === false) continue;
        const padding = r + (+w.thickness || 8) / 2 + 0.05,
          R = padding / Math.cos(Math.PI / 12);
        for (const p of [a, b])
          for (let i = 0; i < 12; i++) {
            const angle = (i * Math.PI) / 6;
            add({ x: p.x + Math.cos(angle) * R, y: p.y + Math.sin(angle) * R });
          }
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        for (const p of [a, b])
          for (const sign of [-1, 1])
            add({
              x: p.x + Math.cos(angle + Math.PI / 2) * padding * sign,
              y: p.y + Math.sin(angle + Math.PI / 2) * padding * sign,
            });
      }
      for (const o of m.objects || []) {
        if (!o.blockMovement || open(o, s)) continue;
        const w = Number(o.width) || 90,
          h = Number(o.height) || 70,
          cx = (+o.x || 0) + w / 2,
          cy = (+o.y || 0) + h / 2,
          angle = ((+o.rotation || 0) * Math.PI) / 180;
        for (const dx of [-w / 2 - r - 0.05, w / 2 + r + 0.05])
          for (const dy of [-h / 2 - r - 0.05, h / 2 + r + 0.05])
            add({
              x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
              y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
            });
      }
      const scores = new Map([[0, 0]]),
        parents = new Map(),
        closed = new Set(),
        front = [{ id: 0, f: Math.hypot(goal.x - start.x, goal.y - start.y) }];
      let found = false;
      while (front.length && closed.size < 3000) {
        front.sort((a, b) => b.f - a.f || b.id - a.id);
        const n = front.pop();
        if (closed.has(n.id)) continue;
        if (n.id === 1) {
          found = true;
          break;
        }
        closed.add(n.id);
        const a = nodes[n.id];
        for (let id = 1; id < nodes.length; id++) {
          if (id === n.id || closed.has(id)) continue;
          const b = nodes[id],
            score = scores.get(n.id) + Math.hypot(b.x - a.x, b.y - a.y);
          if (
            score >= (scores.get(id) ?? Infinity) ||
            !canMove(m, { ...s, ...a }, b.x, b.y)
          )
            continue;
          scores.set(id, score);
          parents.set(id, n.id);
          front.push({ id, f: score + Math.hypot(goal.x - b.x, goal.y - b.y) });
        }
      }
      if (!found) return [];
      points = [];
      for (let id = 1; id !== undefined; id = parents.get(id))
        points.push(nodes[id]);
      points.reverse();
    }
    const simplified = [points[0]];
    let index = 0;
    while (index < points.length - 1) {
      let next = points.length - 1;
      while (
        next > index + 1 &&
        !canMove(m, { ...s, ...points[index] }, points[next].x, points[next].y)
      )
        next--;
      simplified.push(points[next]);
      index = next;
    }
    const out = [];
    for (let i = 1; i < simplified.length; i++) {
      const a = simplified[i - 1],
        b = simplified[i],
        n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 60));
      for (let k = 1; k <= n; k++)
        out.push({
          x: a.x + ((b.x - a.x) * k) / n,
          y: a.y + ((b.y - a.y) * k) / n,
        });
    }
    return out;
  }
  function visibilityPolygon(m, s, p) {
    const r = oldVision(m, p) * S.size(m) * Math.sqrt(3),
      segments = wallSegments(m)
        .filter((e) => e.w.blockSight !== false)
        .map((e) => [e.a, e.b]);
    for (const o of m.objects || [])
      if (
        !open(o, s) &&
        (o.blockSight === true ||
          (o.type === "door" && o.blockSight !== false && o.blockMovement))
      ) {
        const poly = corners(o);
        poly.forEach((a, i) => segments.push([a, poly[(i + 1) % 4]]));
      }
    const angles = Array.from({ length: 128 }, (_, i) => (i * Math.PI) / 64);
    for (const pair of segments)
      for (const a of pair) {
        const t = Math.atan2(a.y - s.y, a.x - s.x);
        angles.push(t - 0.00001, t, t + 0.00001);
      }
    return angles
      .sort((a, b) => a - b)
      .map((angle) => {
        const dx = Math.cos(angle),
          dy = Math.sin(angle);
        let length = r;
        for (const [a, b] of segments) {
          const ex = b.x - a.x,
            ey = b.y - a.y,
            den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const ax = a.x - s.x,
            ay = a.y - s.y,
            t = (ax * ey - ay * ex) / den,
            u = (ax * dy - ay * dx) / den;
          if (t >= 0 && u >= 0 && u <= 1) length = Math.min(length, t);
        }
        return {
          x: clamp(s.x + dx * length, 0, m.width),
          y: clamp(s.y + dy * length, 0, m.height),
        };
      });
  }
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++)
      h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  }
  const resolution = 8;
  function decode(m, old) {
    const w = Math.ceil(m.width / resolution),
      h = Math.ceil(m.height / resolution),
      bits = new Uint8Array(w * h);
    if (old?.version178 === 1 && old.width === w && old.height === h)
      for (const [start, len] of old.runs || [])
        bits.fill(1, Math.max(0, start), Math.min(bits.length, start + len));
    else if (old?.cells)
      for (const key of old.cells) {
        const [q, r] = key.split(",").map(Number),
          p = oldCenter(m, { q, r });
        for (
          let y = Math.max(0, Math.floor((p.y - S.size(m)) / resolution));
          y < Math.min(h, (p.y + S.size(m)) / resolution);
          y++
        )
          for (
            let x = Math.max(0, Math.floor((p.x - S.size(m)) / resolution));
            x < Math.min(w, (p.x + S.size(m)) / resolution);
            x++
          )
            if (
              Math.hypot(x * resolution - p.x, y * resolution - p.y) < S.size(m)
            )
              bits[y * w + x] = 1;
      }
    return { bits, w, h };
  }
  function reveal(m, s, p) {
    if (!m.fogEnabled) return;
    s.exploration ||= {};
    const old = s.exploration[m.id],
      signature = hash(
        JSON.stringify([
          s.x,
          s.y,
          oldVision(m, p),
          s.objectStates,
          m.walls,
          m.objects,
          m.hexSize,
          m.width,
          m.height,
        ]),
      );
    if (old?.last === signature) return;
    const { bits, w, h } = decode(m, old),
      poly = visibilityPolygon(m, s, p),
      r = oldVision(m, p) * S.size(m) * Math.sqrt(3);
    for (
      let y = Math.max(0, Math.floor((s.y - r) / resolution));
      y < Math.min(h, (s.y + r) / resolution);
      y++
    )
      for (
        let x = Math.max(0, Math.floor((s.x - r) / resolution));
        x < Math.min(w, (s.x + r) / resolution);
        x++
      )
        if (
          inside({ x: (x + 0.5) * resolution, y: (y + 0.5) * resolution }, poly)
        )
          bits[y * w + x] = 1;
    const runs = [];
    let start = -1;
    for (let i = 0; i <= bits.length; i++) {
      if (bits[i] && start < 0) start = i;
      if (!bits[i] && start >= 0) {
        runs.push([start, i - start]);
        start = -1;
      }
    }
    s.exploration[m.id] = {
      version178: 1,
      resolution,
      width: w,
      height: h,
      runs,
      last: signature,
    };
  }
  function normalize(m, s, p) {
    const r = radius(m);
    s.x = clamp(s.x, r, m.width - r);
    s.y = clamp(s.y, r, m.height - r);
    reveal(m, s, p);
    return s;
  }
  function step(m, s, p, dest) {
    if (
      Math.hypot(dest.x - s.x, dest.y - s.y) > 60.01 ||
      !canMove(m, s, dest.x, dest.y)
    )
      throw Error("Путь изменился: участок недоступен.");
    s.x = dest.x;
    s.y = dest.y;
    reveal(m, s, p);
  }
  function sightTo(m, s, o, at) {
    return oldSight(
      { ...m, objects: (m.objects || []).filter((v) => v.id !== o.id) },
      s,
      s,
      at,
    );
  }
  function inSight(m, s, p, o) {
    if (!m.fogEnabled) return true;
    const at = {
      x: (+o.x || 0) + (+o.width || 48) / 2,
      y: (+o.y || 0) + (+o.height || 48) / 2,
    };
    return (
      Math.hypot(at.x - s.x, at.y - s.y) <=
        oldVision(m, p) * S.size(m) * Math.sqrt(3) && sightTo(m, s, o, at)
    );
  }
  function interactionReason(m, s, p, o) {
    if (!m || !o || !inSight(m, s, p, o)) return "Объект скрыт туманом войны";
    const at = {
      x: (+o.x || 0) + (+o.width || 48) / 2,
      y: (+o.y || 0) + (+o.height || 48) / 2,
    };
    if (!sightTo(m, s, o, at)) return "Между персонажем и объектом препятствие";
    return Math.hypot(at.x - s.x, at.y - s.y) > S.size(m) * Math.sqrt(3) * 2
      ? "Подойдите ближе для взаимодействия"
      : "";
  }
  const masks178 = new WeakMap();
  function drawFog(canvas, m, s, p, preview = false) {
    if (!canvas) return;
    canvas.width = m.width;
    canvas.height = m.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, m.width, m.height);
    if (!m.fogEnabled) return;
    ctx.fillStyle = preview ? "rgba(0,0,0,.78)" : "#04070b";
    ctx.fillRect(0, 0, m.width, m.height);
    const old = s.exploration?.[m.id];
    if (old) {
      let cached = masks178.get(old);
      if (
        !cached ||
        cached.mapWidth !== m.width ||
        cached.mapHeight !== m.height
      ) {
        const { bits, w, h } = decode(m, old),
          mask = document.createElement("canvas");
        mask.width = w;
        mask.height = h;
        const mc = mask.getContext("2d"),
          image = mc.createImageData(w, h);
        bits.forEach((b, i) => (image.data[i * 4 + 3] = b ? 90 : 0));
        mc.putImageData(image, 0, 0);
        cached = { mask, w, h, mapWidth: m.width, mapHeight: m.height };
        masks178.set(old, cached);
      }
      const { mask, w, h } = cached;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.imageSmoothingEnabled = true;
      ctx.filter = "blur(4px)";
      ctx.drawImage(mask, 0, 0, w * resolution, h * resolution);
      ctx.restore();
    }
    const poly = visibilityPolygon(m, s, p),
      r = oldVision(m, p) * S.size(m) * Math.sqrt(3);
    if (r <= 0) return;
    ctx.save();
    ctx.beginPath();
    poly.forEach((a, i) => (i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y)));
    ctx.closePath();
    ctx.clip();
    ctx.globalCompositeOperation = "destination-out";
    const gradient = ctx.createRadialGradient(
      s.x,
      s.y,
      Math.max(0, r * 0.75),
      s.x,
      s.y,
      r,
    );
    gradient.addColorStop(0, "#000");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    ctx.restore();
  }
  const api = {
    radius,
    canMove,
    path,
    visibilityPolygon,
    reveal,
    normalize,
    step,
    inSight,
    interactionReason,
    drawFog,
  };
  root.GRPGHubFreeV178 = api;
  Object.assign(S, api, {
    visibleCells: () => null,
    nearest: (m, x, y) => ({
      x: clamp(x, radius(m), m.width - radius(m)),
      y: clamp(y, radius(m), m.height - radius(m)),
    }),
    hex: (m, x, y) => ({ x, y }),
    center: (m, p) => p,
    cellKey: (p) => Math.round(p.x / 12) + "," + Math.round(p.y / 12),
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    gridMarkup: () => "",
    wallsMarkup: (m, editor = false, id = "") =>
      editor ? oldWalls(m, true, id) : "",
    polygon: (m, p) =>
      Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        return p.x + Math.cos(a) * 8 + "," + (p.y + Math.sin(a) * 8);
      }).join(" "),
  });
  C.canMove = canMove;
})(typeof window !== "undefined" ? window : globalThis);
