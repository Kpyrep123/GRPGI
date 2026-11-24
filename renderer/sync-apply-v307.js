/* One remote application at a time, around the complete renderer wrapper chain. */
(() => {
  const check = Sync.checkForRemoteUpdates.bind(Sync);
  const apply = Sync.applyRemoteSnapshot.bind(Sync);
  let checks = Promise.resolve(), applications = Promise.resolve(), baseline = null;
  const pendingChecks = new Map();
  // World comparisons belong to the remote campaign, not the UI login state.
  // In-flight work still belongs to the exact session that requested it.
  const worldContext = () => JSON.stringify([Sync.provider(), Sync.config?.url, Sync.config?.serverUrl, Sync.config?.campaignId, Sync.config?.tableName]);
  const context = () => JSON.stringify([worldContext(), App.currentUserId]);
  const signature = world => new Map(Object.entries(world || {}).map(([key, value]) => [key, JSON.stringify(value)]));
  const equal = (a, b) => a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);

  Sync.checkForRemoteUpdates = function(reason = 'manual-check', options = {}) {
    const key = JSON.stringify([context(), !!options.force, !!options.retryPending, options.applyIfNewer !== false, !!options.silent]);
    if (pendingChecks.has(key)) return pendingChecks.get(key);
    const task = checks.catch(() => {}).then(() => check(reason, options));
    checks = task;
    const result = task.finally(() => pendingChecks.delete(key));
    pendingChecks.set(key, result);
    return result;
  };

  Sync.applyRemoteSnapshot = function(payload, remoteMeta = {}, options = {}) {
    const requestedContext = context(), requestedWorldContext = worldContext();
    const task = applications.catch(() => {}).then(async () => {
      if (context() !== requestedContext) return { ok: true, status: 'deferred-context-changed' };
      const sync = App.state?.meta?.sync || {};
      const confirmed = Number.isFinite(options.confirmedEditVersionV307) && options.confirmedEditVersionV307 === Number(sync.localEditVersion || 0);
      if (!options.force && (sync.localDirty && !confirmed || UiSyncGuard.isEditingCriticalForm())) {
        UiSyncGuard.defer('snapshot-apply-v307');
        return { ok: true, status: 'deferred-local-edit' };
      }
      if (!payload?.world || !payload?.state) return { ok: false, message: 'Remote payload пустой' };
      const started = performance.now(), signatures = signature(payload.world), state = JSON.stringify(payload.state);
      const stamp = JSON.stringify([remoteMeta._id, remoteMeta.revision, remoteMeta.updatedAt]);
      const recordId = String(remoteMeta._id || '');
      const known = baseline?.worldContext === requestedWorldContext && baseline.recordId === recordId;
      if (!options.force && known && Number(remoteMeta.revision || 0) < Number(sync.remoteRevision || 0)) return { ok: true, status: 'deferred-stale-snapshot' };
      if (!options.force && !sync.localDirty && known && baseline.context === requestedContext && baseline.stamp === stamp && baseline.state === state && equal(baseline.signatures, signatures)) {
        Debug.log('SYNC_APPLY_REMOTE_DEDUPED', { revision: remoteMeta.revision });
        return { ok: true, status: 'already-applied' };
      }
      let patch = null;
      if (!options.force && known && (!confirmed || Array.isArray(options.confirmationWorldScopeV307)) && window.electronAPI?.saveWorldSections) {
        patch = {};
        for (const name of new Set([...baseline.signatures.keys(), ...signatures.keys()])) {
          if (baseline.signatures.get(name) !== signatures.get(name)) patch[name] = payload.world[name] ?? {};
        }
        // Even an unchanged server section must undo a rejected/canonicalized
        // local edit after the user's own receipt. Never trust the submitted draft.
        if (confirmed) for (const name of options.confirmationWorldScopeV307) patch[name] = payload.world[name] ?? {};
        // Unknown/legacy section shapes retain the full recovery path.
        if (Object.entries(patch).some(([name, value]) => !Object.hasOwn(worldData, name) || !value || typeof value !== 'object' || Array.isArray(value))) patch = null;
      }
      const result = await apply(payload, remoteMeta, { ...options, ...(patch ? { worldPatchV307: patch } : {}), deferRenderV307: true });
      if (result?.ok && !String(result.status || '').startsWith('deferred')) {
        baseline = { context: requestedContext, worldContext: requestedWorldContext, recordId, signatures, state, stamp };
        rerenderActiveModuleV086();
        Debug.log('SYNC_APPLY_REMOTE_TIMING', { revision: remoteMeta.revision, mode: patch ? 'sections' : 'full', sections: patch ? Object.keys(patch) : Object.keys(payload.world), elapsedMs: Math.round(performance.now() - started) });
      }
      return result;
    });
    applications = task;
    return task;
  };
})();
