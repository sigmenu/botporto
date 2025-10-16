'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot } from 'lucide-react';
import { API_ENDPOINTS } from '@/config/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      console.log('Making login request to backend...');
      console.log('Login endpoint:', API_ENDPOINTS.auth.login);
      
      // Use configured API endpoint
      const response = await fetch(API_ENDPOINTS.auth.login, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });
      
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.success && data.data) {
        // Store authentication data
        const { user, tokens } = data.data;
        localStorage.setItem('token', tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        
        console.log('Login successful, redirecting to dashboard...');
        // Always redirect to dashboard for now
        window.location.href = '/dashboard';
        return;
      } else {
        setError(data.message || 'Credenciais inválidas');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Erro ao conectar com o servidor. Verifique se o backend está rodando na porta 3333.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <div className="absolute top-4 left-4">
        <div className="flex items-center space-x-2">
          <Bot className="h-8 w-8 text-blue-600" />
          <span className="text-xl font-bold text-gray-900">WhatsApp Bot SaaS</span>
        </div>
      </div>

      {/* Voltar para home */}
      <div className="absolute top-4 right-4">
        <a
          href="/"
          className="text-gray-600 hover:text-gray-900 font-medium"
        >
          ← Voltar ao início
        </a>
      </div>

      {/* Login Form */}
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Entrar na sua conta</h2>
            <p className="text-gray-600 mt-2">Acesse o dashboard e gerencie seus bots do WhatsApp</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="seu@email.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Senha
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Sua senha"
                required
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Não tem uma conta?{' '}
            <a href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
              Cadastre-se grátis
            </a>
          </p>
        </div>
      </div>

      {/* Informações de teste */}
      <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border max-w-sm">
        <h4 className="font-semibold text-gray-900 mb-2">🧪 Conta de Teste</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <div><strong>Email:</strong> admin@teste.com</div>
          <div><strong>Senha:</strong> admin123</div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Use essas credenciais para testar o sistema
        </p>
      </div>
    </div>
  );
}