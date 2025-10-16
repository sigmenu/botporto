const express = require('express');
const botConfigService = require('./bot-config-service');
const openAIService = require('./openai-service');
const router = express.Router();

// Get bot configuration
router.get('/config', (req, res) => {
  try {
    console.log('[Bot Config API] Getting configuration');
    
    const userId = 'default'; // In production, get from authenticated user
    const config = botConfigService.getUserConfig(userId);
    
    // Add AI service status
    const aiStatus = openAIService.getStatus();
    
    res.json({
      success: true,
      config: {
        ...config,
        aiAvailable: aiStatus.initialized
      },
      aiStatus: aiStatus
    });
    
  } catch (error) {
    console.error('[Bot Config API] Error getting configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get configuration',
      error: error.message
    });
  }
});

// Update bot configuration
router.post('/config', (req, res) => {
  try {
    console.log('[Bot Config API] Updating configuration:', req.body);
    
    const userId = 'default'; // In production, get from authenticated user
    const updates = req.body;
    
    // Validate required fields
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid configuration data'
      });
    }
    
    // Update configuration
    const result = botConfigService.updateUserConfig(userId, updates);
    
    if (result.success) {
      console.log('[Bot Config API] Configuration updated successfully');
      res.json({
        success: true,
        message: result.message,
        config: result.config
      });
    } else {
      console.error('[Bot Config API] Failed to update configuration:', result.message);
      res.status(400).json({
        success: false,
        message: result.message,
        config: result.config
      });
    }
    
  } catch (error) {
    console.error('[Bot Config API] Error updating configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update configuration',
      error: error.message
    });
  }
});

// Reset bot configuration to defaults
router.post('/config/reset', (req, res) => {
  try {
    console.log('[Bot Config API] Resetting configuration to defaults');
    
    const userId = 'default'; // In production, get from authenticated user
    const config = botConfigService.resetUserConfig(userId);
    
    res.json({
      success: true,
      message: 'Configuration reset to defaults',
      config: config
    });
    
  } catch (error) {
    console.error('[Bot Config API] Error resetting configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset configuration',
      error: error.message
    });
  }
});

// Test AI service
router.post('/test-ai', async (req, res) => {
  try {
    console.log('[Bot Config API] Testing AI service');
    
    const testMessage = req.body.message || 'Olá, como você está?';
    
    if (!openAIService.isInitialized()) {
      return res.json({
        success: false,
        message: 'AI service not initialized. Check OpenAI API key.',
        response: null
      });
    }
    
    const result = await openAIService.generateResponse(testMessage);
    
    res.json({
      success: result.success,
      message: result.success ? 'AI test completed' : 'AI test failed',
      response: result.response,
      error: result.error || null,
      usage: result.usage || null
    });
    
  } catch (error) {
    console.error('[Bot Config API] Error testing AI:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test AI service',
      error: error.message
    });
  }
});

// Get all configurations (admin only)
router.get('/configs/all', (req, res) => {
  try {
    console.log('[Bot Config API] Getting all configurations');
    
    const configs = botConfigService.getAllConfigs();
    
    res.json({
      success: true,
      configs: configs,
      count: Object.keys(configs).length
    });
    
  } catch (error) {
    console.error('[Bot Config API] Error getting all configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get configurations',
      error: error.message
    });
  }
});

module.exports = router;