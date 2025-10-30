const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const yaml = require('js-yaml');
const cron = require('node-cron');
const fetch = require('node-fetch');
const https = require('https');
const GitManager = require('./git-manager');
const chokidar = require('chokidar');
const debounce = require('debounce');

const version = '2.9.270';
const DEBUG_LOGS = process.env.DEBUG_LOGS === 'true';
const debugLog = (...args) => {
  if (DEBUG_LOGS) {
    console.log(...args);
  }
};

const TLS_CERT_ERROR_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED',
]);

const TLS_ERROR_TEXT_PATTERN = /self signed certificate|unable to verify the first certificate/i;

const isTlsCertificateError = (error) => {
  if (!error) return false;

  const nestedCandidates = [
    error,
    error.cause,
    error.reason,
    error.cause?.cause,
  ].filter(Boolean);

  for (const candidate of nestedCandidates) {
    if (candidate.code && TLS_CERT_ERROR_CODES.has(candidate.code)) {
      return true;
    }
    if (typeof candidate.message === 'string' && TLS_ERROR_TEXT_PATTERN.test(candidate.message)) {
      return true;
    }
  }

  return false;
};

const app = express();
const PORT = process.env.PORT || 54000;
const HOST = process.env.HOST || '0.0.0.0';
const INGRESS_PATH = process.env.INGRESS_ENTRY || '';
const basePath = INGRESS_PATH || '';
const BODY_SIZE_LIMIT = '50mb';

const DATA_DIR = (() => {
  const addonDataRoot = '/data';
  if (fsSync.existsSync(addonDataRoot)) {
    const dir = path.join(addonDataRoot, 'homeassistant-time-machine');
    try {
      fsSync.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error('[data-dir] Failed to ensure addon data directory exists:', error);
    }
    return dir;
  }

  const fallback = path.join(__dirname, 'data');
  try {
    fsSync.mkdirSync(fallback, { recursive: true });
  } catch (error) {
    console.error('[data-dir] Failed to ensure local data directory exists:', error);
  }
  return fallback;
})();

console.log('[data-dir] Using persistent data directory:', DATA_DIR);

// Global Git manager and file watcher instances
let gitManager = null;
let fileWatcher = null;

// Log ingress configuration immediately
console.log('[INIT] INGRESS_ENTRY env var:', process.env.INGRESS_ENTRY || '(not set)');
console.log('[INIT] basePath will be:', basePath || '(empty - direct access)');

// Middleware
app.use(express.json({ limit: BODY_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_SIZE_LIMIT }));

// Error handling middleware for payload size errors
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ 
      error: `Payload too large: ${err.message}`,
      limit: BODY_SIZE_LIMIT
    });
  }
  next(err);
});

// Ingress path detection and URL rewriting middleware
app.use((req, res, next) => {
  debugLog(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  
  // Detect ingress path from headers
  const ingressPath = req.headers['x-ingress-path'] || 
                      req.headers['x-forwarded-prefix'] || 
                      req.headers['x-external-url'] ||
                      '';
  
  // Make ingress path available to templates  
  res.locals.ingressPath = ingressPath;
  res.locals.url = (path) => ingressPath + path;
  
  if (ingressPath) {
    debugLog(`[ingress] Detected: ${ingressPath}, Original URL: ${req.originalUrl}`);
    
    // Strip ingress prefix from URL for routing
    if (req.originalUrl.startsWith(ingressPath)) {
      req.url = req.originalUrl.substring(ingressPath.length) || '/';
      debugLog(`[ingress] Rewritten URL: ${req.url}`);
    }
  }
  
  next();
});

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files - serve at both root and any ingress path
app.use('/static', express.static(path.join(__dirname, 'public')));
// Also handle ingress paths like /api/hassio_ingress/TOKEN/static
app.use('*/static', express.static(path.join(__dirname, 'public')));
console.log(`[static] Static files configured for direct and ingress access`);

// Favicon routes
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/images/favicon.ico'));
});

// Home page
app.get('/', async (req, res) => {
  try {
    const [esphomeEnabled, packagesEnabled] = await Promise.all([
      isEsphomeEnabled(),
      isPackagesEnabled()
    ]);
    res.render('index', {
      title: 'Home Assistant Time Machine',
      version: '2.9.304',
      currentMode: 'automations',
      esphomeEnabled,
      packagesEnabled
    });
  } catch (error) {
    console.error('[home] Failed to determine feature status:', error);
    res.render('index', {
      title: 'Home Assistant Time Machine',
      version: '2.9.304',
      currentMode: 'automations',
      esphomeEnabled: false,
      packagesEnabled: false
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: '2.9.304',
    ingress: !!INGRESS_PATH,
    ingressPath: INGRESS_PATH || 'none',
    timestamp: Date.now()
  });
});

const normalizeHomeAssistantUrl = (url) => {
  if (!url) return null;
  return url.replace(/\/$/, '').replace(/\/+$/, '');
};

const toApiBase = (url) => {
  const normalized = normalizeHomeAssistantUrl(url);
  if (!normalized) return null;
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
};

const resolveSupervisorToken = () => {
  const possibleTokens = [process.env.SUPERVISOR_TOKEN, process.env.HASSIO_TOKEN];
  for (const token of possibleTokens) {
    if (token && token.trim()) {
      return token.trim();
    }
  }
  return null;
};

const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);

