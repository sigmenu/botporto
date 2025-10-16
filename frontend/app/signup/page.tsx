'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm, validations } from '@/components/auth/AuthForm';
import { signup, isAuthenticated } from '@/lib/auth';
import { Bot } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Redirecionar se já estiver logado
  useEffect(() => {
    if (isAuthenticated()) {
      router.push('/dashboard');
    }
  }, [router]);

  const handleSignup = async (data: Record<string, string>) => {
    setLoading(true);
    
    try {
      const result = await signup({
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone || undefined,
      });

      if (result.success) {
        // Mostrar mensagem de sucesso e redirecionar
        toast.success('Conta criada com sucesso! Bem-vindo!');
        router.push('/dashboard');
      } else {
        // Mostrar erro
        toast.error(result.message || 'Erro ao criar conta');
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      toast.error('Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
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

      <AuthForm
        title="Criar sua conta"
        description="Comece grátis e automatize seu WhatsApp com IA"
        fields={[
          {
            name: 'name',
            label: 'Nome completo',
            type: 'text',
            placeholder: 'Seu nome',
            required: true,
            validation: validations.name,
          },
          {
            name: 'email',
            label: 'Email',
            type: 'email',
            placeholder: 'seu@email.com',
            required: true,
            validation: validations.email,
          },
          {
            name: 'phone',
            label: 'Telefone (opcional)',
            type: 'tel',
            placeholder: '(11) 99999-9999',
            validation: validations.phone,
          },
          {
            name: 'password',
            label: 'Senha',
            type: 'password',
            placeholder: 'Sua senha (min. 8 caracteres)',
            required: true,
            validation: validations.password,
          },
          {
            name: 'confirmPassword',
            label: 'Confirmar senha',
            type: 'password',
            placeholder: 'Digite a senha novamente',
            required: true,
          },
        ]}
        submitText="Criar conta grátis"
        onSubmit={handleSignup}
        loading={loading}
        footerText="Já tem uma conta?"
        footerLink={{
          text: 'Faça login',
          href: '/login',
        }}
      />

      {/* Benefícios */}
      <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border max-w-sm">
        <h4 className="font-semibold text-gray-900 mb-2">🎉 Plano Gratuito Inclui</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <div>✅ 100 mensagens por mês</div>
          <div>✅ 1 sessão do WhatsApp</div>
          <div>✅ IA integrada</div>
          <div>✅ Templates prontos</div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Sem cartão de crédito necessário
        </p>
      </div>
    </div>
  );
}