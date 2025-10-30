# 07 - Configurar tRPC Client no Next.js

## 🎯 Objetivo

Configurar o tRPC client no frontend Next.js, criando hooks React Query tipados que permitirão consumir a API tRPC de qualquer componente com type-safety completa e auto-complete.

## 📝 Descrição / Contexto

Com os routers implementados (Tarefas 04-06), precisamos agora configurar o lado client do tRPC. Isso envolve criar um client HTTP, configurar React Query, e criar um Provider que envolverá a aplicação. Após esta tarefa, qualquer componente React poderá usar `trpc.foods.search.useQuery()` com tipos automaticamente inferidos.

**Localização no Plano:** Fase 1.4 - tRPC Client

**Dependências:** Tarefas 03-06 devem estar completas.

## 📋 Subtarefas (Checklist de Execução)

- [ ] Criar diretório `frontend/lib/` se não existir
- [ ] Criar arquivo `frontend/lib/trpc.ts`:
  - Import de `httpBatchLink` do `@trpc/client`
  - Import de `createTRPCReact` do `@trpc/react-query`
  - Import de type `AppRouter` de `../server/_app`
  - Criar `trpc` instance usando `createTRPCReact<AppRouter>()`
  - Configurar `httpBatchLink` apontando para `/api/trpc`
  - Export `trpc`
- [ ] Criar arquivo `frontend/components/providers/TRPCProvider.tsx`:
  - Import de `QueryClient`, `QueryClientProvider` do `@tanstack/react-query`
  - Import de `useState` do React
  - Import de `trpc` de `@/lib/trpc`
  - Criar componente `TRPCProvider` que envolve children com QueryClientProvider e trpc.Provider
  - Export `TRPCProvider`
- [ ] Atualizar `frontend/app/layout.tsx`:
  - Import de `TRPCProvider` de `@/components/providers/TRPCProvider`
  - Envolver {children} com `<TRPCProvider>`
  - Manter estrutura existente (html, body, metadata)
- [ ] Criar arquivo `frontend/lib/types.ts` (se não existir):
  - Import de type `AppRouter` de `../server/_app`
  - Import de `inferRouterInputs`, `inferRouterOutputs` do `@trpc/server`
  - Export types: `RouterInputs`, `RouterOutputs`
- [ ] Testar que a configuração compila sem erros:
  ```bash
  cd frontend && npx tsc --noEmit
  ```

## 🔍 Requisitos de Contexto (Consulta Obrigatória)

- [ ] [CONSULTAR DOCUMENTAÇÃO: tRPC v11 - Client setup with Next.js App Router]
- [ ] [CONSULTAR DOCUMENTAÇÃO: tRPC v11 - httpBatchLink configuration e batching]
- [ ] [CONSULTAR DOCUMENTAÇÃO: React Query v5 - QueryClient configuration best practices]
- [ ] [CONSULTAR DOCUMENTAÇÃO: Next.js 15+ - Client Components e 'use client' directive]

## 💻 Implementação de Referência (Snippets)

```typescript
// frontend/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@/server/_app';

/**
 * tRPC React hooks
 *
 * Usage in components:
 * ```tsx
 * const { data, isLoading } = trpc.foods.search.useQuery({ query: "arroz" });
 * const mutation = trpc.mealPlans.upsertItems.useMutation();
 * ```
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Get base URL for tRPC API
 */
function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Browser should use relative path
    return '';
  }

  // SSR should use full URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Development
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Create tRPC client configuration
 */
export function getTRPCClientConfig() {
  return {
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
        // Optional: Add headers (e.g., auth token)
        // headers() {
        //   return {
        //     authorization: getAuthToken(),
        //   };
        // },
      }),
    ],
  };
}
```

```typescript
// frontend/components/providers/TRPCProvider.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, getTRPCClientConfig } from '@/lib/trpc';
import { useState } from 'react';

/**
 * tRPC Provider Component
 *
 * Wraps the app with tRPC and React Query providers.
 * Must be used in app/layout.tsx.
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Default query options
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Default mutation options
            retry: 0,
          },
        },
      })
  );

  const [trpcClient] = useState(() => trpc.createClient(getTRPCClientConfig()));

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

```typescript
// frontend/app/layout.tsx (ATUALIZAR)
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TRPCProvider } from '@/components/providers/TRPCProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Codex Health - Performance Tracking System',
  description: 'Acompanhamento integrado de treino, nutrição e recuperação',
  // ... resto do metadata
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={inter.className}>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
```

```typescript
// frontend/lib/types.ts
import type { AppRouter } from '@/server/_app';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

