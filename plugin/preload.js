const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('projectTool', {
  getStatus: () => ipcRenderer.invoke('tool:status'),
  loadBinPreferences: () => ipcRenderer.invoke('tool:load-bin-preferences'),
  saveBinPreferences: (folders) => ipcRenderer.invoke('tool:save-bin-preferences', folders),
  resetBinPreferences: () => ipcRenderer.invoke('tool:reset-bin-preferences'),
  listSettingsPresets: () => ipcRenderer.invoke('tool:list-settings-presets'),
  exportReport: (result) => ipcRenderer.invoke('tool:export-report', result),
  reconnect: () => ipcRenderer.invoke('tool:reconnect'),
  chooseSources: () => ipcRenderer.invoke('tool:choose-sources'),
  scanSources: (operationId, paths, previousScanId, activePaths, previousFiles, forceRefresh) => ipcRenderer.invoke('tool:scan-sources', operationId, paths, previousScanId, activePaths, previousFiles, forceRefresh),
  verifyDuplicates: (operationId, options) => ipcRenderer.invoke('tool:verify-duplicates', operationId, options),
  cancelOperation: (operationId) => ipcRenderer.invoke('tool:cancel-operation', operationId),
  createProject: (options) => ipcRenderer.invoke('tool:create-project', options),
  openProxyGenerator: (paths) => ipcRenderer.invoke('tool:open-proxy-generator', paths),
  finish: () => ipcRenderer.invoke('tool:finish'),
  close: () => ipcRenderer.invoke('tool:close'),
  uninstall: () => ipcRenderer.invoke('tool:uninstall'),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tool:progress', listener);
    return () => ipcRenderer.removeListener('tool:progress', listener);
  }
});
