export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

// Debug logging
if (typeof window !== 'undefined') {
  console.log('[API Config] Base URL:', API_BASE_URL);
  console.log('[API Config] Environment variable:', process.env.NEXT_PUBLIC_API_URL);
}

export const API_ENDPOINTS = {
  auth: {
    login: API_BASE_URL + '/api/auth/login',
    register: API_BASE_URL + '/api/auth/register',
    me: API_BASE_URL + '/api/auth/me',
    logout: API_BASE_URL + '/api/auth/logout'
  },
  whatsapp: {
    qr: API_BASE_URL + '/api/whatsapp/qr',
    status: API_BASE_URL + '/api/whatsapp/status',
    send: API_BASE_URL + '/api/whatsapp/send',
    disconnect: API_BASE_URL + '/api/whatsapp/disconnect',
    qrRefresh: API_BASE_URL + '/api/whatsapp/qr/refresh'
  },
  bot: {
    config: API_BASE_URL + '/api/bot/config'
  },
  onboarding: {
    complete: API_BASE_URL + '/api/onboarding/complete'
  }
};