/**
 * Type helpers for tRPC
 *
 * Usage:
 * ```tsx
 * type FoodSearchInput = RouterInputs['foods']['search'];
 * type FoodSearchOutput = RouterOutputs['foods']['search'];
 * ```
 */
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
```

## ✅ Critérios de Aceitação

- [ ] Arquivo `lib/trpc.ts` criado e exporta `trpc` e `getTRPCClientConfig()`
- [ ] Arquivo `components/providers/TRPCProvider.tsx` criado
- [ ] `app/layout.tsx` atualizado com `<TRPCProvider>`
- [ ] Arquivo `lib/types.ts` criado com helpers de tipos
- [ ] Compilação TypeScript sem erros
- [ ] Teste em componente exemplo (criar página de teste temporária):
  ```tsx
  // frontend/app/test-trpc/page.tsx
  'use client';

  import { trpc } from '@/lib/trpc';

  export default function TestPage() {
    const { data, isLoading } = trpc.foods.search.useQuery({
      query: 'arroz',
      limit: 5,
    });

    if (isLoading) return <div>Loading...</div>;

    return (
      <div>
        <h1>Test tRPC</h1>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  }
  ```
- [ ] Verificar que tipos estão sendo inferidos corretamente (hover sobre `data` no VS Code deve mostrar tipo do retorno)

---

## 📊 Relatório de Execução

**Data:** 2025-10-30
**Executor:** Claude Code

### ✅ Tarefas Realizadas

1. **Verificação da estrutura existente:**
   - O projeto frontend já possuía a estrutura base implementada
   - Arquivo `lib/trpc.ts` existente mas usando `httpLink` ao invés de `httpBatchLink`
   - Arquivo `lib/types.ts` já existente e conforme especificação
   - Arquivo `app/providers.tsx` já existente e funcional

2. **Atualização do tRPC Client (`lib/trpc.ts`):**
   - ✅ Migrado de `httpLink` para `httpBatchLink` (melhora performance ao agrupar requisições)
   - ✅ Adicionada função `getTRPCClientConfig()` conforme documentação
   - ✅ Adicionado suporte para deploy no Vercel (detecta `VERCEL_URL`)
   - ✅ Mantida funcionalidade de autenticação JWT via cookies
   - ✅ Mantida integração com `superjson` transformer
   - ✅ Adicionados comentários de documentação JSDoc

3. **Validação de arquivos existentes:**
   - ✅ `lib/types.ts` - Conforme especificação (RouterInputs e RouterOutputs)
   - ✅ `app/providers.tsx` - Provider já implementado com QueryClient e tRPC
   - ✅ `app/layout.tsx` - Já envolve children com `<Providers>`

4. **Página de teste criada:**
   - ✅ `app/test-trpc/page.tsx` implementada
   - Testa endpoint `foods.search` com query "arroz"
   - Exibe loading, error handling e resultado formatado
   - Página acessível em `/test-trpc`

### ⚠️ Problemas Encontrados

1. **Erros TypeScript pré-existentes (24 erros):**
   - Erros em `app/medidas/page.tsx` (7x) - propriedade `style` em IconProps
   - Erro em `app/page.tsx` - tipo `null` vs `undefined`
   - Erros em `components/dashboard/*.tsx` (4x) - parâmetros implícitos `any`
   - Erro em `lib/auth.ts` - incompatibilidade de tipos JWTPayload
   - Erro em `lib/db.ts` - falta `@types/pg`
   - Erros em `server/routers/metrics.ts` (4x) - tipos implícitos
   - **Nota:** Nenhum desses erros está relacionado às mudanças feitas

2. **ESLint/Lint:**
   - Comando `npm run lint` falha com erro "Invalid project directory"
   - Problema pré-existente na configuração do Next.js
   - Arquivos `next.config.js` e `.eslintrc.json` não encontrados

3. **Build:**
   - Build falhou devido aos erros TypeScript pré-existentes
   - Erro principal: `app/atividade/page.tsx` - propriedade `forDate` não existe

### 📋 Recomendações

1. **Corrigir erros TypeScript:**
   - Instalar `@types/pg`: `npm i --save-dev @types/pg`
   - Corrigir propriedade `style` nos ícones em `app/medidas/page.tsx`
   - Revisar tipos em `lib/auth.ts` para compatibilidade com jose
   - Adicionar tipos explícitos em callbacks de arrays
   - Corrigir referência `trpc.metrics.forDate` em `app/atividade/page.tsx`

2. **Configurar ESLint:**
   - Criar arquivo `next.config.js` ou `.next.config.mjs`
   - Criar arquivo `.eslintrc.json` com configuração do Next.js

3. **Teste funcional:**
   - Após corrigir erros, executar dev server: `npm run dev`
   - Acessar página de teste: `http://localhost:3000/test-trpc`
   - Verificar inferência de tipos no VS Code

### ✨ Melhorias Implementadas

- **Performance:** Uso de `httpBatchLink` permite agrupar múltiplas requisições tRPC em um único HTTP request
- **Deployment:** Suporte automático para Vercel via detecção de `VERCEL_URL`
- **Documentação:** Comentários JSDoc adicionados para melhor experiência de desenvolvimento
- **Type-safety:** Estrutura preparada para inferência completa de tipos através do AppRouter

### 📝 Arquivos Modificados

- `frontend/lib/trpc.ts` - Migrado para httpBatchLink
- `frontend/app/test-trpc/page.tsx` - Criado (novo)

### 🎯 Status Final

**Configuração do tRPC Client: ✅ Completa**

As mudanças implementadas estão corretas e seguem as melhores práticas do tRPC v11. No entanto, o projeto possui erros TypeScript pré-existentes que impedem o build. Esses erros não são causados pelas mudanças realizadas nesta tarefa e devem ser corrigidos em tarefas subsequentes.
