/**
 * Initialize screen detection system
 */
function initializeScreenDetection() {
    console.log('🧠 Initializing screen detection system...');

    // Check if ScreenDetector class is available
    if (!ScreenDetector) {
        console.error('❌ ScreenDetector class not available');
        console.log('⚠️ Screen learning features (F6/F7) will be disabled');
        return false;
    }

    try {
        // Make sure ScreenDetector file exists and is accessible
        const ScreenDetectorPath = path.join(__dirname, 'ScreenDetector.js');
        console.log('📁 ScreenDetector path:', ScreenDetectorPath);

        screenDetector = new ScreenDetector({
            detectionFrequency: 3000,      // Check every 3 seconds
            learningFrequency: 2000,       // Learn every 2 seconds during learning mode
            confidenceThreshold: 0.7,      // 70% confidence required for screen match
            databasePath: path.join(__dirname, 'screen-database.json')  // Absolute path for database
        });

        // Set up event listeners for screen detection
        screenDetector.on('screenChange', (newScreen, oldScreen, screenData) => {
            console.log(`📱 Screen changed: ${oldScreen} → ${newScreen} (${Math.round(screenData.confidence * 100)}% confidence)`);

            // Notify renderer about screen change
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('screen-changed', {
                    newScreen,
                    oldScreen,
                    confidence: screenData.confidence,
                    timestamp: new Date().toISOString()
                });
            }
        });

        screenDetector.on('learningUpdate', (screenName, data) => {
            console.log(`🧠 Learning update: ${screenName} (${data.textElements?.length || 0} patterns, ${Math.round((data.confidence || 0) * 100)}% confidence)`);

            // Notify renderer about learning progress
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('learning-update', {
                    screenName,
                    patterns: data.textElements?.length || 0,
                    confidence: data.confidence || 0,
                    timestamp: new Date().toISOString()
                });
            }
        });

        screenDetector.on('error', (error) => {
            console.error('❌ Screen detection error:', error.message);

            // Notify renderer about errors
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('detection-error', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Start automatic screen detection
        screenDetector.startDetection();

        console.log('✅ Screen detection system initialized and started');
        console.log('💡 F6 = Toggle learning mode, F7 = Teach current screen');

        return true;

    } catch (error) {
        console.error('❌ Failed to initialize screen detection:', error.message);
        console.log('⚠️ Screen detection will be disabled');
        console.log('🔍 Error details:', error.stack);
        screenDetector = null;
        return false;
    }
}/**
 * FC 25 Pro Clubs Overlay - Main Process
 * Handles window creation, game detection, screen learning, and system integration
 */

const { app, BrowserWindow, globalShortcut, screen, ipcMain } = require('electron');
const path = require('path');

// Import detection modules (with fallbacks for development)
const { exec } = require('child_process');

// Import ScreenDetector with error handling
let ScreenDetector = null;
try {
    // Try different possible names/paths
    ScreenDetector = require('./ScreenDetector');
    console.log('✅ ScreenDetector class loaded successfully');
} catch (error1) {
    console.log('⚠️ Trying alternative import paths...');
    try {
        ScreenDetector = require('./screenDetector');
        console.log('✅ ScreenDetector loaded (lowercase)');
    } catch (error2) {
        try {
            ScreenDetector = require('./ScreenDetector.js');
            console.log('✅ ScreenDetector loaded (with .js extension)');
        } catch (error3) {
            console.error('❌ Failed to load ScreenDetector:', error1.message);
            console.error('❌ Alternative attempts also failed');
            console.log('🔍 Make sure ScreenDetector.js exists in project root');
            console.log('📁 Current directory:', __dirname);
        }
    }
}

let windowManager, screenshot;
try {
    windowManager = require('node-window-manager');
    screenshot = require('screenshot-desktop');
    console.log('✅ Optional native modules loaded');
} catch (error) {
    console.log('💡 Using PowerShell detection (works on all Windows)');
}

// Global variables
let mainWindow = null;
let detectionInterval = null;
let screenDetector = null;
let isGameDetected = false;

/**
 * Creates the main overlay window
 */
function createOverlayWindow() {
    console.log('🚀 Creating FC 25 overlay window...');

    // Get screen dimensions
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Create full-screen transparent overlay
    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        x: 0,
        y: 0,
        transparent: true,       // Transparent background
        frame: false,           // No window frame
        alwaysOnTop: true,      // Stay above other windows
        skipTaskbar: true,      // Don't show in taskbar
        resizable: false,       // Fixed size for overlay
        movable: false,         // Prevent accidental moving
        focusable: false,       // Don't steal focus from game
        show: false,            // Start hidden, show after ready
        webPreferences: {
            nodeIntegration: false,     // Security
            contextIsolation: true,     // Security
            enableRemoteModule: false,  // Security
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Show window after it's ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        console.log('✅ Overlay now visible over all applications');
        console.log('🖱️ Click-through: Main panel = Interactive, Info panels = Click-through');
    });

    // Load the overlay HTML
    mainWindow.loadFile('src/overlay.html');

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
        console.log('🔧 Development mode - DevTools opened');
    }

    // Window event handlers
    mainWindow.on('closed', () => {
        console.log('🔄 Main window closed');
        mainWindow = null;
        stopDetection();
    });

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('✅ Overlay loaded successfully');

        // Send initial status
        mainWindow.webContents.send('app-ready', {
            version: app.getVersion(),
            detectionAvailable: !!(windowManager && screenshot)
        });
    });

    console.log('✅ Overlay window created');
}