async function listYamlFilesRecursive(rootDir) {
  const results = [];

  async function walk(currentDir, relativePrefix) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return;
      }
      throw err;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const entryRelativePath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath, entryRelativePath);
      } else if (entry.isFile() && YAML_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(entryRelativePath);
      }
    }
  }

  await walk(rootDir, '');
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function resolveWithinDirectory(baseDir, relativePath) {
  if (typeof relativePath !== 'string') {
    const error = new Error('Invalid path');
    error.code = 'INVALID_PATH';
    throw error;
  }

  const trimmed = relativePath.trim();
  if (!trimmed) {
    const error = new Error('Invalid path');
    error.code = 'INVALID_PATH';
    throw error;
  }

  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, trimmed);
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`;

  if (target === base || !target.startsWith(baseWithSep)) {
    const error = new Error('Invalid path');
    error.code = 'INVALID_PATH';
    throw error;
  }

  return target;
}

// Get addon options (addon mode) or use environment variables (Docker mode)
async function getAddonOptions() {
  const supervisorToken = resolveSupervisorToken();

  // Check if running in addon mode (has /data/options.json)
  try {
    await fs.access('/data/options.json');
    debugLog('[options] Running in addon mode, reading /data/options.json');
    const options = await fs.readFile('/data/options.json', 'utf-8');
    debugLog('[options] Successfully read /data/options.json');
    const parsedOptions = JSON.parse(options);
    debugLog('[options] text_style configured as:', parsedOptions?.text_style || 'default');
    debugLog('[options] theme configured as:', parsedOptions?.theme || 'dark');

    let esphomeEnabled = parsedOptions?.esphome ?? false;
    let packagesEnabled = parsedOptions?.packages ?? false;
    try {
      const dockerSettings = await loadDockerSettings();
      if (dockerSettings.__loadedFromFile) {
        if (typeof dockerSettings.packagesEnabled === 'boolean') {
          packagesEnabled = dockerSettings.packagesEnabled;
        }
      }
    } catch (settingsError) {
      debugLog('[options] Failed to load Docker settings:', settingsError.message);
    }

    return {
      mode: 'addon',
      home_assistant_url: null,
      long_lived_access_token: null,
      supervisor_token: supervisorToken,
      credentials_source: supervisorToken ? 'supervisor' : 'none',
      text_style: parsedOptions?.text_style || 'default',
      theme: parsedOptions?.theme || 'dark',
      esphome: esphomeEnabled,
      packages: packagesEnabled,
    };
  } catch (error) {
    debugLog('[options] Running in Docker/local mode, checking for environment variables or saved settings');
    let dockerSettings = {};
    try {
      dockerSettings = await loadDockerSettings();
    } catch (settingsError) {
      debugLog('[options] Failed to load Docker settings for ESPHome flag:', settingsError.message);
    }

    // First try environment variables
    if (process.env.HOME_ASSISTANT_URL && process.env.LONG_LIVED_ACCESS_TOKEN) {
      return {
        mode: 'docker',
        home_assistant_url: process.env.HOME_ASSISTANT_URL,
        long_lived_access_token: process.env.LONG_LIVED_ACCESS_TOKEN,
        supervisor_token: supervisorToken,
        credentials_source: 'env',
        text_style: 'default',
        theme: process.env.THEME || 'dark',
        esphome: dockerSettings.esphomeEnabled ?? false,
        packages: dockerSettings.packagesEnabled ?? false,
      };
    }

    // Fall back to saved HA credentials for Docker/local
    try {
      const savedCreds = await fs.readFile(path.join(DATA_DIR, 'docker-ha-credentials.json'), 'utf-8');
      const parsed = JSON.parse(savedCreds);
      const hasSavedCreds = !!(parsed.home_assistant_url && parsed.long_lived_access_token);
      return {
        mode: 'docker',
        home_assistant_url: parsed.home_assistant_url || null,
        long_lived_access_token: parsed.long_lived_access_token || null,
        supervisor_token: supervisorToken,
        credentials_source: hasSavedCreds ? 'stored' : 'none',
        text_style: parsed.text_style || 'default',
        theme: process.env.THEME || parsed.theme || 'dark',
        esphome: dockerSettings.esphomeEnabled ?? false,
        packages: dockerSettings.packagesEnabled ?? false,
      };
    } catch (credError) {
      // No credentials configured
      return {
        mode: 'docker',
        home_assistant_url: null,
        long_lived_access_token: null,
        supervisor_token: supervisorToken,
        credentials_source: 'none',
        text_style: 'default',
        theme: process.env.THEME || 'dark',
        esphome: dockerSettings.esphomeEnabled ?? false,
        packages: dockerSettings.packagesEnabled ?? false,
      };
    }
  }
}

async function getHomeAssistantAuth(optionsOverride, manualOverride) {
  if (manualOverride?.haUrl && manualOverride?.haToken) {
    return {
      baseUrl: toApiBase(manualOverride.haUrl),
      token: manualOverride.haToken,
      source: 'manual',
      options: optionsOverride || await getAddonOptions(),
    };
  }

  const options = optionsOverride || await getAddonOptions();

  if (options.supervisor_token) {
    console.log('[auth] Using supervisor proxy for Home Assistant requests');
    return {
      baseUrl: 'http://supervisor/core/api',
      token: options.supervisor_token,
      source: 'supervisor',
      options,
    };
  }

  if (options.home_assistant_url && options.long_lived_access_token) {
    return {
      baseUrl: toApiBase(options.home_assistant_url),
      token: options.long_lived_access_token,
      source: options.credentials_source || 'options',
      options,
    };
  }

  return {
    baseUrl: null,
    token: null,
    source: 'none',
    options,
  };
}

async function isEsphomeEnabled() {
  try {
    const options = await getAddonOptions();
    return !!(options?.esphome);
  } catch (error) {
    console.error('[esphome] Failed to determine ESPHome status:', error);
    return false;
  }
}

async function isPackagesEnabled() {
  try {
    const options = await getAddonOptions();
    return !!(options?.packages);
  } catch (error) {
    console.error('[packages] Failed to determine Packages status:', error);
    return false;
  }
}

// App settings endpoint (expose config to frontend, excluding sensitive data)
app.get('/api/app-settings', async (req, res) => {
  try {
    debugLog('[app-settings] --- Start ESPHome Flag Resolution ---');

    const options = await getAddonOptions();
    debugLog('[app-settings] Addon options loaded:', { 
      esphome: options.esphome, 
      mode: options.mode 
    });

    let esphomeEnabled = !!(options.esphome);
    debugLog(`[app-settings] Initial esphomeEnabled from options: ${esphomeEnabled}`);

    let storedSettings = null;
    if (options.mode === 'addon') {
      try {
        storedSettings = await loadDockerSettings();
        debugLog('[app-settings] Loaded stored settings (docker-app-settings.json):', {
          esphomeEnabled: storedSettings.esphomeEnabled,
          __loadedFromFile: storedSettings.__loadedFromFile
        });
      } catch (settingsError) {
        debugLog('[app-settings] Failed to load saved settings for ESPHome flag:', settingsError.message);
      }
    }
    const auth = await getHomeAssistantAuth(options);

    const packagesEnabled = await isPackagesEnabled();
    const baseResponse = {
      mode: options.mode,
      haUrl: options.home_assistant_url,
      haToken: options.long_lived_access_token ? 'configured' : null,
      haAuthMode: auth.source,
      haAuthConfigured: !!auth.token,
      haCredentialsSource: options.credentials_source || null,
      textStyle: options.text_style || 'default',
      theme: options.theme || 'dark',
      esphomeEnabled,
      packagesEnabled,
    };
    debugLog('[app-settings] Base response object created:', { esphomeEnabled: baseResponse.esphomeEnabled });

    if (options.mode === 'addon') {
      const savedSettings = storedSettings || await loadDockerSettings();
      debugLog('[app-settings] Addon mode: final check of savedSettings for merge:', {
        esphomeEnabled: savedSettings.esphomeEnabled
      });

      const finalEsphomeEnabled = baseResponse.esphomeEnabled;
      debugLog(`[app-settings] Addon mode: finalEsphomeEnabled resolved to: ${finalEsphomeEnabled}`);

      const finalPackagesEnabled = typeof savedSettings.packagesEnabled === 'boolean'
        ? savedSettings.packagesEnabled
        : packagesEnabled;

      const mergedSettings = {
        liveConfigPath: savedSettings.liveConfigPath || '/config',
        backupFolderPath: savedSettings.backupFolderPath || '/media/backups/yaml',
        textStyle: options.text_style || savedSettings.textStyle || 'default',
        theme: options.theme || savedSettings.theme || baseResponse.theme || 'dark',
        esphomeEnabled: options.esphome ?? finalEsphomeEnabled,
        packagesEnabled: finalPackagesEnabled,
      };

      global.dockerSettings = { ...global.dockerSettings, ...mergedSettings };
      debugLog('[app-settings] Addon mode: global.dockerSettings updated:', { esphomeEnabled: global.dockerSettings.esphomeEnabled });

      const finalResponse = {
        ...baseResponse,
        backupFolderPath: mergedSettings.backupFolderPath,
        liveConfigPath: mergedSettings.liveConfigPath,
        textStyle: mergedSettings.textStyle,
        theme: mergedSettings.theme,
        esphomeEnabled: mergedSettings.esphomeEnabled,
      };
      debugLog('[app-settings] Addon mode: Final response payload:', { esphomeEnabled: finalResponse.esphomeEnabled });
      debugLog('[app-settings] --- End ESPHome Flag Resolution ---');
      res.json(finalResponse);
      return;
    }

    debugLog('[app-settings] Docker mode detected.');
    const dockerSettings = await loadDockerSettings();
    debugLog('[app-settings] Docker mode: loaded dockerSettings:', { esphomeEnabled: dockerSettings.esphomeEnabled });

    const finalEsphomeEnabled = dockerSettings.esphomeEnabled ?? baseResponse.esphomeEnabled;
    debugLog(`[app-settings] Docker mode: finalEsphomeEnabled resolved to: ${finalEsphomeEnabled}`);

    const effectiveTheme = process.env.THEME || dockerSettings.theme || baseResponse.theme || 'dark';
    const finalResponse = {
      ...baseResponse,
      backupFolderPath: dockerSettings.backupFolderPath || '/media/timemachine',
      liveConfigPath: dockerSettings.liveConfigPath || '/config',
      textStyle: dockerSettings.textStyle || 'default',
      theme: effectiveTheme,
      esphomeEnabled: finalEsphomeEnabled,
      packagesEnabled: dockerSettings.packagesEnabled ?? false,
    };
    debugLog('[app-settings] Docker mode: Final response payload:', { esphomeEnabled: finalResponse.esphomeEnabled });
    debugLog('[app-settings] --- End ESPHome Flag Resolution ---');
    res.json(finalResponse);
  } catch (error) {
    console.error('[app-settings] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save Docker app settings
app.post('/api/app-settings', async (req, res) => {
  try {
    const {
      liveConfigPath, backupFolderPath, textStyle, theme, esphomeEnabled, packagesEnabled,
      backupMode, fileWatchingEnabled, fileWatchingDebounce, watchedPaths
    } = req.body;

    const existingSettings = await loadDockerSettings();
    const settings = {
      liveConfigPath: liveConfigPath || existingSettings.liveConfigPath || '/config',
      backupFolderPath: backupFolderPath || existingSettings.backupFolderPath || '/media/backups/yaml',
      textStyle: textStyle || existingSettings.textStyle || 'default',
      theme: theme || existingSettings.theme || 'dark',
      esphomeEnabled: typeof esphomeEnabled === 'boolean' ? esphomeEnabled : existingSettings.esphomeEnabled ?? false,
      packagesEnabled: typeof packagesEnabled === 'boolean' ? packagesEnabled : existingSettings.packagesEnabled ?? false,
      // Git-based backup settings
      backupMode: backupMode || existingSettings.backupMode || 'folder',
      fileWatchingEnabled: typeof fileWatchingEnabled === 'boolean' ? fileWatchingEnabled : existingSettings.fileWatchingEnabled ?? false,
      fileWatchingDebounce: fileWatchingDebounce || existingSettings.fileWatchingDebounce || 60,
      watchedPaths: watchedPaths || existingSettings.watchedPaths || ['config', 'lovelace', 'esphome', 'packages']
    };

    await saveDockerSettings(settings);
    console.log('[save-docker-settings] Saved Docker app settings:', settings);
    
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('[save-docker-settings] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save Docker HA credentials (fallback when env vars not set)
app.post('/api/docker-ha-credentials', async (req, res) => {
  try {
    const { homeAssistantUrl, longLivedAccessToken } = req.body;
    
    // Only allow saving credentials in Docker mode and when env vars aren't set
    if (process.env.HOME_ASSISTANT_URL || process.env.LONG_LIVED_ACCESS_TOKEN) {
      return res.status(400).json({ error: 'HA credentials are configured via environment variables' });
    }
    
    const credentials = {
      home_assistant_url: homeAssistantUrl,
      long_lived_access_token: longLivedAccessToken
    };
    
    // Ensure data directory exists
    await fs.writeFile(path.join(DATA_DIR, 'docker-ha-credentials.json'), JSON.stringify(credentials, null, 2), 'utf-8');
    console.log('[docker-ha-credentials] Saved Docker HA credentials to', path.join(DATA_DIR, 'docker-ha-credentials.json'));
    
    res.json({ success: true, message: 'HA credentials saved successfully' });
  } catch (error) {
    console.error('[docker-ha-credentials] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// App settings endpoint (expose config to frontend, excluding sensitive data)
async function loadDockerSettings() {
  const cachedSettings = (global.dockerSettings && typeof global.dockerSettings === 'object') ? global.dockerSettings : {};
  const defaultSettings = {
    liveConfigPath: '/config',
    backupFolderPath: '/media/timemachine',
    textStyle: 'default',
    theme: process.env.THEME || 'dark',
    esphomeEnabled: false,
    packagesEnabled: false,
    // Git-based backup settings
    backupMode: 'folder', // 'git' or 'folder'
    fileWatchingEnabled: false,
    fileWatchingDebounce: 60, // seconds
    watchedPaths: ['config', 'lovelace', 'esphome', 'packages'], // paths to watch
    ...cachedSettings
  };

  try {
    const settingsPath = path.join(DATA_DIR, 'docker-app-settings.json');
    
    // Check if settings file exists
    try {
      await fs.access(settingsPath);
      const content = await fs.readFile(settingsPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Merge with defaults to ensure all fields are present
      const settings = { ...defaultSettings, ...parsed };

      // Update in-memory settings
      global.dockerSettings = settings;

      
      console.log('Loaded settings from file:', settings);
      return settings;
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('No settings file found, using defaults');
      } else {
        console.error('Error loading settings:', err);
      }
      
      // Ensure in-memory settings are set to defaults
      global.dockerSettings = defaultSettings;
      return defaultSettings;
    }
  } catch (error) {
    console.error('Error in loadDockerSettings:', error);
    // Ensure in-memory settings are set to defaults even if there's an error
    global.dockerSettings = defaultSettings;
    return defaultSettings;
  }
}

// Save Docker settings to file
async function saveDockerSettings(settings) {
  // Ensure all required fields are present with defaults
  const settingsToSave = {
    liveConfigPath: settings.liveConfigPath || '/config',
    backupFolderPath: settings.backupFolderPath || '/media/timemachine',
    textStyle: settings.textStyle || 'default',
    theme: settings.theme || 'dark',
    esphomeEnabled: settings.esphomeEnabled ?? false,
    packagesEnabled: settings.packagesEnabled ?? false,
    // Git-based backup settings
    backupMode: settings.backupMode || 'folder',
    fileWatchingEnabled: settings.fileWatchingEnabled ?? false,
    fileWatchingDebounce: settings.fileWatchingDebounce || 60,
    watchedPaths: settings.watchedPaths || ['config', 'lovelace', 'esphome', 'packages']
  };
  
  // Save to file
  const settingsPath = path.join(DATA_DIR, 'docker-app-settings.json');
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('[saveDockerSettings] Failed to ensure data directory exists:', error);
  }
  await fs.writeFile(settingsPath, JSON.stringify(settingsToSave, null, 2), 'utf-8');
  
  console.log('Settings saved successfully to', settingsPath);
  
  // Update the in-memory settings
  global.dockerSettings = settingsToSave;
  
  return settingsToSave;
}

/**
 * Initialize Git repository for backups
 */
async function initializeGitBackup() {
  try {
    const settings = await loadDockerSettings();

    if (settings.backupMode !== 'git') {
      console.log('[git] Git mode not enabled, skipping Git initialization');
      return;
    }

    const backupPath = settings.backupFolderPath || '/media/timemachine';
    console.log(`[git] Initializing Git repository at ${backupPath}`);

    gitManager = new GitManager(backupPath);
    const result = await gitManager.initGitRepo();

    if (result.success) {
      console.log(`[git] ${result.message}`);
    } else {
      console.error(`[git] Failed to initialize repository: ${result.message}`);
    }
  } catch (error) {
    console.error('[git] Error during Git initialization:', error);
  }
}

/**
 * Setup file watcher for auto-backup
 */
async function setupFileWatcher() {
  try {
    const settings = await loadDockerSettings();

    // Stop existing watcher if any
    if (fileWatcher) {
      await fileWatcher.close();
      fileWatcher = null;
      console.log('[file-watcher] Stopped existing file watcher');
    }

    // Only setup if file watching is enabled and in Git mode
    if (!settings.fileWatchingEnabled || settings.backupMode !== 'git') {
      console.log('[file-watcher] File watching not enabled or not in Git mode');
      return;
    }

    if (!gitManager) {
      console.error('[file-watcher] Git manager not initialized, cannot setup file watcher');
      return;
    }

    const liveConfigPath = settings.liveConfigPath || '/config';
    const watchedPaths = settings.watchedPaths || ['config', 'lovelace', 'esphome', 'packages'];
    const debounceTime = (settings.fileWatchingDebounce || 60) * 1000; // Convert to milliseconds

    // Build watch patterns
    const patterns = [];
    if (watchedPaths.includes('config')) {
      patterns.push(`${liveConfigPath}/*.yaml`);
      patterns.push(`${liveConfigPath}/*.yml`);
    }
    if (watchedPaths.includes('lovelace')) {
      patterns.push(`${liveConfigPath}/.storage/lovelace*`);
    }
    if (watchedPaths.includes('esphome')) {
      patterns.push(`${liveConfigPath}/esphome/**/*.yaml`);
    }
    if (watchedPaths.includes('packages')) {
      patterns.push(`${liveConfigPath}/packages/**/*.yaml`);
    }

    console.log(`[file-watcher] Setting up file watcher with ${debounceTime / 1000}s debounce`);
    console.log(`[file-watcher] Watching patterns:`, patterns);

    // Create debounced auto-backup function
    const debouncedAutoBackup = debounce(async (changedFile) => {
      console.log(`[file-watcher] Change detected: ${changedFile}`);

      try {
        // Copy changed file to Git repo
        const backupPath = settings.backupFolderPath || '/media/timemachine';
        const relativePath = path.relative(liveConfigPath, changedFile);
        const destPath = path.join(backupPath, relativePath);

        // Ensure destination directory exists
        await fs.mkdir(path.dirname(destPath), { recursive: true });

        // Copy file
        await fs.copyFile(changedFile, destPath);
        console.log(`[file-watcher] Copied ${changedFile} to ${destPath}`);

        // Create Git commit
        const result = await gitManager.performGitBackup('autosave', changedFile);
        if (result.success) {
          console.log(`[file-watcher] ${result.message} (${result.tag})`);
        } else {
          console.error(`[file-watcher] Auto-backup failed: ${result.message}`);
        }
      } catch (error) {
        console.error('[file-watcher] Error during auto-backup:', error);
      }
    }, debounceTime);

    // Setup file watcher
    fileWatcher = chokidar.watch(patterns, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles except .storage
      persistent: true,
      ignoreInitial: true, // Don't trigger on initial scan
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait 1s for file to stabilize
        pollInterval: 100
      }
    });

    fileWatcher
      .on('change', debouncedAutoBackup)
      .on('add', debouncedAutoBackup)
      .on('error', error => console.error('[file-watcher] Watcher error:', error));

    console.log('[file-watcher] File watcher started successfully');
  } catch (error) {
    console.error('[file-watcher] Error setting up file watcher:', error);
  }
}

const SKIP_BACKUP_DIRS = new Set(['esphome', '.storage', 'packages']);

// Recursive function to find backup directories
async function getBackupDirs(dir, depth = 0) {
  let results = [];
  const indent = '  '.repeat(depth);
  
  try {
    const list = await fs.readdir(dir, { withFileTypes: true });
    
    for (const dirent of list) {
      const fullPath = path.resolve(dir, dirent.name);
      if (dirent.isDirectory()) {
        // Skip known non-backup directories
        if (SKIP_BACKUP_DIRS.has(dirent.name)) {
          continue;
        }
        const name = dirent.name;
        const dashedPattern = /^\d{4}-\d{2}-\d{2}-\d{6}$/;
        const numericPattern = /^\d{12}$/;
        let isBackupFolder = dashedPattern.test(name) || numericPattern.test(name);

        // Fallback: if folder contains common YAML backup files, treat as backup folder
        if (!isBackupFolder) {
          try {
            const inner = await fs.readdir(fullPath);
            const hasYaml = inner.some(f => f.endsWith('.yaml') || f.endsWith('.yml'));
            const hasKnownFiles = inner.includes('automations.yaml') || inner.includes('scripts.yaml');
            if (hasYaml || hasKnownFiles) {
              isBackupFolder = true;
            }
          } catch (err) {
            // Skip directories we can't read
          }
        }

        if (isBackupFolder) {
          results.push({ path: fullPath, folderName: name });
        }

        // Continue scanning deeper regardless to support nested structures like /year/month/backup
        try {
          const nestedResults = await getBackupDirs(fullPath, depth + 1);
          results = results.concat(nestedResults);
        } catch (err) {
          // Skip directories we can't read
        }
      }
    }
  } catch (error) {
    console.error(`${indent}[scan-backups] Error reading ${dir}:`, error.message);
  }
  
  return results.filter(result => !SKIP_BACKUP_DIRS.has(path.basename(result.path)));
}

// Scan backups
app.post('/api/scan-backups', async (req, res) => {
  try {
    // Accept backupRootPath from request body or use default
    const backupRootPath = req.body?.backupRootPath || '/media/timemachine';
    console.log('[scan-backups] Scanning backup directory:', backupRootPath);

    // Basic security check
    if (backupRootPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // Check if Git mode is enabled
    const settings = await loadDockerSettings();
    const backupMode = settings.backupMode || 'folder';

    if (backupMode === 'git') {
      // Git mode: List commits instead of folders
      console.log('[scan-backups] Using Git mode to list backups');

      if (!gitManager) {
        return res.status(500).json({ error: 'Git manager not initialized' });
      }

      const commits = await gitManager.listGitCommits();

      // Transform commits to match the expected backup format
      const backups = commits.map(commit => ({
        hash: commit.hash,
        folderName: commit.message, // Use message as display name
        date: commit.date,
        type: commit.type, // 'scheduled' or 'autosave'
        tags: commit.tags,
        // For backwards compatibility with frontend expecting 'path'
        path: commit.hash
      }));

      console.log('[scan-backups] Found Git commits:', backups.length);
      return res.json({ backups, mode: 'git' });
    }

    // Folder mode: Traditional backup scanning
    console.log('[scan-backups] Using folder mode to list backups');
    const backups = await getBackupDirs(backupRootPath);

    // Sort descending to show newest first
    backups.sort((a, b) => b.folderName.localeCompare(a.folderName));

    console.log('[scan-backups] Found backups:', backups.length);
    res.json({ backups, mode: 'folder' });
  } catch (error) {
    console.error('[scan-backups] Error:', error);
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        error: `Directory not found: ${error.path}`,
        code: 'DIR_NOT_FOUND'
      });
    }
    res.status(500).json({ error: 'Failed to scan backup directory.', details: error.message });
  }
});

// Get Git diff for a commit
app.post('/api/git-diff', async (req, res) => {
  try {
    const { commitHash, filePath } = req.body;

    if (!commitHash) {
      return res.status(400).json({ error: 'Commit hash is required' });
    }

    const settings = await loadDockerSettings();
    const backupMode = settings.backupMode || 'folder';

    if (backupMode !== 'git') {
      return res.status(400).json({ error: 'Git mode is not enabled' });
    }

    if (!gitManager) {
      return res.status(500).json({ error: 'Git manager not initialized' });
    }

    console.log(`[git-diff] Getting diff for commit ${commitHash}, file: ${filePath || 'all'}`);
    const result = await gitManager.getGitDiff(commitHash, filePath);

    if (result.success) {
      res.json({ diff: result.diff });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error) {
    console.error('[git-diff] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get files in a specific Git commit
app.post('/api/git-files', async (req, res) => {
  try {
    const { commitHash } = req.body;

    if (!commitHash) {
      return res.status(400).json({ error: 'Commit hash is required' });
    }

    const settings = await loadDockerSettings();
    const backupMode = settings.backupMode || 'folder';

    if (backupMode !== 'git') {
      return res.status(400).json({ error: 'Git mode is not enabled' });
    }

    if (!gitManager) {
      return res.status(500).json({ error: 'Git manager not initialized' });
    }

    console.log(`[git-files] Getting files for commit ${commitHash}`);
    const files = await gitManager.getFilesInCommit(commitHash);

    res.json({ files });
  } catch (error) {
    console.error('[git-files] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get backup automations
app.post('/api/get-backup-automations', async (req, res) => {
  try {
    const { backupPath } = req.body;

    // Check if Git mode is enabled
    const settings = await loadDockerSettings();
    const backupMode = settings.backupMode || 'folder';

    let content;

    if (backupMode === 'git') {
      // In Git mode, backupPath is actually a commit hash
      const commitHash = backupPath;
      console.log(`[get-backup-automations] Reading from Git commit: ${commitHash}`);

      if (!gitManager) {
        return res.status(500).json({ error: 'Git manager not initialized' });
      }

      // Use git show to read file content from commit
      content = await gitManager.git.show([`${commitHash}:automations.yaml`]);
    } else {
      // Folder mode: Read from file system
      const automationsFile = path.join(backupPath, 'automations.yaml');
      content = await fs.readFile(automationsFile, 'utf-8');
    }

    const automations = yaml.load(content) || [];
    res.json({ automations });
  } catch (error) {
    console.error('[get-backup-automations] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get backup scripts
app.post('/api/get-backup-scripts', async (req, res) => {
  try {
    const { backupPath } = req.body;

    // Check if Git mode is enabled
    const settings = await loadDockerSettings();
    const backupMode = settings.backupMode || 'folder';

    let content;

    if (backupMode === 'git') {
      // In Git mode, backupPath is actually a commit hash
      const commitHash = backupPath;
      console.log(`[get-backup-scripts] Reading from Git commit: ${commitHash}`);

      if (!gitManager) {
        return res.status(500).json({ error: 'Git manager not initialized' });
      }

      // Use git show to read file content from commit
      content = await gitManager.git.show([`${commitHash}:scripts.yaml`]);
    } else {
      // Folder mode: Read from file system
      const scriptsFile = path.join(backupPath, 'scripts.yaml');
      content = await fs.readFile(scriptsFile, 'utf-8');
    }

    const scriptsObject = yaml.load(content);

    // Scripts are stored as a dictionary/object, not an array
    // Transform: { script_id: { alias: '...', sequence: [...] } }
    // Into: [{ id: 'script_id', alias: '...', sequence: [...] }]
    let scripts = [];
    if (scriptsObject && typeof scriptsObject === 'object' && !Array.isArray(scriptsObject)) {
      scripts = Object.keys(scriptsObject).map(scriptId => ({
        id: scriptId,
        ...scriptsObject[scriptId]
      }));
    } else if (Array.isArray(scriptsObject)) {
      // Fallback for array format (shouldn't happen)
      scripts = scriptsObject;
    }

    res.json({ scripts });
  } catch (error) {
    console.error('[get-backup-scripts] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get live items (automations or scripts)
app.post('/api/get-live-items', async (req, res) => {
  try {
    const { itemIdentifiers, mode, liveConfigPath } = req.body;
    const configPath = liveConfigPath || '/config';
    const fileName = mode === 'automations' ? 'automations.yaml' : 'scripts.yaml';
    const filePath = path.join(configPath, fileName);
    
    const content = await fs.readFile(filePath, 'utf-8');
    let allItems = yaml.load(content) || [];
    
    // Handle scripts dictionary format
    if (mode === 'scripts' && typeof allItems === 'object' && !Array.isArray(allItems)) {
      allItems = Object.keys(allItems).map(scriptId => ({
        id: scriptId,
        ...allItems[scriptId]
      }));
    }
    
    const liveItems = {};
    itemIdentifiers.forEach(identifier => {
      const item = allItems.find(i => (i.id === identifier || i.alias === identifier));
      if (item) {
        liveItems[identifier] = item;
      }
    });
    
    res.json({ liveItems });
  } catch (error) {
    console.error('[get-live-items] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get live automation
app.post('/api/get-live-automation', async (req, res) => {
  try {
    const { automationIdentifier, liveConfigPath } = req.body;
    const configPath = liveConfigPath || '/config';
    const filePath = path.join(configPath, 'automations.yaml');
    const content = await fs.readFile(filePath, 'utf-8');
    const automations = yaml.load(content) || [];
    const automation = automations.find(a => a.id === automationIdentifier || a.alias === automationIdentifier);
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    res.json({ automation });
  } catch (error) {
    console.error('[get-live-automation] Error:', error);
    res.status(404).json({ error: error.message });
  }
});

// Get live script
app.post('/api/get-live-script', async (req, res) => {
  try {
    const { automationIdentifier, liveConfigPath } = req.body;
    const configPath = liveConfigPath || '/config';
    const filePath = path.join(configPath, 'scripts.yaml');
    const content = await fs.readFile(filePath, 'utf-8');
    const scripts = yaml.load(content) || [];
    const script = scripts.find(s => s.id === automationIdentifier || s.alias === automationIdentifier);
    
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }
    
    res.json({ script });
  } catch (error) {
    console.error('[get-live-script] Error:', error);
    res.status(404).json({ error: error.message });
  }
});

// Restore automation
app.post('/api/restore-automation', async (req, res) => {
  try {
    const { automationObject, timezone, liveConfigPath } = req.body;
    // Perform a backup before restoring
    await performBackup(liveConfigPath || null, null, 'pre-restore', false, 100, timezone);

    const configPath = liveConfigPath || '/config';
    const filePath = path.join(configPath, 'automations.yaml');
    
    let automations = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      automations = yaml.load(content) || [];
    } catch (err) {
      // File doesn't exist, start with empty array
    }
    
    // Remove existing automation with same ID/alias
    automations = automations.filter(a => 
      a.id !== automationObject.id && a.alias !== automationObject.alias
    );
    
    // Add restored automation
    automations.push(automationObject);
    
    // Write back to file
    const newContent = yaml.dump(automations);
    await fs.writeFile(filePath, newContent, 'utf-8');
    
    res.json({ success: true, message: 'Automation restored successfully' });
  } catch (error) {
    console.error('[restore-automation] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Restore script
app.post('/api/restore-script', async (req, res) => {
  try {
    const { scriptObject, timezone, liveConfigPath } = req.body;
    // Perform a backup before restoring
    await performBackup(liveConfigPath || null, null, 'pre-restore', false, 100, timezone);

    const configPath = liveConfigPath || '/config';
    const filePath = path.join(configPath, 'scripts.yaml');
    
    let scripts = [];
    let originalIsObject = false;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const loadedScripts = yaml.load(content);
      if (loadedScripts && typeof loadedScripts === 'object' && !Array.isArray(loadedScripts)) {
        originalIsObject = true;
        scripts = Object.keys(loadedScripts).map(scriptId => ({
          id: scriptId,
          ...loadedScripts[scriptId]
        }));
      } else if (Array.isArray(loadedScripts)) {
        scripts = loadedScripts;
      }
    } catch (err) {
      // File doesn't exist, start with empty array
    }
    
    // Remove existing script with same ID/alias
    scripts = scripts.filter(s => 
      s.id !== scriptObject.id && s.alias !== scriptObject.alias
    );
    
    // Add restored script
    scripts.push(scriptObject);
    
    let newContent;
    if (originalIsObject) {
      // Convert back to object format if original was an object
      const scriptsObject = {};
      scripts.forEach(s => {
        const id = s.id || s.alias;
        if (id) {
          const { id: _, ...rest } = s; // Remove the 'id' property if it was added during conversion
          scriptsObject[id] = rest;
        }
      });
      newContent = yaml.dump(scriptsObject);
    } else {
      newContent = yaml.dump(scripts);
    }
    
    await fs.writeFile(filePath, newContent, 'utf-8');
    
    res.json({ success: true, message: 'Script restored successfully' });
  } catch (error) {
    console.error('[restore-script] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reload Home Assistant
app.post('/api/reload-home-assistant', async (req, res) => {
  try {
    const { service } = req.body;
    
    if (!service) {
      return res.status(400).json({ error: 'Missing required parameter: service' });
    }

    const auth = await getHomeAssistantAuth();

    if (!auth.baseUrl || !auth.token) {
      return res.status(400).json({ error: 'Home Assistant access is not configured for this environment.' });
    }

    const serviceUrl = `${auth.baseUrl}/services/${service.replace('.', '/')}`;
    const headers = {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (auth.source === 'supervisor') {
      headers['X-Supervisor-Token'] = auth.token;
    }
    
    // Make async call to HA (don't wait for response)
    fetch(serviceUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    }).catch(err => console.error('[reload-home-assistant] Background error:', err));
    
    res.json({ message: 'Home Assistant reload initiated successfully' });
  } catch (error) {
    console.error('[reload-home-assistant] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to check if directory contains backups (recursively)
async function hasBackupsRecursive(dir, depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return false;
  
  try {
    const list = await fs.readdir(dir, { withFileTypes: true });
    
    // Check for YAML files in current directory
    const hasYaml = list.some(item => !item.isDirectory() && (item.name.endsWith('.yaml') || item.name.endsWith('.yml')));
    if (hasYaml) return true;
    
    // Check for backup-pattern directories
    const hasBackupPattern = list.some(item => {
      if (!item.isDirectory()) return false;
      const name = item.name;
      return /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(name) || /^\d{12}$/.test(name);
    });
    if (hasBackupPattern) return true;
    
    // Recursively check subdirectories
    for (const item of list) {
      if (item.isDirectory()) {
        const fullPath = path.resolve(dir, item.name);
        const hasNested = await hasBackupsRecursive(fullPath, depth + 1, maxDepth);
        if (hasNested) return true;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

// Validate backup path
app.post('/api/validate-backup-path', async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    
    if (!folderPath) {
      return res.status(400).json({ isValid: false, error: 'Path is required' });
    }
    
    const stats = await fs.stat(folderPath);
    
    if (!stats.isDirectory()) {
      return res.status(400).json({ isValid: false, error: 'Provided path is not a directory' });
    }
    
    // Check recursively for backups or YAML files
    const hasBackups = await hasBackupsRecursive(folderPath);
    
    if (!hasBackups) {
      return res.status(400).json({ 
        isValid: false, 
        error: 'No backup folders or YAML files found in directory tree (searched 5 levels deep)' 
      });
    }
    
    res.json({ isValid: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(400).json({ isValid: false, error: 'Directory does not exist' });
    }
    if (error.code === 'EACCES') {
      return res.status(400).json({ isValid: false, error: 'Permission denied - cannot access directory' });
    }
    res.status(500).json({ isValid: false, error: error.message });
  }
});

// Test Home Assistant connection
app.post('/api/test-home-assistant-connection', async (req, res) => {
  try {
    // Allow overriding with request body for testing before saving (Docker mode)
    const providedHaUrl = req.body.haUrl;
    const providedHaToken = req.body.haToken;

    const manualOverride = (providedHaUrl && providedHaToken)
      ? { haUrl: providedHaUrl, haToken: providedHaToken }
      : null;

    const auth = await getHomeAssistantAuth(null, manualOverride);

    if (!auth.baseUrl || !auth.token) {
      res.status(400).json({ success: false, message: 'Home Assistant access is not configured. For Docker deployments without ingress, supply a URL and long-lived token.' });
      return;
    }
    
    const headers = {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (auth.source === 'supervisor') {
      headers['X-Supervisor-Token'] = auth.token;
    }

    const endpoint = `${auth.baseUrl}/states`;
    const fetchOptions = { headers };
    let tlsFallbackUsed = false;
    let response;

    try {
      response = await fetch(endpoint, fetchOptions);
    } catch (fetchError) {
      if (auth.baseUrl.startsWith('https://') && isTlsCertificateError(fetchError)) {
        tlsFallbackUsed = true;
        console.warn('[test-connection] TLS verification failed, retrying with relaxed validation:', {
          endpoint,
          code: fetchError.code,
          message: fetchError.message,
          causeCode: fetchError.cause?.code,
        });
        const insecureAgent = new https.Agent({ rejectUnauthorized: false });
        response = await fetch(endpoint, { ...fetchOptions, agent: insecureAgent });
      } else {
        throw fetchError;
      }
    }
    
    if (response.ok) {
      res.json({
        success: true,
        message: 'Connected to Home Assistant successfully.',
        authMode: auth.source,
        tlsFallback: tlsFallbackUsed ? 'insecure' : 'strict',
      });
    } else {
      const errorText = await response.text();
      console.error('[test-connection] HA response error', {
        status: response.status,
        authMode: auth.source,
        baseUrl: auth.baseUrl,
        errorText,
      });
      res.status(response.status).json({ 
        success: false, 
        message: `Connection failed: ${response.status} - ${errorText}`,
        tlsFallback: tlsFallbackUsed ? 'insecure' : 'strict',
      });
    }
  } catch (error) {
    console.error('[test-connection] Error:', error);
    res.status(500).json({ success: false, message: `Connection failed: ${error.message}` });
  }
});

// Schedule backup endpoints
let scheduledJobs = {};
const SCHEDULE_FILE = path.join(DATA_DIR, 'scheduled-jobs.json');

// Load scheduled jobs from file
async function loadScheduledJobs() {
  try {
    const content = await fs.readFile(SCHEDULE_FILE, 'utf-8');
    const data = JSON.parse(content);
    
    // Normalize: ensure we only have { jobs: {...} } structure
    // Remove any legacy top-level job keys
    if (!data.jobs) {
      data.jobs = {};
    }
    
    // Clean up: return only the jobs wrapper
    return { jobs: data.jobs };
  } catch (error) {
    return { jobs: {} };
  }
}

// Save scheduled jobs to file
async function saveScheduledJobs(jobs) {
  await fs.writeFile(SCHEDULE_FILE, JSON.stringify(jobs, null, 2));
}

// Get schedule
app.get('/api/schedule-backup', async (req, res) => {
  try {
    const jobs = await loadScheduledJobs();
    res.json(jobs);
  } catch (error) {
    console.error('[get-schedule] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set schedule
app.post('/api/schedule-backup', async (req, res) => {
  try {
    const { id, cronExpression, enabled, timezone, liveConfigPath, backupFolderPath, maxBackupsEnabled, maxBackupsCount } = req.body;
    
    const jobs = await loadScheduledJobs();
    jobs.jobs = jobs.jobs || {};
    jobs.jobs[id] = { cronExpression, enabled, timezone, liveConfigPath, backupFolderPath, maxBackupsEnabled, maxBackupsCount };
    console.log('[scheduler] New schedule saved:', jobs.jobs[id]);
    
    // Clean structure: only save { jobs: {...} }
    const cleanJobs = { jobs: jobs.jobs };
    await saveScheduledJobs(cleanJobs);
    
    // Stop existing cron job if any
    if (scheduledJobs[id]) {
      scheduledJobs[id].stop();
      delete scheduledJobs[id];
    }
    
    // Start new cron job if enabled
    const jobConfig = jobs.jobs[id];
    if (enabled) {
      console.log(`[scheduler] Setting up schedule "${id}" with cron "${cronExpression}" and timezone "${timezone}"`);
      scheduledJobs[id] = cron.schedule(cronExpression, async () => {
        console.log(`[cron] Triggered backup job: ${id} at ${new Date().toISOString()}`);
        try {
          const effectiveLivePath = jobConfig.liveConfigPath || '/config';
          const effectiveBackupPath = jobConfig.backupFolderPath || '/media/timemachine';
          console.log(`[cron] Using live path "${effectiveLivePath}" and backup path "${effectiveBackupPath}".`);
          try {
            const response = await fetch(`http://localhost:${PORT}/api/backup-now`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                liveConfigPath: effectiveLivePath,
                backupFolderPath: effectiveBackupPath,
                maxBackupsEnabled: jobConfig.maxBackupsEnabled,
                maxBackupsCount: jobConfig.maxBackupsCount,
                timezone: jobConfig.timezone
              })
            });
            const result = await response.json();
            if (response.ok) {
              console.log(`[cron] Backup triggered successfully: ${result.message}`);
            } else {
              console.error(`[cron] Backup trigger failed: ${result.error}`);
            }
          } catch (error) {
            console.error(`[cron] Error triggering backup:`, error);
          }
        } catch (error) {
          console.error(`[cron] Error during scheduled backup for job ${id}:`, error);
        }
      }, { timezone });
    }
    
    res.json({ success: true, message: 'Schedule updated successfully' });
  } catch (error) {
    console.error('[set-schedule] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate path
app.post('/api/validate-path', async (req, res) => {
  try {
    const { path: requestedPath, type } = req.body;

    if (!requestedPath) {
      return res.json({ errorCode: 'directory_not_found' });
    }

    try {
      const stats = await fs.stat(requestedPath);
      if (!stats.isDirectory()) {
        return res.json({ errorCode: 'not_directory', path: requestedPath });
      }

      if (type === 'live') {
        const automationsPath = `${requestedPath}/automations.yaml`;
        try {
          await fs.access(automationsPath);
        } catch (err) {
          if (err.code === 'ENOENT') {
            return res.json({ errorCode: 'missing_automations', path: requestedPath });
          }
          return res.json({ errorCode: 'cannot_access', path: requestedPath, details: err.message });
        }
      }

      return res.json({ success: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.json({ errorCode: 'directory_not_found', path: requestedPath });
      }
      return res.json({ errorCode: 'cannot_access', path: requestedPath, details: err.message });
    }
  } catch (error) {
    console.error('[validate-path] Error:', error);
    res.status(500).json({ error: error.message, errorCode: 'unknown' });
  }
});

/**
 * Perform Git-based backup
 */
async function performGitBackup(configPath, backupRoot, source, maxBackupsEnabled, maxBackupsCount) {
  console.log(`[backup-git-${source}] Starting Git-based backup...`);

  if (!gitManager) {
    console.error('[backup-git] GitManager not initialized!');
    throw new Error('Git manager not initialized. Please check configuration.');
  }

  const esphomeEnabled = await isEsphomeEnabled();
  const packagesEnabled = await isPackagesEnabled();

  // Step 1: Copy files from /config to Git repository
  console.log(`[backup-git-${source}] Syncing files to Git repository...`);

  // Copy YAML files from config root
  const files = await fs.readdir(configPath);
  const yamlFiles = files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
  console.log(`[backup-git-${source}] Found ${yamlFiles.length} YAML files to sync.`);

  let copiedYamlCount = 0;
  for (const file of yamlFiles) {
    const sourcePath = path.join(configPath, file);
    const destPath = path.join(backupRoot, file);
    try {
      await fs.copyFile(sourcePath, destPath);
      copiedYamlCount++;
    } catch (err) {
      console.error(`[backup-git-${source}] Error copying ${file}:`, err.message);
    }
  }
  console.log(`[backup-git-${source}] Synced ${copiedYamlCount} of ${yamlFiles.length} YAML files.`);

  // Copy Lovelace files
  const storagePath = path.join(configPath, '.storage');
  const backupStoragePath = path.join(backupRoot, '.storage');
  await fs.mkdir(backupStoragePath, { recursive: true });

  try {
    const storageFiles = await fs.readdir(storagePath);
    const lovelaceFiles = storageFiles.filter(file => file.startsWith('lovelace'));
    console.log(`[backup-git-${source}] Found ${lovelaceFiles.length} Lovelace files to sync.`);

    let copiedLovelaceCount = 0;
    for (const file of lovelaceFiles) {
      const sourcePath = path.join(storagePath, file);
      const destPath = path.join(backupStoragePath, file);
      try {
        await fs.copyFile(sourcePath, destPath);
        copiedLovelaceCount++;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`[backup-git-${source}] Error copying Lovelace file ${file}:`, err.message);
        }
      }
    }
    console.log(`[backup-git-${source}] Synced ${copiedLovelaceCount} of ${lovelaceFiles.length} Lovelace files.`);
  } catch (err) {
    console.error(`[backup-git-${source}] Error reading .storage directory:`, err.message);
  }

  // Copy ESPHome files if enabled
  if (esphomeEnabled) {
    const esphomePath = path.join(configPath, 'esphome');
    const backupEsphomePath = path.join(backupRoot, 'esphome');

    try {
      await fs.mkdir(backupEsphomePath, { recursive: true });
      const esphomeYamlFiles = await listYamlFilesRecursive(esphomePath);
      console.log(`[backup-git-${source}] Found ${esphomeYamlFiles.length} ESPHome YAML files to sync.`);

      let copiedEsphomeCount = 0;
      for (const relativePath of esphomeYamlFiles) {
        const sourcePath = path.join(esphomePath, relativePath);
        const destPath = path.join(backupEsphomePath, relativePath);
        try {
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(sourcePath, destPath);
          copiedEsphomeCount++;
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.error(`[backup-git-${source}] Error copying ESPHome file ${relativePath}:`, err.message);
          }
        }
      }
      console.log(`[backup-git-${source}] Synced ${copiedEsphomeCount} of ${esphomeYamlFiles.length} ESPHome YAML files.`);
    } catch (err) {
      console.error(`[backup-git-${source}] Error reading esphome directory:`, err.message);
    }
  } else {
    console.log(`[backup-git-${source}] Skipping ESPHome backups (feature disabled).`);
  }

  // Copy Packages files if enabled
  if (packagesEnabled) {
    const packagesPath = path.join(configPath, 'packages');
    const backupPackagesPath = path.join(backupRoot, 'packages');

    try {
      await fs.mkdir(backupPackagesPath, { recursive: true });
      const packagesYamlFiles = await listYamlFilesRecursive(packagesPath);
      console.log(`[backup-git-${source}] Found ${packagesYamlFiles.length} Packages YAML files to sync.`);

      let copiedPackagesCount = 0;
      for (const relativePath of packagesYamlFiles) {
        const sourcePath = path.join(packagesPath, relativePath);
        const destPath = path.join(backupPackagesPath, relativePath);
        try {
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(sourcePath, destPath);
          copiedPackagesCount++;
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.error(`[backup-git-${source}] Error copying Packages file ${relativePath}:`, err.message);
          }
        }
      }
      console.log(`[backup-git-${source}] Synced ${copiedPackagesCount} of ${packagesYamlFiles.length} Packages YAML files.`);
    } catch (err) {
      console.error(`[backup-git-${source}] Error reading packages directory:`, err.message);
    }
  } else {
    console.log(`[backup-git-${source}] Skipping Packages backups (feature disabled).`);
  }

  // Step 2: Create Git commit
  const backupType = source === 'manual' || source === 'scheduled' ? 'scheduled' : 'scheduled';
  const result = await gitManager.performGitBackup(backupType, null);

  if (!result.success) {
    console.error(`[backup-git-${source}] Git backup failed: ${result.message}`);
    throw new Error(result.message);
  }

  console.log(`[backup-git-${source}] Git backup completed successfully: ${result.message}`);

  // Step 3: Cleanup old backups if enabled
  if (maxBackupsEnabled && maxBackupsCount > 0) {
    try {
      console.log(`[backup-git-${source}] Cleaning up old backups, keeping max ${maxBackupsCount}...`);
      const cleanupResult = await gitManager.cleanupGitBackups(maxBackupsCount);
      if (cleanupResult.success) {
        console.log(`[backup-git-${source}] ${cleanupResult.message}`);
      }
    } catch (cleanupError) {
      console.error(`[backup-git-${source}] Error during cleanup:`, cleanupError.message);
      // Don't fail the backup if cleanup fails
    }
  }

  return backupRoot; // Return repo path instead of timestamped folder
}

