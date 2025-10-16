# WhatsApp Bot SaaS Backend

## Recent Updates (September 20, 2025)

### Critical Bug Fixes (September 18-20, 2025)

#### 7. Enhanced Session Validation and Prioritization
- **Problem**: Sessions with valid app-state files were not being restored because validation only accepted numeric folder names
- **Solution**: Enhanced session discovery to prioritize sessions with app-state files regardless of folder name
- **Files Modified**: `whatsapp-baileys.js` (loadSavedSessions, hasAppStateFiles functions)
- **Impact**: Fixed "default" session restoration with 38 files including app-state data

#### 8. Comprehensive Error Protection for Auth State Loading
- **Problem**: Server crashes with "Cannot read properties of undefined (reading 'map')" when auth state corruption occurred
- **Solution**: Added comprehensive try-catch protection around critical auth operations
- **Files Modified**: `whatsapp-baileys.js` (lines 1971-2107)
- **Protection Added**:
  - Auth state loading validation
  - Socket creation error handling
  - Signal repository corruption detection
  - Graceful session cleanup on corruption

#### 9. Fixed Session Detection Logic
- **Problem**: Session validation regex `/^\d+$/` excluded non-numeric session names like "default"
- **Solution**: Removed numeric-only restriction and prioritized sessions based on app-state file presence
- **Files Modified**: `whatsapp-baileys.js` (loadSavedSessions function)
- **Result**: Properly detects and restores sessions with any valid name format

### Major Fixes and Improvements (September 11, 2025)

#### 1. Fixed Greeting Cooldown Applied to AI Mode
- **Problem**: AI mode was incorrectly falling back to greeting mode logic and applying cooldown restrictions
- **Solution**: Auto-enable `aiEnabled: true` when mode is set to 'ai'
- **Files Modified**: `bot-config-service.js`

#### 2. Fixed Dashboard Connection Status Display
- **Problem**: Dashboard showed "Desconectado" even when WhatsApp was actually connected
- **Solution**: Enhanced status endpoint to check for any active connection, not just the default session
- **Files Modified**: `whatsapp-baileys.js` (getStatus method)

#### 3. Persistent Bot Configuration
- **Problem**: Bot mode settings were lost on server restart
- **Solution**: Implemented file-based persistence for bot configurations
- **Files Modified**: `bot-config-service.js`
- **Storage Location**: `data/bot_configurations.json`

#### 4. Session File Persistence Fix
- **Problem**: Session files (creds.json) were not being saved to the correct location
- **Solution**: Enhanced session file copying with comprehensive verification and logging
- **Files Modified**: `whatsapp-baileys.js`
- **Directories**: 
  - `baileys_sessions/` - Initial session storage
  - `sessions/phoneNumber/` - Phone-based persistent storage

#### 5. Message Queue Cleanup on Reconnection
- **Problem**: Old queued messages interfered with fresh AI responses after reconnection
- **Solution**: Clear all message queues when connection is re-established
- **Files Modified**: `whatsapp-baileys.js` (added clearAllMessageQueues method)

#### 6. Enhanced Logging
- **Added Logging Tags**:
  - `[FILE WRITE]` - File writing operations
  - `[FILE VERIFY]` - File verification after writes
  - `[FILE COPY]` - Session file copying operations
  - `[MESSAGE QUEUE]` - Message queue operations
  - `[Session Persistence]` - Session persistence operations
  - `[Bot Config Service]` - Bot configuration operations
  - `[Session Discovery]` - Session scanning and validation
  - `[Auth Validation]` - Auth state file validation
  - `[Session Init]` - Session initialization and cleanup
  - `[Socket Init]` - Socket creation and configuration
  - `[Session Cleanup]` - Session cleanup and corruption handling

## Current System Architecture

### Core Components

1. **WhatsApp Service** (`whatsapp-baileys.js`)
   - Manages WhatsApp connections using @whiskeysockets/baileys
   - Handles message queuing and processing
   - Manages session persistence and recovery
   - Supports multiple concurrent sessions

2. **Bot Configuration Service** (`bot-config-service.js`)
   - Manages bot operation modes (greeting/AI)
   - Handles cooldown settings for greeting mode
   - Persists configurations to file system
   - Supports per-user configuration

