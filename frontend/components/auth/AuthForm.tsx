'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'tel';
  placeholder: string;
  required?: boolean;
  validation?: (value: string) => string | null;
}

interface AuthFormProps {
  title: string;
  description: string;
  fields: FormField[];
  submitText: string;
  onSubmit: (data: Record<string, string>) => Promise<void>;
  loading?: boolean;
  footerText?: string;
  footerLink?: {
    text: string;
    href: string;
  };
}

export function AuthForm({
  title,
  description,
  fields,
  submitText,
  onSubmit,
  loading = false,
  footerText,
  footerLink,
}: AuthFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Limpar erro do campo quando usuário digita
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const togglePasswordVisibility = (fieldName: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    fields.forEach(field => {
      const value = formData[field.name] || '';

      // Validação obrigatória
      if (field.required && !value.trim()) {
        newErrors[field.name] = `${field.label} é obrigatório`;
        return;
      }

      // Validação customizada
      if (field.validation && value) {
        const error = field.validation(value);
        if (error) {
          newErrors[field.name] = error;
        }
      }
    });

    // Validação especial para confirmação de senha
    if (formData.password && formData.confirmPassword) {
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'As senhas não coincidem';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Erro no formulário:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">{title}</CardTitle>
          <CardDescription className="text-center">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                <div className="relative">
                  <Input
                    id={field.name}
                    name={field.name}
                    type={
                      field.type === 'password' && showPasswords[field.name]
                        ? 'text'
                        : field.type
                    }
                    placeholder={field.placeholder}
                    value={formData[field.name] || ''}
                    onChange={(e) => handleInputChange(field.name, e.target.value)}
                    className={errors[field.name] ? 'border-red-500' : ''}
                    disabled={loading}
                  />
                  {field.type === 'password' && (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      onClick={() => togglePasswordVisibility(field.name)}
                    >
                      {showPasswords[field.name] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
                {errors[field.name] && (
                  <p className="text-sm text-red-600">{errors[field.name]}</p>
                )}
              </div>
            ))}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                submitText
              )}
            </Button>
          </form>

          {(footerText || footerLink) && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                {footerText}{' '}
                {footerLink && (
                  <a
                    href={footerLink.href}
                    className="font-medium text-blue-600 hover:text-blue-500"
                  >
                    {footerLink.text}
                  </a>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Validações comuns
export const validations = {
  email: (value: string): string | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'Email deve ter um formato válido';
    }
    return null;
  },

  password: (value: string): string | null => {
    if (value.length < 8) {
      return 'Senha deve ter pelo menos 8 caracteres';
    }
    return null;
  },

  name: (value: string): string | null => {
    if (value.trim().length < 2) {
      return 'Nome deve ter pelo menos 2 caracteres';
    }
    return null;
  },

  phone: (value: string): string | null => {
    if (value && value.length < 10) {
      return 'Telefone deve ter pelo menos 10 dígitos';
    }
    return null;
  },
};