// Reusable backup function
async function performBackup(liveConfigPath, backupFolderPath, source = 'manual', maxBackupsEnabled = false, maxBackupsCount = 100, timezone = null) {
  const configPath = liveConfigPath || '/config';
  const backupRoot = backupFolderPath || '/media/timemachine';

  console.log(`[backup-${source}] Starting backup...`);
  console.log(`[backup-${source}] Config path:`, configPath);
  console.log(`[backup-${source}] Backup root:`, backupRoot);
  console.log(`[backup-${source}] Max backups enabled:`, maxBackupsEnabled, 'count:', maxBackupsCount);

  try {
    // Check if backup root exists and is writable
    await fs.access(backupRoot, fs.constants.R_OK | fs.constants.W_OK);
    console.log(`[backup-${source}] Backup root is accessible and writable`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        await fs.mkdir(backupRoot, { recursive: true });
        console.log(`[backup-${source}] Backup root did not exist. Created: ${backupRoot}`);
        // Verify access after creation
        await fs.access(backupRoot, fs.constants.R_OK | fs.constants.W_OK);
      } catch (mkdirErr) {
        console.error(`[backup-${source}] Failed to create backup root:`, mkdirErr.message);
        const createError = new Error('backup_dir_create_failed');
        createError.code = 'BACKUP_DIR_CREATE_FAILED';
        createError.meta = { path: backupRoot };
        throw createError;
      }
    } else {
      console.error(`[backup-${source}] Backup root access check failed:`, err.message);
      const accessError = new Error('backup_dir_unwritable');
      accessError.code = 'BACKUP_DIR_UNWRITABLE';
      accessError.meta = { path: backupRoot };
      throw accessError;
    }
  }

  // Check backup mode - Git or traditional folder-based
  const settings = await loadDockerSettings();
  const backupMode = settings.backupMode || 'folder';

  if (backupMode === 'git') {
    return await performGitBackup(configPath, backupRoot, source, maxBackupsEnabled, maxBackupsCount);
  }

  // Traditional folder-based backup continues below...

  // Create backup folder with timestamp
  let now = new Date();
  let YYYY, MM, DD, HH, mm, ss;
  
  if (timezone) {
    // Use the specified timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    YYYY = parts.find(p => p.type === 'year').value;
    MM = parts.find(p => p.type === 'month').value;
    DD = parts.find(p => p.type === 'day').value;
    HH = parts.find(p => p.type === 'hour').value;
    mm = parts.find(p => p.type === 'minute').value;
    ss = parts.find(p => p.type === 'second').value;
  } else {
    // Use server's local time (fallback)
    YYYY = String(now.getFullYear());
    MM = String(now.getMonth() + 1).padStart(2, '0');
    DD = String(now.getDate()).padStart(2, '0');
    HH = String(now.getHours()).padStart(2, '0');
    mm = String(now.getMinutes()).padStart(2, '0');
    ss = String(now.getSeconds()).padStart(2, '0');
  }
  
  const timestamp = `${YYYY}-${MM}-${DD}-${HH}${mm}${ss}`;
  
  const backupPath = path.join(backupRoot, YYYY, MM, timestamp);
  console.log(`[backup-${source}] Creating directory:`, backupPath);
  
  try {
    await fs.mkdir(backupPath, { recursive: true });
    console.log(`[backup-${source}] Directory created successfully`);
  } catch (err) {
    console.error(`[backup-${source}] Failed to create directory:`, err);
    const mkdirError = new Error('backup_dir_create_failed');
    mkdirError.code = 'BACKUP_DIR_CREATE_FAILED';
    mkdirError.meta = { path: backupPath, parent: backupRoot };
    throw mkdirError;
  }

  // Copy YAML files
  const files = await fs.readdir(configPath);
  const yamlFiles = files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
  console.log(`[backup-${source}] Found ${yamlFiles.length} YAML files to copy.`);
  
  let copiedYamlCount = 0;
  for (const file of yamlFiles) {
    const sourcePath = path.join(configPath, file);
    const destPath = path.join(backupPath, file);
    try {
      await fs.copyFile(sourcePath, destPath);
      copiedYamlCount++;
    } catch (err) {
      console.error(`[backup-${source}] Error copying ${file}:`, err.message);
    }
  }
  console.log(`[backup-${source}] Copied ${copiedYamlCount} of ${yamlFiles.length} YAML files.`);

  // Backup Lovelace files
  const storagePath = path.join(configPath, '.storage');
  const backupStoragePath = path.join(backupPath, '.storage');
  await fs.mkdir(backupStoragePath, { recursive: true });

  try {
    const storageFiles = await fs.readdir(storagePath);
    const lovelaceFiles = storageFiles.filter(file => file.startsWith('lovelace'));
    console.log(`[backup-${source}] Found ${lovelaceFiles.length} Lovelace files to copy.`);
    
    let copiedLovelaceCount = 0;
    for (const file of lovelaceFiles) {
      const sourcePath = path.join(storagePath, file);
      const destPath = path.join(backupStoragePath, file);
      try {
        await fs.copyFile(sourcePath, destPath);
        copiedLovelaceCount++;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`[backup-${source}] Error copying Lovelace file ${file}:`, err.message);
        }
      }
    }
    console.log(`[backup-${source}] Copied ${copiedLovelaceCount} of ${lovelaceFiles.length} Lovelace files.`);
  } catch (err) {
    console.error(`[backup-${source}] Error reading .storage directory:`, err.message);
  }

  const esphomeEnabled = await isEsphomeEnabled();
  const packagesEnabled = await isPackagesEnabled();

  if (esphomeEnabled) {
    // Backup ESPHome files
    const esphomePath = path.join(configPath, 'esphome');
    const backupEsphomePath = path.join(backupPath, 'esphome');

    try {
      await fs.mkdir(backupEsphomePath, { recursive: true });
      const esphomeYamlFiles = await listYamlFilesRecursive(esphomePath);
      console.log(`[backup-${source}] Found ${esphomeYamlFiles.length} ESPHome YAML files to copy.`);

      let copiedEsphomeCount = 0;
      for (const relativePath of esphomeYamlFiles) {
        const sourcePath = path.join(esphomePath, relativePath);
        const destPath = path.join(backupEsphomePath, relativePath);
        try {
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(sourcePath, destPath);
          copiedEsphomeCount++;
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.error(`[backup-${source}] Error copying ESPHome file ${relativePath}:`, err.message);
          }
        }
      }
      console.log(`[backup-${source}] Copied ${copiedEsphomeCount} of ${esphomeYamlFiles.length} ESPHome YAML files.`);
    } catch (err) {
      console.error(`[backup-${source}] Error reading esphome directory:`, err.message);
    }
  } else {
    console.log(`[backup-${source}] Skipping ESPHome backups (feature disabled).`);
  }
  
  if (packagesEnabled) {
    // Backup Packages files
    const packagesPath = path.join(configPath, 'packages');
    const backupPackagesPath = path.join(backupPath, 'packages');

    try {
      await fs.mkdir(backupPackagesPath, { recursive: true });
      const packagesYamlFiles = await listYamlFilesRecursive(packagesPath);
      console.log(`[backup-${source}] Found ${packagesYamlFiles.length} Packages YAML files to copy.`);

      let copiedPackagesCount = 0;
      for (const relativePath of packagesYamlFiles) {
        const sourcePath = path.join(packagesPath, relativePath);
        const destPath = path.join(backupPackagesPath, relativePath);
        try {
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(sourcePath, destPath);
          copiedPackagesCount++;
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.error(`[backup-${source}] Error copying Packages file ${relativePath}:`, err.message);
          }
        }
      }
      console.log(`[backup-${source}] Copied ${copiedPackagesCount} of ${packagesYamlFiles.length} Packages YAML files.`);
    } catch (err) {
      console.error(`[backup-${source}] Error reading packages directory:`, err.message);
    }
  } else {
    console.log(`[backup-${source}] Skipping Packages backups (feature disabled).`);
  }
  
  console.log(`[backup-${source}] Backup completed successfully at:`, backupPath);

  // Cleanup old backups if maxBackups is enabled
  if (maxBackupsEnabled && maxBackupsCount > 0) {
    try {
      console.log(`[backup-${source}] Cleaning up old backups, keeping max ${maxBackupsCount}...`);
      await cleanupOldBackups(backupRoot, maxBackupsCount);
    } catch (cleanupError) {
      console.error(`[backup-${source}] Error during cleanup:`, cleanupError.message);
      // Don't fail the backup if cleanup fails
    }
  }

  return backupPath;
}

