/**
 * ScreenDetector.js - FC 25 Screen Detection System
 * Fixed version with proper error handling and method implementations
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class ScreenDetector {
    constructor(options = {}) {
        this.currentScreen = 'unknown';
        this.isLearning = false;
        this.detectionInterval = null;
        this.learningInterval = null;

        // Configuration
        this.config = {
            detectionFrequency: options.detectionFrequency || 3000, // 3 seconds
            learningFrequency: options.learningFrequency || 2000,   // 2 seconds
            databasePath: options.databasePath || './screen-database.json',
            confidenceThreshold: options.confidenceThreshold || 0.7,
            ...options
        };

        // Screen patterns database
        this.screenPatterns = new Map();

        // Event callbacks
        this.callbacks = {
            onScreenChange: null,
            onLearningUpdate: null,
            onError: null
        };

        // Load database on initialization
        this.loadDatabase().catch(error => {
            console.log('📁 No existing database found, starting fresh');
        });

        console.log('🔍 ScreenDetector initialized');
    }

    // =====================================
    // PUBLIC METHODS
    // =====================================

    /**
     * Start automatic screen detection
     */
    startDetection() {
        if (this.detectionInterval) {
            console.log('⚠️ Detection already running');
            return;
        }

        console.log('🔍 Starting screen detection...');

        this.detectionInterval = setInterval(() => {
            this.detectCurrentScreen();
        }, this.config.detectionFrequency);

        // Do initial detection
        this.detectCurrentScreen();
    }

    /**
     * Stop automatic screen detection
     */
    stopDetection() {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
            console.log('⏹️ Screen detection stopped');
        }
    }

    /**
     * Start learning mode - teach the system new screens
     */
    startLearning() {
        console.log('📚 Starting learning mode...');
        console.log('💡 Navigate through FC 25 menus to teach the system');

        this.isLearning = true;

        // More frequent captures during learning
        this.learningInterval = setInterval(() => {
            this.learnCurrentScreen();
        }, this.config.learningFrequency);
    }

    /**
     * Stop learning mode and save learned patterns
     */
    stopLearning() {
        console.log('🛑 Stopping learning mode');

        this.isLearning = false;

        if (this.learningInterval) {
            clearInterval(this.learningInterval);
            this.learningInterval = null;
        }

        this.saveDatabase();
    }

    /**
     * Get current detected screen
     */
    getCurrentScreen() {
        return this.currentScreen;
    }

    /**
     * Register event callbacks
     */
    on(event, callback) {
        const eventKey = `on${event.charAt(0).toUpperCase() + event.slice(1)}`;
        if (this.callbacks.hasOwnProperty(eventKey)) {
            this.callbacks[eventKey] = callback;
        }
    }

    /**
     * Manually teach the system a specific screen
     */
    async teachScreen(screenName, description = '') {
        console.log(`📖 Teaching screen: ${screenName}`);

        try {
            const screenData = await this.analyzeCurrentScreen();
            screenData.manuallyTaught = true;
            screenData.description = description;
            screenData.timestamp = new Date().toISOString();

            this.screenPatterns.set(screenName, screenData);
            console.log(`✅ Learned screen: ${screenName}`);

            if (this.callbacks.onLearningUpdate) {
                this.callbacks.onLearningUpdate(screenName, screenData);
            }

        } catch (error) {
            console.error(`❌ Failed to teach screen ${screenName}:`, error.message);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
        }
    }

    // =====================================
    // DETECTION METHODS
    // =====================================

    /**
     * Detect what screen we're currently on
     */
    async detectCurrentScreen() {
        try {
            const screenData = await this.analyzeCurrentScreen();
            const detectedScreen = this.matchScreenPattern(screenData);

            if (detectedScreen !== this.currentScreen) {
                const previousScreen = this.currentScreen;
                this.currentScreen = detectedScreen;

                console.log(`📱 Screen changed: ${previousScreen} → ${detectedScreen}`);

                if (this.callbacks.onScreenChange) {
                    this.callbacks.onScreenChange(detectedScreen, previousScreen, screenData);
                }
            }

        } catch (error) {
            console.error('❌ Detection error:', error.message);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
        }
    }

    /**
     * Learn current screen during learning mode
     */
    async learnCurrentScreen() {
        try {
            const screenData = await this.analyzeCurrentScreen();

            // In learning mode, we collect patterns but don't immediately classify
            const patterns = this.extractPatterns(screenData);

            console.log('🧠 Learning patterns:', {
                textElements: patterns.textElements.length,
                confidence: patterns.confidence
            });

            if (this.callbacks.onLearningUpdate) {
                this.callbacks.onLearningUpdate('learning', patterns);
            }

        } catch (error) {
            console.error('❌ Learning error:', error.message);
        }
    }

    /**
     * Analyze current FC 25 screen for identifying features
     */
    async analyzeCurrentScreen() {
        // Method 1: Window title analysis
        const windowInfo = await this.getWindowInfo();

        // Method 2: UI text detection using PowerShell
        const textElements = await this.detectUIText();

        // Method 3: Process information
        const processInfo = await this.getProcessInfo();

        return {
            timestamp: new Date().toISOString(),
            windowInfo,
            textElements,
            processInfo,
            confidence: this.calculateConfidence(textElements)
        };
    }

    /**
     * Get FC 25 window information
     */
    async getWindowInfo() {
        return new Promise((resolve) => {
            exec('powershell "Get-Process | Where-Object {$_.Name -like \'*FC25*\' -or $_.Name -like \'*EASPORTSFC25*\'} | Select-Object MainWindowTitle, ProcessName"',
                { timeout: 5000 }, (error, stdout) => {
                    if (error) {
                        resolve({ title: '', error: error.message });
                        return;
                    }

                    resolve({
                        title: stdout.trim(),
                        raw: stdout
                    });
                });
        });
    }

    /**
     * Detect UI text elements (simplified version using window title)
     */
    async detectUIText() {
        return new Promise((resolve) => {
            exec('powershell "Get-WmiObject Win32_Process | Where-Object {$_.Name -like \'*FC25*\'} | Select-Object ProcessId, CommandLine"',
                { timeout: 5000 }, (error, stdout) => {
                    if (error) {
                        resolve([]);
                        return;
                    }

                    // Extract potential UI indicators from command line or process info
                    const lines = stdout.split('\n').filter(line => line.trim());
                    const textElements = lines.map(line => ({
                        text: line.trim(),
                        confidence: 0.5,
                        source: 'process'
                    }));

                    resolve(textElements);
                });
        });
    }

    /**
     * Get detailed process information
     */
    async getProcessInfo() {
        return new Promise((resolve) => {
            exec('powershell "Get-Process | Where-Object {$_.Name -like \'*FC25*\'} | Select-Object Id, ProcessName, StartTime, WorkingSet"',
                { timeout: 5000 }, (error, stdout) => {
                    resolve({
                        raw: stdout || '',
                        isRunning: !error && stdout.includes('FC25'),
                        timestamp: new Date().toISOString()
                    });
                });
        });
    }

    // =====================================
    // PATTERN MATCHING
    // =====================================

    /**
     * Match current screen data against known patterns
     */
    matchScreenPattern(screenData) {
        let bestMatch = 'unknown';
        let highestConfidence = 0;

        // Pre-defined patterns for common screens
        const knownPatterns = this.getKnownPatterns();

        for (const [screenName, pattern] of knownPatterns) {
            const confidence = this.calculatePatternMatch(screenData, pattern);

            if (confidence > highestConfidence && confidence >= this.config.confidenceThreshold) {
                highestConfidence = confidence;
                bestMatch = screenName;
            }
        }

        // Also check learned patterns
        for (const [screenName, pattern] of this.screenPatterns) {
            const confidence = this.calculatePatternMatch(screenData, pattern);

            if (confidence > highestConfidence && confidence >= this.config.confidenceThreshold) {
                highestConfidence = confidence;
                bestMatch = screenName;
            }
        }

        return bestMatch;
    }

    /**
     * Calculate how well screen data matches a pattern
     */
    calculatePatternMatch(screenData, pattern) {
        let score = 0;
        let maxScore = 0;

        // Check window title similarity
        if (pattern.windowInfo && screenData.windowInfo) {
            maxScore += 0.4;
            if (this.textSimilarity(screenData.windowInfo.title, pattern.windowInfo.title) > 0.7) {
                score += 0.4;
            }
        }

        // Check text elements
        if (pattern.textElements && screenData.textElements) {
            maxScore += 0.6;
            const textScore = this.compareTextElements(screenData.textElements, pattern.textElements);
            score += textScore * 0.6;
        }

        return maxScore > 0 ? score / maxScore : 0;
    }

    /**
     * Get pre-defined patterns for common FC 25 screens
     */
    getKnownPatterns() {
        return new Map([
            ['pro-clubs-home', {
                windowInfo: { title: 'FC25' },
                textElements: [
                    { text: 'clubs', confidence: 0.9 },
                    { text: 'pro', confidence: 0.8 }
                ],
                keywords: ['clubs', 'pro', 'build', 'play']
            }],
            ['main-menu', {
                windowInfo: { title: 'EA SPORTS FC 25' },
                textElements: [
                    { text: 'play', confidence: 0.9 },
                    { text: 'ultimate team', confidence: 0.8 }
                ],
                keywords: ['play', 'career', 'ultimate', 'clubs']
            }],
            ['build-editor', {
                windowInfo: { title: 'FC25' },
                textElements: [
                    { text: 'attributes', confidence: 0.9 },
                    { text: 'skill points', confidence: 0.9 }
                ],
                keywords: ['attributes', 'skill', 'points', 'playstyles']
            }]
        ]);
    }

    // =====================================
    // UTILITY METHODS
    // =====================================

    /**
     * Extract patterns from screen data
     */
    extractPatterns(screenData) {
        return {
            textElements: screenData.textElements || [],
            windowTitle: screenData.windowInfo?.title || '',
            confidence: screenData.confidence || 0,
            timestamp: screenData.timestamp
        };
    }

    /**
     * Calculate confidence score for screen data
     */
    calculateConfidence(textElements) {
        if (!textElements || textElements.length === 0) return 0;

        const avgConfidence = textElements.reduce((sum, el) => sum + (el.confidence || 0), 0) / textElements.length;
        return Math.min(avgConfidence, 1.0);
    }

    /**
     * Compare text similarity (simple implementation)
     */
    textSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;

        const str1 = text1.toLowerCase();
        const str2 = text2.toLowerCase();

        if (str1 === str2) return 1;
        if (str1.includes(str2) || str2.includes(str1)) return 0.8;

        // Simple word overlap
        const words1 = str1.split(/\s+/);
        const words2 = str2.split(/\s+/);
        const overlap = words1.filter(word => words2.includes(word)).length;

        return overlap / Math.max(words1.length, words2.length);
    }

    /**
     * Compare text elements between screen data and pattern
     */
    compareTextElements(elements1, elements2) {
        if (!elements1 || !elements2) return 0;

        let matches = 0;
        const total = Math.max(elements1.length, elements2.length);

        for (const el1 of elements1) {
            for (const el2 of elements2) {
                if (this.textSimilarity(el1.text, el2.text) > 0.7) {
                    matches++;
                    break;
                }
            }
        }

        return total > 0 ? matches / total : 0;
    }

    // =====================================
    // DATABASE METHODS
    // =====================================

    /**
     * Load screen patterns database
     */
    async loadDatabase() {
        try {
            const data = await fs.readFile(this.config.databasePath, 'utf8');
            const patterns = JSON.parse(data);

            this.screenPatterns = new Map(Object.entries(patterns));
            console.log(`📁 Loaded ${this.screenPatterns.size} screen patterns`);

        } catch (error) {
            console.log('📁 No existing database found, starting fresh');
            this.screenPatterns = new Map();
        }
    }

    /**
     * Save screen patterns database
     */
    async saveDatabase() {
        try {
            const patterns = Object.fromEntries(this.screenPatterns);
            await fs.writeFile(this.config.databasePath, JSON.stringify(patterns, null, 2));
            console.log(`💾 Saved ${this.screenPatterns.size} screen patterns`);

        } catch (error) {
            console.error('❌ Failed to save database:', error.message);
        }
    }

    /**
     * Get learning statistics
     */
    getStats() {
        return {
            totalPatterns: this.screenPatterns.size,
            currentScreen: this.currentScreen,
            isLearning: this.isLearning,
            detectionActive: !!this.detectionInterval
        };
    }
}

module.exports = ScreenDetector;