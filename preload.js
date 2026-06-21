const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  version: process.versions.electron,
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: payload => ipcRenderer.invoke('state:save', payload),
  loadReadMarkers: () => ipcRenderer.invoke('readMarkers:load'),
  saveReadMarkers: payload => ipcRenderer.invoke('readMarkers:save', payload),
  saveReadMarkersSync: payload => ipcRenderer.sendSync('readMarkers:saveSync', payload),
  getPaths: () => ipcRenderer.invoke('app:paths'),
  openWorldDataDir: () => ipcRenderer.invoke('app:openWorldDataDir'),
  backupWorldData: () => ipcRenderer.invoke('app:backupWorldData'),
  getUpdateStatus: () => ipcRenderer.invoke('updater:status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  loadWorldData: () => ipcRenderer.invoke('world:load'),
  saveWorldSection: (sectionName, payload) => ipcRenderer.invoke('world:saveSection', sectionName, payload),
  saveWorldData: payload => ipcRenderer.invoke('world:saveAll', payload),
  resetWorldData: () => ipcRenderer.invoke('world:reset'),
  saveWorldImage: payload => ipcRenderer.invoke('world:saveImage', payload),
  saveCombatSound: payload => ipcRenderer.invoke('combat:sound:save', payload),
  loadSyncConfig: () => ipcRenderer.invoke('sync:config:load'),
  saveSyncConfig: payload => ipcRenderer.invoke('sync:config:save', payload),
  pingSync: () => ipcRenderer.invoke('sync:ping'),
  pullSync: payload => ipcRenderer.invoke('sync:pull', payload),
  pushSync: payload => ipcRenderer.invoke('sync:push', payload),
  onSyncSnapshotEvent: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('sync:snapshot:event', handler);
    return () => ipcRenderer.removeListener('sync:snapshot:event', handler);
  },
  pullPlayers: payload => ipcRenderer.invoke('players:pull', payload),
  pushPlayer: payload => ipcRenderer.invoke('players:push', payload),
  patchPlayer: payload => ipcRenderer.invoke('players:patch', payload),
  deletePlayer: payload => ipcRenderer.invoke('players:delete', payload),
  pullChat: payload => ipcRenderer.invoke('chat:pull', payload),
  upsertChat: payload => ipcRenderer.invoke('chat:upsert', payload),
  pushChatBatch: payload => ipcRenderer.invoke('chat:pushBatch', payload),
  pullCombatRuntime: payload => ipcRenderer.invoke('combat:pull', payload),
  pushCombatRuntime: payload => ipcRenderer.invoke('combat:push', payload),
  onCombatRuntimeEvent: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('combat:runtime:event', handler);
    return () => ipcRenderer.removeListener('combat:runtime:event', handler);
  },
  onUpdaterStatus: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
  onChatEvent: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('chat:remote:event', handler);
    return () => ipcRenderer.removeListener('chat:remote:event', handler);
  },
  onPlayerEvent: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('players:remote:event', handler);
    return () => ipcRenderer.removeListener('players:remote:event', handler);
  },
  openPlayerDisplay: () => ipcRenderer.invoke('display:player:open'),
  closePlayerDisplay: () => ipcRenderer.invoke('display:player:close'),
  getPlayerDisplayStatus: () => ipcRenderer.invoke('display:player:status'),
  getPlayerDisplayView: () => ipcRenderer.invoke('display:player:view:get'),
  updatePlayerDisplayView: payload => ipcRenderer.invoke('display:player:view:update', payload),
  onPlayerDisplayView: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('display:player:view', handler);
    return () => ipcRenderer.removeListener('display:player:view', handler);
  },
  debugLog: (label, payload) => ipcRenderer.invoke('debug:log', label, payload)
});