3. **OpenAI Service** (`openai-service.js`)
   - Integrates with OpenAI API for AI responses
   - Supports multiple AI models (gpt-4o-mini, gpt-3.5-turbo, gpt-4o)
   - Manages conversation history for context

4. **Main Server** (`server-with-auth.js`)
   - Express.js server with authentication
   - RESTful API endpoints for WhatsApp operations
   - Bot configuration management endpoints
   - Session management endpoints

### Data Persistence

#### Session Registry
- **Location**: `data/session_registry/active_sessions.json`
- **Purpose**: Tracks active WhatsApp sessions
- **Format**:
```json
{
  "phoneNumber": {
    "id": "sessionId",
    "phoneNumber": "phoneNumber",
    "status": "CONNECTED",
    "lastConnected": "ISO-8601-timestamp",
    "userId": "userId"
  }
}
```

#### Bot Configurations
- **Location**: `data/bot_configurations.json`
- **Purpose**: Persists bot settings across restarts
- **Format**:
```json
{
  "userId": {
    "mode": "greeting|ai",
    "greetingMessage": "string",
    "greetingCooldownHours": 24,
    "greetingCooldownMessage": "string",
    "greetingSilentCooldown": false,
    "aiEnabled": true|false,
    "autoReply": true|false,
    "aiModel": "gpt-4o-mini|gpt-3.5-turbo|gpt-4o",
    "businessHours": {
      "enabled": false,
      "start": "09:00",
      "end": "18:00",
      "timezone": "America/Sao_Paulo"
    }
  }
}
```

#### Greeting Cooldowns
- **Location**: `data/greeting_cooldowns.json`
- **Purpose**: Tracks greeting message cooldowns per phone number

### API Endpoints

#### WhatsApp Operations
- `GET /api/whatsapp/status` - Get connection status
- `POST /api/whatsapp/qr/:sessionId` - Generate QR code
- `POST /api/whatsapp/send` - Send message
- `POST /api/whatsapp/disconnect` - Disconnect session
- `POST /api/whatsapp/clear-session` - Clear session completely
- `POST /api/whatsapp/save-test` - Test session persistence

#### Bot Configuration
- `GET /api/bot/config` - Get current bot configuration
- `POST /api/bot/config` - Update bot configuration
- `GET /api/bot/status` - Get bot status including AI availability

#### Fast QR Endpoints
- `GET /api/whatsapp/fast/qr/fast/:sessionId` - Immediate QR response with background generation
- `GET /api/whatsapp/fast/qr/status/:sessionId` - Poll QR generation status
- `GET /api/whatsapp/fast/qr/stream/:sessionId` - Server-sent events for QR progress

### Operation Modes

#### Greeting Mode
- Sends predefined greeting message to new contacts
- Implements cooldown period (default 24 hours)
- Options:
  - Custom cooldown message during cooldown period
  - Silent cooldown (no message during cooldown)
  - Configurable cooldown duration

#### AI Mode
- Uses OpenAI to generate intelligent responses
- Maintains conversation history for context
- Batches multiple messages for coherent responses
- Supports multiple AI models
- No cooldown restrictions

### Key Features

1. **Session Persistence**
   - Sessions survive server restarts
   - Automatic session recovery on reconnection
   - Backup mechanism for critical session files

2. **Message Queuing**
   - Batches rapid messages from same sender
   - 2-second delay for message aggregation
   - Automatic queue cleanup on reconnection

3. **Connection Management**
   - Automatic reconnection with exponential backoff
   - Heartbeat monitoring for connection stability
   - Multiple concurrent session support

4. **Error Handling**
   - Comprehensive error logging
   - Graceful degradation on service failures
   - Automatic cleanup of corrupted sessions

## Environment Variables

```env
# Server Configuration
PORT=3333

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Authentication
JWT_SECRET=your-jwt-secret

# OpenAI (Required for AI mode)
OPENAI_API_KEY=your-openai-api-key

# WhatsApp
NODE_ENV=production|development
```

## Running the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### With Custom Port
```bash
PORT=3001 node server-with-auth.js
```

## Testing

