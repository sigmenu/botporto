// Tipos compartilhados entre frontend e backend

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: 'ADMIN' | 'CLIENT' | 'OPERATOR';
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppSession {
  id: string;
  name: string;
  phoneNumber?: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'EXPIRED';
  qrCode?: string;
  lastConnected?: string;
  autoReply: boolean;
  humanHandover: boolean;
  language: string;
  createdAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  contactId: string;
  messageId: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER';
  content?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  isFromMe: boolean;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: string;
  aiProcessed: boolean;
  aiResponse?: string;
}

export interface Contact {
  id: string;
  sessionId: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  profilePicture?: string;
  tags: string[];
  customFields?: Record<string, any>;
  notes?: string;
  isBlocked: boolean;
  lastMessageAt?: string;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  category: 'RESTAURANT' | 'ECOMMERCE' | 'HEALTHCARE' | 'REALESTATE' | 'EDUCATION' | 'CUSTOM';
  prompts: Record<string, any>;
  quickReplies?: Record<string, any>;
  isPublic: boolean;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  plan: 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: 'ACTIVE' | 'INACTIVE' | 'CANCELLED' | 'PAST_DUE';
  messagesLimit: number;
  messagesUsed: number;
  contactsLimit: number;
  contactsUsed: number;
  sessionsLimit: number;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T = any> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}