/**
 * Starts FC 25 game detection using PowerShell (works on all Windows)
 */
function startDetection() {
    console.log('🔍 Starting FC 25 detection using PowerShell...');
    console.log('💡 This works without any additional software installs');

    // Check every 3 seconds (PowerShell is a bit slower than native)
    detectionInterval = setInterval(() => {
        detectFC25Game();
        enforceOverlayPosition(); // Keep overlay on top
    }, 3000);

    // Also start overlay enforcement for gaming
    startOverlayEnforcement();
}

/**
 * Enforce overlay stays on top (for gaming overlays)
 */
function startOverlayEnforcement() {
    console.log('🛡️ Starting overlay enforcement for gaming...');

    setInterval(() => {
        if (mainWindow && mainWindow.isVisible()) {
            // Re-assert always on top every 5 seconds
            mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        }
    }, 5000);
}

/**
 * Force overlay to stay above game windows
 */
function enforceOverlayPosition() {
    if (mainWindow && mainWindow.isVisible()) {
        // Periodically re-enforce always on top
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }
}

/**
 * Stops game detection
 */
function stopDetection() {
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
        console.log('⏹️ Detection stopped');
    }
}

/**
 * Main FC 25 detection function using PowerShell (Windows built-in)
 */
function detectFC25Game() {
    try {
        // Use PowerShell to find FC 25 process (works on all Windows)
        const { exec } = require('child_process');

        exec('powershell "Get-Process | Where-Object {$_.Name -like \'*FC25*\' -or $_.ProcessName -like \'*FC25*\' -or $_.Name -like \'*EASPORTSFC25*\'} | Select-Object Name, MainWindowTitle"',
            { timeout: 3000 }, (error, stdout, stderr) => {

                if (error) {
                    // PowerShell failed - that's okay, just mark as not detected
                    if (isGameDetected) {
                        isGameDetected = false;
                        console.log('❌ FC 25 no longer detected (PowerShell check failed)');

                        if (mainWindow) {
                            mainWindow.webContents.send('game-detected', { detected: false });
                        }
                    }
                    return;
                }

                // Check if we found any FC 25 processes
                const hasFC25Process = stdout && stdout.trim().length > 0 && !stdout.includes('No objects found');

                if (hasFC25Process && !isGameDetected) {
                    // Game found!
                    isGameDetected = true;
                    console.log('🎮 FC 25 detected via PowerShell!');
                    console.log('📄 Process info:', stdout.trim());

                    if (mainWindow) {
                        mainWindow.webContents.send('game-detected', {
                            detected: true,
                            method: 'powershell',
                            processInfo: stdout.trim()
                        });
                    }

                } else if (!hasFC25Process && isGameDetected) {
                    // Game lost
                    isGameDetected = false;
                    console.log('❌ FC 25 no longer detected');

                    if (mainWindow) {
                        mainWindow.webContents.send('game-detected', { detected: false });
                    }
                }
            });

    } catch (error) {
        console.error('❌ Detection error:', error.message);
    }
}

