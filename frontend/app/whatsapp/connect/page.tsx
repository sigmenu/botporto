'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { API_ENDPOINTS } from '@/config/api';

export default function ConnectWhatsApp() {
  const [qrCode, setQrCode] = useState('');
  const [status, setStatus] = useState('generating');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState('qr'); // 'qr' or 'phone'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState('');

  // Refs to store interval IDs for cleanup
  const statusIntervalRef = useRef(null);
  const qrIntervalRef = useRef(null);
  
  // Prevent multiple simultaneous requests
  const isGeneratingRef = useRef(false);

  useEffect(() => {
    console.log('WhatsApp Connect: Starting connection process');
    generateQR(); // Initial QR generation
    
    // Check status every 3 seconds
    statusIntervalRef.current = setInterval(checkStatus, 3000);
    
    // Refresh QR every 30 seconds to prevent expiration (only when waiting)
    qrIntervalRef.current = setInterval(() => {
      // Use functional setState to access current status without dependencies
      setStatus(currentStatus => {
        if (currentStatus === 'waiting') {
          console.log('WhatsApp Connect: Refreshing QR code...');
          refreshQR();
        }
        return currentStatus;
      });
    }, 30000);
    
    return () => {
      console.log('WhatsApp Connect: Cleaning up intervals');
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    };
  }, []); // Remove dependencies to prevent infinite loops

  const generateQR = async () => {
    // Prevent multiple simultaneous QR generation calls
    if (isGeneratingRef.current) {
      console.log('WhatsApp Connect: QR generation already in progress, skipping...');
      return;
    }
    
    try {
      console.log('WhatsApp Connect: Generating QR code...');
      isGeneratingRef.current = true;
      setIsLoading(true);
      setError('');
      setStatus('generating');
      
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Token não encontrado. Faça login novamente.');
        return;
      }

      const response = await fetch(API_ENDPOINTS.whatsapp.qr, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('WhatsApp Connect: QR response:', { success: data.success, hasQr: !!data.qrCode });

      if (data.success && data.qrCode) {
        setQrCode(data.qrCode);
        setStatus('waiting');
      } else {
        setError(data.message || 'Erro ao gerar QR code');
        setStatus('error');
      }
    } catch (err) {
      console.error('WhatsApp Connect: QR generation error:', err);
      setError('Erro de conexão. Verifique se o backend está rodando.');
      setStatus('error');
    } finally {
      setIsLoading(false);
      isGeneratingRef.current = false;
    }
  };

  const refreshQR = async () => {
    try {
      console.log('WhatsApp Connect: Refreshing QR code...');
      
      // Check if already connected before refreshing
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Token não encontrado. Faça login novamente.');
        return;
      }

      const statusResponse = await fetch(API_ENDPOINTS.whatsapp.status, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const statusData = await statusResponse.json();
      if (statusData.success && statusData.connected) {
        console.log('WhatsApp Connect: Already connected, skipping QR refresh');
        setStatus('connected');
        return;
      }
      
      setStatus('refreshing');

      // Try to refresh existing QR first, fallback to new QR if needed
      let response = await fetch(API_ENDPOINTS.whatsapp.qrRefresh, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      let data = await response.json();
      
      // If refresh fails, generate new QR
      if (!data.success) {
        console.log('WhatsApp Connect: Refresh failed, generating new QR...');
        response = await fetch(API_ENDPOINTS.whatsapp.qr, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        data = await response.json();
      }

      console.log('WhatsApp Connect: QR refresh response:', { success: data.success, hasQr: !!data.qrCode });

      if (data.success && data.qrCode) {
        setQrCode(data.qrCode);
        setStatus('waiting');
        console.log('WhatsApp Connect: QR refreshed successfully');
      } else {
        setError(data.message || 'Erro ao atualizar QR code');
        setStatus('error');
      }
    } catch (err) {
      console.error('WhatsApp Connect: QR refresh error:', err);
      setError('Erro de conexão ao atualizar QR code.');
      setStatus('error');
    }
  };

  const checkStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(API_ENDPOINTS.whatsapp.status, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('WhatsApp Connect: Status check:', data);

      if (data.success && data.connected) {
        console.log('WhatsApp Connect: Connection detected, clearing intervals');
        if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
        if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
        setStatus('connected');
        setConnectedPhone(data.phoneNumber || '');
        setTimeout(() => {
          console.log('WhatsApp Connect: Connected! Redirecting to dashboard');
          window.location.href = '/dashboard';
        }, 2000);
      }
    } catch (err) {
      console.error('WhatsApp Connect: Status check error:', err);
      // Don't set error for status checks to avoid UI flickering
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.whatsapp.disconnect, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setShowDisconnectConfirm(false);
        setStatus('generating');
        setConnectedPhone('');
        setQrCode('');
        
        // Immediately generate new QR code
        generateQR();
        
        // Restart status checking
        statusIntervalRef.current = setInterval(checkStatus, 3000);
        qrIntervalRef.current = setInterval(() => {
          setStatus(currentStatus => {
            if (currentStatus === 'waiting') {
              refreshQR();
            }
            return currentStatus;
          });
        }, 30000);
      } else {
        const error = await response.json();
        setError(`Erro ao desconectar: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      setError('Erro ao desconectar WhatsApp');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleBack = () => {
    window.location.href = '/dashboard';
  };

  const handleRetry = () => {
    setQrCode('');
    setError('');
    generateQR();
  };

  const requestPairingCode = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Token não encontrado. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/whatsapp/request-pairing-code', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phoneNumber })
      });

      const data = await response.json();
      
      if (data.success) {
        setPairingCode(data.pairingCode);
        setStatus('pairing');
      } else {
        setError(data.message || 'Erro ao solicitar código de pareamento');
      }
    } catch (err) {
      console.error('Pairing request error:', err);
      setError('Erro de conexão ao solicitar código de pareamento.');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyPairingCode = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Token não encontrado. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/whatsapp/verify-pairing-code', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          sessionId: 'default',
          code: verificationCode 
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setStatus('connected');
        setShowPairingModal(false);
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 2000);
      } else {
        setError(data.message || 'Código de verificação inválido');
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError('Erro de conexão ao verificar código.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center mb-8">
          <button
            onClick={handleBack}
            className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar ao Dashboard
          </button>
        </div>

        <div className="flex flex-col items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Conecte seu WhatsApp
              </h1>
              <p className="text-gray-600">
                {connectionMethod === 'qr' ? 'Escaneie o QR Code com seu WhatsApp para conectar' : 'Use seu número de telefone para conectar'}
              </p>
            </div>

            {/* Connection Method Toggle */}
            <div className="mb-6">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setConnectionMethod('qr')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    connectionMethod === 'qr'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  QR Code
                </button>
                <button
                  onClick={() => setConnectionMethod('phone')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    connectionMethod === 'phone'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Número de Telefone
                </button>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Gerando QR Code...</p>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="py-8">
                <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                <p className="text-red-600 mb-4">{error}</p>
                <button
                  onClick={handleRetry}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mx-auto"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar Novamente
                </button>
              </div>
            )}

            {/* Phone Number Pairing */}
            {connectionMethod === 'phone' && status !== 'connected' && (
              <div className="py-4">
                {!pairingCode ? (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                        Número de Telefone (com código do país)
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+55 11 99999-9999"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <button
                      onClick={requestPairingCode}
                      disabled={isLoading || !phoneNumber}
                      className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Solicitando...' : 'Solicitar Código de Pareamento'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center p-6 bg-green-50 rounded-lg">
                      <h3 className="text-lg font-semibold text-green-800 mb-2">
                        Código de Pareamento
                      </h3>
                      <div className="text-3xl font-mono font-bold text-green-600 mb-4">
                        {pairingCode}
                      </div>
                      <p className="text-sm text-green-700">
                        1. Abra o WhatsApp no seu celular<br/>
                        2. Vá em Configurações → Dispositivos conectados<br/>
                        3. Toque em "Conectar um dispositivo"<br/>
                        4. Escolha "Conectar com número de telefone"<br/>
                        5. Digite o código acima
                      </p>
                    </div>
                    <div>
                      <label htmlFor="verification" className="block text-sm font-medium text-gray-700 mb-2">
                        Código de Verificação (recebido por SMS)
                      </label>
                      <input
                        type="text"
                        id="verification"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="000000"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <button
                      onClick={verifyPairingCode}
                      disabled={isLoading || !verificationCode}
                      className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Verificando...' : 'Verificar Código'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* QR Code Display */}
            {connectionMethod === 'qr' && qrCode && (status === 'waiting' || status === 'refreshing') && (
              <div className="py-4">
                <div className={`relative p-4 bg-white rounded-lg shadow-lg ${status === 'refreshing' ? 'opacity-75' : ''}`}>
                  <img 
                    src={qrCode} 
                    alt="WhatsApp QR Code" 
                    className="w-64 h-64"
                  />
                  {status === 'refreshing' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 rounded-lg">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Atualizando QR...</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="animate-pulse flex items-center justify-center mb-2">
                    <div className="h-3 w-3 bg-green-400 rounded-full mr-2"></div>
                    <p className="text-gray-600">
                      {status === 'refreshing' ? 'Atualizando QR...' : 'Aguardando conexão...'}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    1. Abra o WhatsApp no seu celular<br/>
                    2. Toque em Mais opções {">"} Dispositivos conectados<br/>
                    3. Toque em Conectar um dispositivo<br/>
                    4. Aponte seu telefone para esta tela
                  </p>
                  <button
                    onClick={handleRetry}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Gerar novo QR Code
                  </button>
                </div>
              </div>
            )}

            {/* Success State */}
            {status === 'connected' && (
              <div className="py-8">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <p className="text-green-600 font-semibold mb-2">WhatsApp Conectado!</p>
                {connectedPhone && (
                  <p className="text-gray-600 mb-4">Número: +{connectedPhone}</p>
                )}
                <p className="text-gray-600 mb-4">Redirecionando para o dashboard...</p>
                <button
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Desconectar WhatsApp
                </button>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-8 bg-blue-50 rounded-lg p-4 max-w-md">
            <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Informações importantes</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Mantenha o WhatsApp aberto durante a conexão</li>
              <li>• O QR Code expira em poucos minutos</li>
              <li>• Sua conversa ficará sincronizada em tempo real</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Disconnect Confirmation Dialog */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirmar Desconexão</h3>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja desconectar este WhatsApp? 
              Isso removerá completamente a sessão atual e você precisará escanear 
              um novo QR code para reconectar.
            </p>
            {connectedPhone && (
              <p className="text-sm text-gray-500 mb-4">
                Dispositivo atual: +{connectedPhone}
              </p>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                disabled={isDisconnecting}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isDisconnecting ? 'Desconectando...' : 'Desconectar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}