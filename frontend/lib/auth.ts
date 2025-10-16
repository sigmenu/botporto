import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    user: any;
    tokens: {
      accessToken: string;
      refreshToken: string;
    };
  };
}

// Função para fazer login
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  console.log('========== lib/auth.ts login called ==========');
  console.log('API_URL:', API_URL);
  console.log('Full URL:', `${API_URL}/api/auth/login`);
  console.log('Credentials:', { email: credentials.email, passwordLength: credentials.password.length });
  
  try {
    const fullUrl = `${API_URL}/api/auth/login`;
    console.log('Fetching:', fullUrl);
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);

    if (data.success && data.data) {
      console.log('Login successful, storing auth data:', data.data);
      
      // Salvar tokens no localStorage
      localStorage.setItem('accessToken', data.data.tokens.accessToken);
      localStorage.setItem('refreshToken', data.data.tokens.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));

      // Atualizar store do Zustand
      const { setUser, setTokens } = useAuthStore.getState();
      setUser(data.data.user);
      setTokens(data.data.tokens);

      console.log('Auth data stored successfully');
      toast.success('Login realizado com sucesso!');
    }

    return data;
  } catch (error) {
    console.error('Erro no login:', error);
    toast.error('Erro ao conectar com o servidor');
    return {
      success: false,
      message: 'Erro ao conectar com o servidor',
    };
  }
}

// Função para fazer cadastro
export async function signup(credentials: SignupCredentials): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (data.success && data.data) {
      // Salvar tokens no localStorage
      localStorage.setItem('accessToken', data.data.tokens.accessToken);
      localStorage.setItem('refreshToken', data.data.tokens.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));

      // Atualizar store do Zustand
      const { setUser, setTokens } = useAuthStore.getState();
      setUser(data.data.user);
      setTokens(data.data.tokens);

      toast.success('Conta criada com sucesso!');
    }

    return data;
  } catch (error) {
    console.error('Erro no cadastro:', error);
    toast.error('Erro ao conectar com o servidor');
    return {
      success: false,
      message: 'Erro ao conectar com o servidor',
    };
  }
}

// Função para fazer logout
export function logout(): void {
  // Limpar localStorage
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');

  // Limpar store do Zustand
  const { logout: storeLogout } = useAuthStore.getState();
  storeLogout();

  toast.success('Logout realizado com sucesso!');
}

// Verificar se está autenticado
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  
  const token = localStorage.getItem('accessToken');
  return !!token;
}

// Obter token de acesso
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

// Obter usuário do localStorage
export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
}

// Fazer requisição autenticada
export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const token = getAccessToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers,
    });

    // Se token expirado, fazer logout
    if (response.status === 401) {
      logout();
      window.location.href = '/login';
      return null;
    }

    return response;
  } catch (error) {
    console.error('Erro na requisição autenticada:', error);
    throw error;
  }
}

// Inicializar auth state do localStorage
export function initializeAuth() {
  if (typeof window === 'undefined') return;

  const token = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  const userStr = localStorage.getItem('user');

  if (token && refreshToken && userStr) {
    try {
      const user = JSON.parse(userStr);
      const { setUser, setTokens } = useAuthStore.getState();
      
      setTokens({
        accessToken: token,
        refreshToken: refreshToken,
      });
      setUser(user);
    } catch (error) {
      console.error('Erro ao inicializar auth:', error);
      // Limpar dados corrompidos
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }
}