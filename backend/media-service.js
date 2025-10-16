const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class MediaService {
  constructor() {
    this.tempDir = path.join(__dirname, 'temp');
    this.ensureTempDir();
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      console.log('[Media Service] Created temp directory:', this.tempDir);
    }
  }

  // Note: This method is now deprecated as whatsapp-web.js handles media download internally
  // Kept for backward compatibility - media should be already downloaded by whatsapp-web.js
  async downloadAndSaveMedia(message, messageType = 'auto') {
    throw new Error('downloadAndSaveMedia is deprecated - use processAudio or processImage with file path instead');
  }

  async transcribeAudio(audioBuffer, filename = 'audio.ogg') {
    try {
      if (!this.apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      console.log('[Media Service] Transcribing audio with Whisper API...');

      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: filename,
        contentType: 'audio/ogg'
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt'); // Portuguese
      formData.append('response_format', 'json');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      console.log('[Media Service] Audio transcription successful:', result.text.substring(0, 100) + '...');
      
      return {
        success: true,
        text: result.text,
        language: result.language || 'pt',
        duration: result.duration
      };

    } catch (error) {
      console.error('[Media Service] Error transcribing audio:', error);
      return {
        success: false,
        error: error.message,
        text: null
      };
    }
  }

  async analyzeImage(imageBuffer, caption = '', filename = 'image.jpg') {
    try {
      if (!this.apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      console.log('[Media Service] Analyzing image with GPT-4 Vision...');

      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeTypeFromFilename(filename);

      // Prepare the prompt for restaurant context
      let prompt = `Analise esta imagem detalhadamente. `;
      
      if (caption) {
        prompt += `O usuário enviou com a legenda: "${caption}". `;
      }
      
      prompt += `Se for comida ou bebida, identifique:
- Que tipo de alimento/bebida é
- Ingredientes visíveis
- Aparência e apresentação
- Se parece ser de um cardápio ou menu

Se for um menu ou cardápio, extraia:
- Nomes dos pratos/bebidas
- Preços (se visíveis)
- Descrições dos itens
- Categorias dos alimentos

Responda em português brasileiro de forma amigável e informativa.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vision API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const analysis = result.choices[0]?.message?.content;
      
      if (!analysis) {
        throw new Error('No analysis returned from Vision API');
      }

      console.log('[Media Service] Image analysis successful:', analysis.substring(0, 100) + '...');
      
      return {
        success: true,
        analysis: analysis,
        caption: caption,
        usage: result.usage
      };

    } catch (error) {
      console.error('[Media Service] Error analyzing image:', error);
      return {
        success: false,
        error: error.message,
        analysis: null
      };
    }
  }

  getMimeTypeFromFilename(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.ogg': 'audio/ogg',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  cleanupTempFile(filepath) {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log('[Media Service] Cleaned up temp file:', path.basename(filepath));
      }
    } catch (error) {
      console.error('[Media Service] Error cleaning up temp file:', error);
    }
  }

  async cleanupOldFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes

      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stats = fs.statSync(filepath);
        
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filepath);
          console.log('[Media Service] Cleaned up old file:', file);
        }
      }
    } catch (error) {
      console.error('[Media Service] Error cleaning up old files:', error);
    }
  }

  // Process complete media message (audio or image)
  // Deprecated method - use processAudio or processImage directly
  async processMediaMessage(message, userText = '') {
    throw new Error('processMediaMessage is deprecated - use processAudio or processImage with file path instead');
  }

  // Check if message contains supported media (for whatsapp-web.js)
  static hasMediaMessage(message) {
    return message.hasMedia;
  }

  // Get media type from message (for whatsapp-web.js)
  static getMediaType(message) {
    if (message.type === 'ptt' || message.type === 'audio') return 'audio';
    if (message.type === 'image') return 'image';
    return null;
  }

  getStatus() {
    return {
      initialized: !!this.apiKey,
      tempDir: this.tempDir,
      tempDirExists: fs.existsSync(this.tempDir),
      supportedTypes: ['audio', 'image'],
      audioFormats: ['ogg', 'mp3', 'wav', 'm4a'],
      imageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
    };
  }
}

// Create singleton instance
const mediaService = new MediaService();

// Setup cleanup interval (run every 10 minutes)
setInterval(() => {
  mediaService.cleanupOldFiles();
}, 10 * 60 * 1000);

module.exports = mediaService;