const mediaService = require('./media-service');
const fs = require('fs');

async function testMediaService() {
  console.log('=== Testing Media Service ===');
  
  // Test service status
  const status = mediaService.getStatus();
  console.log('Media Service Status:', JSON.stringify(status, null, 2));
  
  // Test with a sample text (simulating Whisper response)
  if (status.initialized) {
    console.log('\n✅ OpenAI API key is configured');
    
    // Create a small test audio buffer (simulated)
    console.log('\n=== Testing Audio Transcription (simulated) ===');
    const testAudioBuffer = Buffer.from('This is a test audio file content', 'utf8');
    
    console.log('Note: This would normally call OpenAI Whisper API');
    console.log('Audio buffer size:', testAudioBuffer.length, 'bytes');
    
    // Test image analysis with a simple base64 string (simulated)
    console.log('\n=== Testing Image Analysis (simulated) ===');
    const testImageBuffer = Buffer.from('This is a test image file content', 'utf8');
    
    console.log('Note: This would normally call OpenAI Vision API');
    console.log('Image buffer size:', testImageBuffer.length, 'bytes');
    
    // Test static methods
    console.log('\n=== Testing Static Methods ===');
    
    const mockMessage1 = {
      audioMessage: { mimetype: 'audio/ogg' }
    };
    
    const mockMessage2 = {
      imageMessage: { mimetype: 'image/jpeg', caption: 'Test image' }
    };
    
    const mockMessage3 = {
      conversation: 'Regular text message'
    };
    
    console.log('Has audio message:', mediaService.hasMediaMessage(mockMessage1));
    console.log('Audio type:', mediaService.getMediaType(mockMessage1));
    
    console.log('Has image message:', mediaService.hasMediaMessage(mockMessage2));
    console.log('Image type:', mediaService.getMediaType(mockMessage2));
    
    console.log('Has text only:', mediaService.hasMediaMessage(mockMessage3));
    console.log('Text type:', mediaService.getMediaType(mockMessage3));
    
  } else {
    console.log('\n❌ OpenAI API key not configured');
    console.log('Set OPENAI_API_KEY environment variable to test API calls');
  }
  
  console.log('\n=== Testing File Cleanup ===');
  mediaService.cleanupOldFiles();
  
  console.log('\n=== Media Service Test Complete ===');
}

testMediaService().catch(console.error);