// Cleanup old backups function
async function cleanupOldBackups(backupRoot, maxBackupsCount) {
  try {
    console.log(`[cleanup] Scanning backup directory: ${backupRoot}`);
    const allBackups = await getBackupDirs(backupRoot);
    
    // Sort by folderName descending (newest first)
    allBackups.sort((a, b) => b.folderName.localeCompare(a.folderName));
    
    console.log(`[cleanup] Found ${allBackups.length} total backups, keeping max ${maxBackupsCount}`);
    
    if (allBackups.length <= maxBackupsCount) {
      console.log(`[cleanup] No cleanup needed - only ${allBackups.length} backups exist`);
      return;
    }
    
    // Get backups to delete (all beyond maxBackupsCount)
    const backupsToDelete = allBackups.slice(maxBackupsCount);
    console.log(`[cleanup] Will delete ${backupsToDelete.length} old backups`);
    
    for (const backup of backupsToDelete) {
      try {
        console.log(`[cleanup] Deleting old backup: ${backup.path}`);
        await fs.rm(backup.path, { recursive: true, force: true });
        console.log(`[cleanup] Successfully deleted: ${backup.path}`);
      } catch (deleteError) {
        console.error(`[cleanup] Error deleting ${backup.path}:`, deleteError.message);
        // Continue with other deletions even if one fails
      }
    }
    
    console.log(`[cleanup] Cleanup completed. Kept ${Math.min(allBackups.length, maxBackupsCount)} backups.`);
  } catch (error) {
    console.error('[cleanup] Error during cleanup:', error.message);
    throw error;
  }
}

