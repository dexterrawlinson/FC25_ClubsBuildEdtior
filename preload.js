/**
 * FC 25 Overlay - Preload Script
 * Secure bridge between main and renderer processes
 */

const { contextBridge, ipcRenderer } = require('electron');

console.log('🔒 Preload script loading...');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {

    // ==========================================
    // DETECTION APIs
    // ==========================================

    /**
     * Listen for game detection events
     */
    onGameDetected: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('game-detected', handler);

        // Return cleanup function
        return () => ipcRenderer.removeListener('game-detected', handler);
    },

    /**
     * Listen for app ready events
     */
    onAppReady: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('app-ready', handler);
        return () => ipcRenderer.removeListener('app-ready', handler);
    },

    /**
     * Listen for screen changes
     */
    onScreenChanged: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('screen-changed', handler);
        return () => ipcRenderer.removeListener('screen-changed', handler);
    },

    /**
     * Listen for learning status updates
     */
    onLearningStatus: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('learning-status', handler);
        return () => ipcRenderer.removeListener('learning-status', handler);
    },

    /**
     * Get current detection status
     */
    getDetectionStatus: () => ipcRenderer.invoke('get-detection-status'),

    // ==========================================
    // BUILD MANAGEMENT APIs
    // ==========================================

    /**
     * Save build configuration
     */
    saveBuild: (buildData) => {
        console.log('💾 [Preload] Saving build:', buildData);
        return ipcRenderer.invoke('save-build', buildData);
    },

    /**
     * Export build as JSON
     */
    exportBuild: (buildData) => {
        console.log('📤 [Preload] Exporting build');
        return ipcRenderer.invoke('export-build', buildData);
    },

    // ==========================================
    // UTILITY APIs
    // ==========================================

    /**
     * Log messages (for debugging)
     */
    log: (message, data) => {
        console.log('[Renderer]', message, data);
    },

    /**
     * Show notifications
     */
    showNotification: (title, body) => {
        if (window.Notification && Notification.permission === 'granted') {
            new Notification(title, { body });
        }
    },

    /**
     * Request notification permission
     */
    requestNotificationPermission: async () => {
        if (window.Notification) {
            return await Notification.requestPermission();
        }
        return 'denied';
    }
});

// Security: Remove Node.js access from renderer
delete window.require;
delete window.exports;
delete window.module;

console.log('✅ Preload script ready - Security bridge established');