### Test Session Persistence
```bash
curl -X POST http://localhost:3333/api/whatsapp/save-test \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "test_phone", "force": true}'
```

### Test Bot Configuration
```bash
# Get current config
curl http://localhost:3333/api/bot/config

# Update config
curl -X POST http://localhost:3333/api/bot/config \
  -H "Content-Type: application/json" \
  -d '{"mode": "ai", "aiModel": "gpt-4o-mini"}'
```

## Troubleshooting

### Session Issues
1. Check `data/session_registry/active_sessions.json` for registered sessions
2. Verify session files exist in `sessions/phoneNumber/` directory
3. Look for `[Session Persistence]` logs for detailed information

### Bot Mode Issues
1. Check `data/bot_configurations.json` for saved configurations
2. Verify `aiEnabled` is true when mode is set to 'ai'
3. Look for `[Bot Config Service]` logs

### Connection Status Issues
1. Check `/api/whatsapp/status` endpoint response
2. Look for active connections in logs with `[WhatsApp Service]` tags
3. Verify session registry has correct status

### Message Queue Issues
1. Look for `[MESSAGE QUEUE]` logs
2. Check if queues are being cleared on reconnection
3. Verify timer cleanup in logs

## Current System Status

### Session State (as of September 20, 2025)
The system has undergone significant stability improvements:

- **Enhanced Session Discovery**: Properly detects sessions regardless of naming convention
- **Improved Error Handling**: Server no longer crashes from corrupted auth states
- **Priority-based Restoration**: Sessions with app-state files are prioritized for restoration
- **Graceful Degradation**: Corrupted sessions are cleaned up automatically

### Active Sessions
- **Test Servers Running**: Multiple test instances on ports 3777, 3333, 3444, 3335
- **Session Registry**: Located at `data/session_registry/active_sessions.json`
- **Cooldown Tracking**: Located at `data/greeting_cooldowns.json`
- **Bot Configuration**: Located at `data/bot_configurations.json`

### Key Improvements Made
1. **Session Validation Fixed**: No longer restricted to numeric-only session names
2. **App-state Prioritization**: Sessions with WhatsApp app-state files are given priority
3. **Comprehensive Error Protection**: Multiple layers of error handling prevent crashes
4. **Enhanced Logging**: Detailed logging for debugging session issues

## Current Investigation (September 20, 2025)

### Greeting Cooldown Logic Analysis
We're currently investigating and enhancing the greeting cooldown system to ensure it respects the configured time properly.

**Current Status:**
- ✅ Cooldown logic examined in `whatsapp-baileys.js` (lines 903-931, 1084-1198)
- ✅ Bot configuration verified in `bot-config-service.js` (line 118-121)
- ✅ Hours to milliseconds conversion verified: `cooldownHours * 60 * 60 * 1000`
- 🔄 Adding enhanced debug logging for cooldown checks
- 📋 Testing planned with 0.1 hours (6 minutes) cooldown

**Cooldown System Architecture:**
- **Configuration**: Set in `data/bot_configurations.json` (`greetingCooldownHours: 24`)
- **Storage**: Cooldown timestamps in `data/greeting_cooldowns.json`
- **Logic**: `isGreetingOnCooldown()` function in `whatsapp-baileys.js:1084-1095`
- **Persistence**: Auto-save every 5 minutes + immediate save on updates

**Test Scenario:**
1. Set cooldown to 0.1 hours (6 minutes)
2. Send message (should respond with greeting)
3. Wait 5 minutes, send again (should not respond)
4. Wait 2 more minutes, send again (should respond with greeting)

## Next Steps

- [ ] Complete cooldown system debugging and testing
- [ ] Implement rate limiting for API endpoints
- [ ] Add webhook support for incoming messages
- [ ] Implement user authentication for multi-tenant support
- [ ] Add metrics and monitoring dashboard
- [ ] Implement conversation analytics
- [ ] Add support for media messages (images, documents)
- [ ] Implement group chat support
- [ ] Add scheduled message functionality

## Support

For issues or questions, please check the logs in the following order:
1. Console output for real-time errors
2. Session registry for connection tracking
3. Bot configuration file for settings persistence
4. Session directories for WhatsApp auth state

## License

[Your License Here]