// Backup now
app.post('/api/backup-now', async (req, res) => {
  try {
    const { liveConfigPath, backupFolderPath, maxBackupsEnabled, maxBackupsCount, timezone } = req.body;
    const backupPath = await performBackup(liveConfigPath, backupFolderPath, 'manual', maxBackupsEnabled, maxBackupsCount, timezone);
    res.json({ success: true, path: backupPath, message: `Backup created successfully at ${backupPath}` });
  } catch (error) {
    console.error('[backup-now] Error:', error);
    res.status(500).json({
      error: error.message,
      errorCode: error.code || 'BACKUP_FAILED',
      meta: error.meta || null
    });
  }
});

// Lovelace endpoints
app.post('/api/get-backup-lovelace', async (req, res) => {
  try {
    const { backupPath } = req.body;
    const lovelaceDir = path.join(backupPath, '.storage');
    
    const files = await fs.readdir(lovelaceDir);
    const lovelaceFiles = files.filter(f => f.startsWith('lovelace'));
    
    res.json({ lovelaceFiles });
  } catch (error) {
    console.error('[get-backup-lovelace] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/get-backup-lovelace-file', async (req, res) => {
  try {
    const { backupPath, fileName } = req.body;
    const filePath = path.join(backupPath, '.storage', fileName);
    
    console.log(`[get-backup-lovelace-file] Request for file: ${fileName} in backup: ${backupPath}`);
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('[get-backup-lovelace-file] Error sending file:', err);
        res.status(err.status || 500).json({ error: err.message });
      }
    });
  } catch (error) {
    console.error('[get-backup-lovelace-file] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const getLiveLovelaceFile = async (req, res) => {
  try {
    const payload = req.method === 'GET' ? req.query : req.body;
    const fileName = payload?.fileName;
    const liveConfigPath = payload?.liveConfigPath;

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const configPath = liveConfigPath || '/config';
    const filePath = path.join(configPath, '.storage', fileName);
    
    console.log(`[get-live-lovelace-file] Request for file: ${fileName} in config: ${configPath}`);
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('[get-live-lovelace-file] Error sending file:', err);
        res.status(err.status || 404).json({ error: 'File not found' });
      }
    });
  } catch (error) {
    console.error('[get-live-lovelace-file] Error:', error);
    res.status(404).json({ error: 'File not found' });
  }
};

