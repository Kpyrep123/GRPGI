(function () {
  'use strict';

  const markers = Object.freeze([
    Object.freeze({ status: 'active', glyph: '◆', color: '#66e9ff', label: 'Активные задания' }),
    Object.freeze({ status: 'open', glyph: '▲', color: '#ffc36e', label: 'Не принятые задания' })
  ]);

  function byPlanet(tasks, isVisible) {
    const destinations = new Map();
    for (const task of tasks) {
      const id = task.destinationPlanetId;
      const status = task.status || 'open';
      if (!id || !markers.some(marker => marker.status === status) || !isVisible(task)) continue;
      if (!destinations.has(id)) destinations.set(id, new Set());
      destinations.get(id).add(status);
    }
    return destinations;
  }

  function forSystem(destinations, planetIds, isPlanetVisible) {
    if (!destinations.size) return undefined;
    const statuses = new Set();
    for (const id of planetIds || []) {
      const planetStatuses = destinations.get(id);
      if (!planetStatuses || !isPlanetVisible(id)) continue;
      for (const status of planetStatuses) statuses.add(status);
    }
    return statuses;
  }

  function draw(ctx, x, y, dpr, statuses) {
    if (!statuses?.size) return;
    ctx.save();
    ctx.font = `bold ${14 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * dpr;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b121b';
    let offset = (statuses.size - 1) * 8 * dpr;
    for (const { status, glyph, color } of markers) {
      if (!statuses.has(status)) continue;
      ctx.fillStyle = color;
      ctx.strokeText(glyph, x + offset, y);
      ctx.fillText(glyph, x + offset, y);
      offset -= 16 * dpr;
    }
    ctx.restore();
  }

  window.GRPGTaskMapV216 = Object.freeze({ markers, byPlanet, forSystem, draw });
})();