/**
 * Sets up global hotkeys
 */
function setupHotkeys() {
    console.log('⌨️ Setting up hotkeys...');

    // F1: Toggle overlay
    globalShortcut.register('F1', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
                console.log('👁️ Overlay hidden');
            } else {
                mainWindow.show();
                console.log('👁️ Overlay shown');
            }
        }
    });

    // F2: Test detection
    globalShortcut.register('F2', () => {
        console.log('🧪 Manual detection test...');
        detectFC25Game();
    });

    // F4: Reset position and force on top
    globalShortcut.register('F4', () => {
        if (mainWindow) {
            const { width, height } = screen.getPrimaryDisplay().workAreaSize;

            // Force to front and reset always on top
            mainWindow.setAlwaysOnTop(false);
            mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
            mainWindow.focus();
            mainWindow.show();

            console.log('📍 Overlay forced to front and repositioned');
        }
    });

    // F5: Force overlay to absolute top (emergency)
    globalShortcut.register('F5', () => {
        if (mainWindow) {
            mainWindow.setAlwaysOnTop(false);
            setTimeout(() => {
                mainWindow.setAlwaysOnTop(true, 'screen-saver', 10);
                mainWindow.focus();
                mainWindow.moveTop();
                console.log('🚨 Emergency: Overlay forced to absolute top');
            }, 100);
        }
    });

    console.log('✅ Hotkeys ready: F1=Toggle, F2=Test, F4=Reposition, F5=Force Top');
}

/**
 * IPC handlers for renderer communication
 */
function setupIPC() {
    console.log('🔗 Setting up IPC handlers...');

    // Get detection status
    ipcMain.handle('get-detection-status', () => {
        return {
            gameDetected: isGameDetected,
            detectionActive: detectionInterval !== null,
            timestamp: new Date().toISOString()
        };
    });

    // Save build
    ipcMain.handle('save-build', async (event, buildData) => {
        console.log('💾 Build save requested:', buildData.position);

        // TODO: Implement file saving
        return {
            success: true,
            message: 'Build saved (demo mode)',
            timestamp: new Date().toISOString()
        };
    });

    // Export build
    ipcMain.handle('export-build', async (event, buildData) => {
        console.log('📤 Build export requested');

        // TODO: Implement export functionality
        return {
            success: true,
            data: JSON.stringify(buildData, null, 2)
        };
    });

    console.log('✅ IPC handlers ready');
}

/**
 * App initialization
 */
app.whenReady().then(() => {
    console.log('⚡ FC 25 Pro Clubs Overlay starting...');
    console.log('📱 Electron version:', process.versions.electron);
    console.log('🎯 Target: FC 25 Level 120 builds with screen detection');

    createOverlayWindow();
    setupHotkeys();
    setupIPC();
    startDetection();

    // NEW: Initialize screen detection system
    initializeScreenDetection();

    console.log('🚀 Overlay initialized with full screen detection!');
    console.log('📋 Press F1 to toggle, F2 to test, F6 for learning mode');
});

// App event handlers
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createOverlayWindow();
    }
});

app.on('before-quit', () => {
    console.log('🔄 Shutting down...');
    stopDetection();
    globalShortcut.unregisterAll();
    console.log('✅ Cleanup complete');
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error);
});

console.log('🎮 FC 25 Overlay ready to start!');