app.get('/api/get-live-lovelace-file', getLiveLovelaceFile);
app.post('/api/get-live-lovelace-file', getLiveLovelaceFile);

app.post('/api/restore-lovelace-file', async (req, res) => {
  try {
    const { fileName, backupPath, content, timezone, liveConfigPath } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    if (!backupPath && typeof content === 'undefined') {
      return res.status(400).json({ error: 'backupPath or content is required' });
    }

    // Perform a backup before restoring
    await performBackup(liveConfigPath || null, null, 'pre-restore', false, 100, timezone);

    const configPath = liveConfigPath || '/config';
    const targetFilePath = path.join(configPath, '.storage', fileName);
    await fs.mkdir(path.dirname(targetFilePath), { recursive: true });

    if (backupPath) {
      const sourceFilePath = path.join(backupPath, '.storage', fileName);
      try {
        await fs.copyFile(sourceFilePath, targetFilePath);
      } catch (copyError) {
        console.error('[restore-lovelace-file] Copy from backup failed, falling back to write:', copyError.message);
        const backupContent = await fs.readFile(sourceFilePath, 'utf-8');
        await fs.writeFile(targetFilePath, backupContent, 'utf-8');
      }
    } else {
      const contentToWrite = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      await fs.writeFile(targetFilePath, contentToWrite, 'utf-8');
    }

    // Check if HA config is available to determine if a restart is needed
    const auth = await getHomeAssistantAuth();
    const needsRestart = !!(auth.baseUrl && auth.token);

    res.json({ success: true, message: 'Lovelace file restored successfully', needsRestart });
  } catch (error) {
    console.error('[restore-lovelace-file] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ESPHome endpoints
app.post('/api/get-backup-esphome', async (req, res) => {
  try {
    if (!(await isEsphomeEnabled())) {
      return res.status(404).json({ error: 'ESPHome feature disabled' });
    }
    const { backupPath } = req.body;
    const esphomeDir = path.join(backupPath, 'esphome');
    const esphomeFiles = await listYamlFilesRecursive(esphomeDir);
    res.json({ esphomeFiles });
  } catch (error) {
    console.error('[get-backup-esphome] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/get-backup-esphome-file', async (req, res) => {
  try {
    if (!(await isEsphomeEnabled())) {
      return res.status(404).json({ error: 'ESPHome feature disabled' });
    }
    const { backupPath, fileName } = req.body;
    const esphomeDir = path.join(backupPath, 'esphome');
    const filePath = resolveWithinDirectory(esphomeDir, fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (error) {
    if (error.code === 'INVALID_PATH') {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    console.error('[get-backup-esphome-file] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/get-live-esphome-file', async (req, res) => {
  try {
    if (!(await isEsphomeEnabled())) {
      return res.status(404).json({ error: 'ESPHome feature disabled' });
    }
    const { fileName, liveConfigPath } = req.body;
    const configPath = liveConfigPath || '/config';
    const esphomeDir = path.join(configPath, 'esphome');
    const filePath = resolveWithinDirectory(esphomeDir, fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (error) {
    if (error.code === 'INVALID_PATH') {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    console.error('[get-live-esphome-file] Error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

app.post('/api/restore-esphome-file', async (req, res) => {
  try {
    if (!(await isEsphomeEnabled())) {
      return res.status(404).json({ error: 'ESPHome feature disabled' });
    }
    const { fileName, content, timezone, liveConfigPath } = req.body;
    // Perform a backup before restoring
    await performBackup(liveConfigPath || null, null, 'pre-restore', false, 100, timezone);

    const configPath = liveConfigPath || '/config';
    const esphomeDir = path.join(configPath, 'esphome');
    const filePath = resolveWithinDirectory(esphomeDir, fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Handle content being an object or a string
    const contentToWrite = typeof content === 'string' ? content : yaml.dump(content);
    await fs.writeFile(filePath, contentToWrite, 'utf-8');
    
    // Check if HA config is available to determine if a restart is needed
    const auth = await getHomeAssistantAuth();
    const needsRestart = !!(auth.baseUrl && auth.token);

    res.json({ success: true, message: 'ESPHome file restored successfully', needsRestart });
  } catch (error) {
    console.error('[restore-esphome-file] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Packages endpoints
app.post('/api/get-backup-packages', async (req, res) => {
  try {
    if (!(await isPackagesEnabled())) {
      return res.status(404).json({ error: 'Packages feature disabled' });
    }
    const { backupPath } = req.body;
    const packagesDir = path.join(backupPath, 'packages');
    
    try {
      // Check if packages directory exists
      await fs.access(packagesDir);
      const packageFiles = await listYamlFilesRecursive(packagesDir);
      return res.json({ packagesFiles: packageFiles });
    } catch (dirError) {
      if (dirError.code === 'ENOENT') {
        // Directory doesn't exist, return empty array
        return res.json({ packagesFiles: [] });
      }
      throw dirError; // Re-throw other errors
    }
  } catch (error) {
    console.error('[get-backup-packages] Error:', error);
    if (error.code === 'ENOENT') {
      return res.json({ packagesFiles: [] });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/get-backup-packages-file', async (req, res) => {
  try {
    if (!(await isPackagesEnabled())) {
      return res.status(404).json({ error: 'Packages feature disabled' });
    }
    const { backupPath, fileName } = req.body;
    const packagesDir = path.join(backupPath, 'packages');
    const filePath = resolveWithinDirectory(packagesDir, fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (error) {
    if (error.code === 'INVALID_PATH') {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    console.error('[get-backup-packages-file] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/get-live-packages-file', async (req, res) => {
  try {
    if (!(await isPackagesEnabled())) {
      return res.status(404).json({ error: 'Packages feature disabled' });
    }
    const { fileName, liveConfigPath } = req.body;
    const configPath = liveConfigPath || '/config';
    const packagesDir = path.join(configPath, 'packages');
    const filePath = resolveWithinDirectory(packagesDir, fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (error) {
    if (error.code === 'INVALID_PATH') {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('[get-live-packages-file] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/restore-packages-file', async (req, res) => {
  try {
    if (!(await isPackagesEnabled())) {
      return res.status(404).json({ error: 'Packages feature disabled' });
    }
    const { fileName, content, timezone, liveConfigPath } = req.body;
    // Perform a backup before restoring
    await performBackup(liveConfigPath || null, null, 'pre-restore', false, 100, timezone);

    const configPath = liveConfigPath || '/config';
    const packagesDir = path.join(configPath, 'packages');
    const filePath = resolveWithinDirectory(packagesDir, fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Handle content being an object or a string
    const contentToWrite = typeof content === 'string' ? content : yaml.dump(content);
    await fs.writeFile(filePath, contentToWrite, 'utf-8');
    
    // Check if HA config is available to determine if a restart is needed
    const auth = await getHomeAssistantAuth();
    const needsRestart = !!(auth.baseUrl && auth.token);

    res.json({ success: true, message: 'Package file restored successfully', needsRestart });
  } catch (error) {
    console.error('[restore-packages-file] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const options = await getAddonOptions();
    res.json({
      ok: true,
      version: '2.9.268',
      mode: options.mode,
      ingress: !!INGRESS_PATH,
      ingressPath: INGRESS_PATH || 'none',
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('Home Assistant Time Machine v2.9.268');
  console.log('='.repeat(60));
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Ingress mode: ${INGRESS_PATH ? 'ENABLED' : 'DISABLED'}`);
  if (INGRESS_PATH) {
    console.log(`Ingress path: ${INGRESS_PATH}`);
  }
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(60));

  // Initialize Git-based backup system
  initializeGitBackup().then(() => {
    console.log('[init] Git initialization complete');
    // Setup file watcher after Git is initialized
    return setupFileWatcher();
  }).then(() => {
    console.log('[init] File watcher setup complete');
  }).catch(error => {
    console.error('[init] Error during initialization:', error);
  });

  // Initialize scheduled jobs
  loadScheduledJobs().then(jobs => {
    console.log('[scheduler] Loaded schedules:', jobs.jobs);
    console.log('[scheduler] Initializing schedules on startup...');
    Object.entries(jobs.jobs || {}).forEach(([id, job]) => {
      if (job.enabled) {
        console.log(`[scheduler] Setting up schedule "${id}" with cron "${job.cronExpression}" and timezone "${job.timezone}"`);
        scheduledJobs[id] = cron.schedule(job.cronExpression, async () => {
          console.log(`[cron] Triggered backup job: ${id} at ${new Date().toISOString()}`);
          try {
            console.log(`[cron] Fetching addon options for job ${id}...`);
            const options = await getAddonOptions();
            const sanitizedOptions = JSON.parse(JSON.stringify(options));
            if (sanitizedOptions.long_lived_access_token) {
              sanitizedOptions.long_lived_access_token = 'REDACTED';
            }
            console.log(`[cron] Addon options for job ${id}:`, sanitizedOptions);
            try {
              const response = await fetch(`http://localhost:${PORT}/api/backup-now`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  liveConfigPath: job.liveConfigPath || options.liveConfigPath || '/config',
                  backupFolderPath: job.backupFolderPath || options.backupFolderPath || '/media/timemachine',
                  maxBackupsEnabled: job.maxBackupsEnabled,
                  maxBackupsCount: job.maxBackupsCount
                })
              });
              const result = await response.json();
              if (response.ok) {
                console.log(`[cron] Backup triggered successfully: ${result.message}`);
              } else {
                console.error(`[cron] Backup trigger failed: ${result.error}`);
              }
            } catch (error) {
              console.error(`[cron] Error triggering backup:`, error);
            }
          } catch (error) {
            console.error(`[cron] Error during scheduled backup for job ${id}:`, error);
          }
        }, { timezone: job.timezone });
      }
    });
    console.log('[scheduler] Initialization complete.');
  });
});
