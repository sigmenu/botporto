import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  name: string
  company?: string
  phone?: string
  role: string
  plan: string
  isFirstLogin: boolean
  onboardingStep: number
  emailVerified: boolean
  subscription?: {
    plan: string
    status: string
    messagesLimit: number
    messagesUsed: number
  }
}

interface AuthTokens {
  accessToken: string
  refreshToken: string
}

interface AuthStore {
  user: User | null
  tokens: AuthTokens | null
  isLoading: boolean
  setUser: (user: User) => void
  updateUser: (updates: Partial<User>) => void
  setTokens: (tokens: AuthTokens) => void
  setLoading: (loading: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      updateUser: (updates) => set((state) => ({ 
        user: state.user ? { ...state.user, ...updates } : null 
      })),
      setTokens: (tokens) => set({ tokens }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, tokens: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
)