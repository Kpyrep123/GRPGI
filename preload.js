const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  version: process.versions.electron,
  isPackaged: ipcRenderer.sendSync('app:isPackaged'),
  appVersion: ipcRenderer.sendSync('app:getVersion'),
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
  openLatestInstaller: () => ipcRenderer.invoke('updater:openInstaller'),
  loadWorldData: () => ipcRenderer.invoke('world:load'),
  saveWorldSection: (sectionName, payload) => ipcRenderer.invoke('world:saveSection', sectionName, payload),
  saveWorldData: payload => ipcRenderer.invoke('world:saveAll', payload),
  exportWorldSectionJson: (section, payload) => ipcRenderer.invoke('world:section:exportJson', { section, payload }),
  importWorldSectionJson: section => ipcRenderer.invoke('world:section:importJson', { section }),
  resetWorldData: () => ipcRenderer.invoke('world:reset'),
  saveWorldImage: payload => ipcRenderer.invoke('world:saveImage', payload),
  saveWorldImageFile: payload => ipcRenderer.invoke('world:saveImageFile', payload),
  getPathForFile: file => webUtils.getPathForFile(file),
  saveCombatSound: payload => ipcRenderer.invoke('combat:sound:save', payload),
  saveCombatSoundFile: payload => ipcRenderer.invoke('combat:sound:saveFile', payload),
  chooseCombatMedia: payload => ipcRenderer.invoke('combat:media:choose', payload),
  loadLocalCombatScenes: () => ipcRenderer.invoke('combat:local:load'),
  saveLocalCombatScenes: payload => ipcRenderer.invoke('combat:local:save', payload),
  saveLocalCombatAsset: payload => ipcRenderer.invoke('combat:asset:save', payload),
  saveLocalCombatAssetFile: payload => ipcRenderer.invoke('combat:asset:saveFile', payload),
  exportCombatArchive: payload => ipcRenderer.invoke('combat:archive:export', payload),
  importCombatArchive: () => ipcRenderer.invoke('combat:archive:import'),
  validateCombatLua: payload => ipcRenderer.invoke('combat:lua:validate', payload),
  runCombatLuaHook: payload => ipcRenderer.invoke('combat:lua:runHook', payload),
  loadSyncConfig: () => ipcRenderer.invoke('sync:config:load'),
  saveSyncConfig: payload => ipcRenderer.invoke('sync:config:save', payload),
  pingSync: () => ipcRenderer.invoke('sync:ping'),
  pullSync: payload => ipcRenderer.invoke('sync:pull', payload),
  transactMarket: payload => ipcRenderer.invoke('market:transaction', payload),
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
  pullCharacterApplications: () => ipcRenderer.invoke('applications:pull'),
  submitCharacterApplication: payload => ipcRenderer.invoke('applications:submit', payload),
  reviewCharacterApplication: payload => ipcRenderer.invoke('applications:review', payload),
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
  onPlayerDisplayDataChanged: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('display:player:data-changed', handler);
    return () => ipcRenderer.removeListener('display:player:data-changed', handler);
  },
  getDevOpsStatus: role => ipcRenderer.invoke('devops:status', { role }),
  publishDevInstaller: role => ipcRenderer.invoke('devops:publishInstaller', { role }),
  onDevReleaseProgress: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('devops:releaseProgress', handler);
    return () => ipcRenderer.removeListener('devops:releaseProgress', handler);
  },
  deployDevWeb: role => ipcRenderer.invoke('devops:deployWeb', { role }),
  createDevSourceArchive: role => ipcRenderer.invoke('devops:createSourceArchive', { role }),
  debugLog: (label, payload) => ipcRenderer.invoke('debug:log', label, payload)
});
