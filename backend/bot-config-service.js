// Bot configuration storage with file persistence
// Persistent storage to survive server restarts

const fs = require('fs');
const path = require('path');

class BotConfigService {
  constructor() {
    this.configs = new Map();
    
    // Create data directory for configuration persistence
    this.dataDir = path.join(__dirname, 'data');
    this.configFile = path.join(this.dataDir, 'bot_configurations.json');
    
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.defaultConfig = {
      mode: 'greeting', // 'greeting' or 'ai'
      greetingMessage: 'Olá! Obrigado por entrar em contato. Como posso ajudá-lo?',
      greetingCooldownHours: 24, // Default 24 hours cooldown
      greetingCooldownMessage: 'Olá! Já enviei as informações há pouco. Em que mais posso ajudá-lo?', // Message during cooldown
      greetingSilentCooldown: false, // If true, don't send any message during cooldown
      aiEnabled: false,
      autoReply: true,
      aiModel: 'gpt-4o-mini', // 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o'
      businessHours: {
        enabled: false,
        start: '09:00',
        end: '18:00',
        timezone: 'America/Sao_Paulo'
      }
    };
    
    // Load existing configurations from file
    this.loadConfigurationsFromFile();
    console.log('[Bot Config Service] Initialized with persistent storage');
  }

  getUserConfig(userId = 'default') {
    if (!this.configs.has(userId)) {
      this.configs.set(userId, { ...this.defaultConfig });
      console.log('[Bot Config Service] Created default config for user:', userId);
    }
    
    return this.configs.get(userId);
  }

  updateUserConfig(userId = 'default', updates) {
    try {
      let config = this.getUserConfig(userId);
      
      // Merge updates with existing config
      config = {
        ...config,
        ...updates
      };

      // Auto-enable AI when mode is set to 'ai'
      if (updates.mode === 'ai') {
        config.aiEnabled = true;
        console.log('[Bot Config Service] Auto-enabled AI when mode set to ai');
      }

      // Validate config
      if (updates.mode && !['greeting', 'ai'].includes(updates.mode)) {
        throw new Error('Invalid mode. Must be "greeting" or "ai"');
      }

      if (updates.greetingMessage && typeof updates.greetingMessage !== 'string') {
        throw new Error('Greeting message must be a string');
      }

      if (updates.aiModel && !['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o'].includes(updates.aiModel)) {
        throw new Error('Invalid AI model. Must be "gpt-4o-mini", "gpt-3.5-turbo", or "gpt-4o"');
      }

      // Save config
      this.configs.set(userId, config);
      
      // Persist to file
      this.saveConfigurationsToFile();
      
      console.log('[Bot Config Service] Updated config for user:', userId, updates);
      
      return {
        success: true,
        config: config,
        message: 'Configuration updated successfully'
      };

    } catch (error) {
      console.error('[Bot Config Service] Error updating config:', error);
      return {
        success: false,
        message: error.message,
        config: this.getUserConfig(userId)
      };
    }
  }

  isAIMode(userId = 'default') {
    const config = this.getUserConfig(userId);
    return config.mode === 'ai' && config.aiEnabled;
  }

  isGreetingMode(userId = 'default') {
    const config = this.getUserConfig(userId);
    return config.mode === 'greeting';
  }

  getGreetingMessage(userId = 'default') {
    const config = this.getUserConfig(userId);
    return config.greetingMessage;
  }

  getGreetingCooldownHours(userId = 'default') {
    const config = this.getUserConfig(userId);
    return config.greetingCooldownHours || 24;
  }

  getGreetingCooldownMessage(userId = 'default') {
    const config = this.getUserConfig(userId);
    return config.greetingCooldownMessage || null;
  }

  isGreetingSilentCooldown(userId = 'default') {
    const config = this.getUserConfig(userId);
    return config.greetingSilentCooldown || false;
  }

  getAIModel(userId = 'default') {
    const config = this.getUserConfig(userId);
    return config.aiModel || 'gpt-4o-mini';
  }

  shouldAutoReply(userId = 'default') {
    const config = this.getUserConfig(userId);
    return config.autoReply;
  }

  isWithinBusinessHours(userId = 'default') {
    const config = this.getUserConfig(userId);
    
    if (!config.businessHours.enabled) {
      return true; // Always available if business hours not enabled
    }

    try {
      const now = new Date();
      const startTime = new Date();
      const endTime = new Date();
      
      const [startHour, startMin] = config.businessHours.start.split(':').map(Number);
      const [endHour, endMin] = config.businessHours.end.split(':').map(Number);
      
      startTime.setHours(startHour, startMin, 0);
      endTime.setHours(endHour, endMin, 0);
      
      return now >= startTime && now <= endTime;
    } catch (error) {
      console.error('[Bot Config Service] Error checking business hours:', error);
      return true; // Default to available
    }
  }

  getAllConfigs() {
    const result = {};
    for (const [userId, config] of this.configs) {
      result[userId] = config;
    }
    return result;
  }

  resetUserConfig(userId = 'default') {
    this.configs.set(userId, { ...this.defaultConfig });
    this.saveConfigurationsToFile();
    console.log('[Bot Config Service] Reset config for user:', userId);
    return this.getUserConfig(userId);
  }

  loadConfigurationsFromFile() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const savedConfigs = JSON.parse(data);
        
        // Load all configurations from file
        for (const [userId, config] of Object.entries(savedConfigs)) {
          this.configs.set(userId, { ...this.defaultConfig, ...config });
        }
        
        console.log(`[Bot Config Service] Loaded ${Object.keys(savedConfigs).length} configurations from file`);
      } else {
        console.log('[Bot Config Service] No existing configuration file found, starting fresh');
      }
    } catch (error) {
      console.error('[Bot Config Service] Error loading configurations from file:', error);
      console.log('[Bot Config Service] Starting with default configurations');
    }
  }

  saveConfigurationsToFile() {
    try {
      const configsToSave = {};
      
      // Convert Map to plain object for JSON serialization
      for (const [userId, config] of this.configs) {
        configsToSave[userId] = config;
      }
      
      // Write synchronously to ensure immediate persistence
      fs.writeFileSync(this.configFile, JSON.stringify(configsToSave, null, 2), 'utf8');
      console.log(`[Bot Config Service] [FILE WRITE] Saved ${Object.keys(configsToSave).length} configurations to file`);
      
      // Verify file was written
      if (fs.existsSync(this.configFile)) {
        const stats = fs.statSync(this.configFile);
        console.log(`[Bot Config Service] [FILE VERIFY] Configuration file exists (${stats.size} bytes)`);
      } else {
        console.error('[Bot Config Service] [FILE VERIFY] WARNING: Configuration file not found after save');
      }
      
    } catch (error) {
      console.error('[Bot Config Service] [FILE WRITE] Error saving configurations to file:', error);
    }
  }
}

// Create singleton instance
const botConfigService = new BotConfigService();

module.exports = botConfigService;