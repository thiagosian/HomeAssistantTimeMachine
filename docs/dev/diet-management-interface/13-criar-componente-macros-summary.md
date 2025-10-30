# 13 - Criar Componente MacrosSummary

## 🎯 Objetivo

Criar componente React `MacrosSummary` que exibe um dashboard comparativo estilo Whoop mostrando macros atuais vs targets com progress bars coloridas e validação visual (±5% = verde, >10% = vermelho).

## 📝 Descrição / Contexto

Este componente é o "painel de controle" da dieta, mostrando visualmente se o plano está cumprindo os targets de proteína, carboidratos e gordura. Usa cores semânticas para indicar status (verde = ok, amarelo = warning, vermelho = erro) e calcula calorias totais automaticamente.

É usado tanto nas páginas de criação/edição quanto na visualização de planos.

**Localização no Plano:** Fase 3.4 - Componentes Core de Nutrição

**Dependências:** Tarefa 09 (shadcn/ui) deve estar completa.

## 📋 Subtarefas (Checklist de Execução)

- [ ] Criar arquivo `frontend/components/nutrition/MacrosSummary.tsx`
- [ ] Adicionar directive `'use client'`
- [ ] Imports necessários:
  - `Card`, `CardHeader`, `CardTitle`, `CardContent` de `@/components/ui/card`
  - `Progress` de `@/components/ui/progress` (se não existir, usar div com width%)
  - `Badge` de `@/components/ui/badge`
  - `CheckCircle2`, `AlertTriangle`, `XCircle` icons de `lucide-react`
  - `cn` de `@/lib/utils`
- [ ] Definir types:
  ```typescript
  type MacrosSummaryData = {
    actualProteinG: number;
    actualCarbsG: number;
    actualFatG: number;
    targetProteinG: number;
    targetCarbsG: number;
    targetFatG: number;
  };
  ```
- [ ] Criar componente com props:
  - `data: MacrosSummaryData`
  - `showDetails?: boolean` (mostrar números detalhados)
- [ ] Implementar função `calculateDeviation(actual, target)`:
  - Retorna percentual de desvio
  - Retorna status: 'success' (±5%), 'warning' (5-10%), 'error' (>10%)
- [ ] Implementar função `calculateTotalKcal(protein, carbs, fat)`:
  - Protein: 4 kcal/g
  - Carbs: 4 kcal/g
  - Fat: 9 kcal/g
- [ ] Render 3 MacroRow components:
  - Cada row: nome do macro + atual/target + progress bar + badge de status
  - Progress bar color based on status
  - Icon based on status (Check/Warning/X)
- [ ] Render total de calorias (atual vs target calculado)
- [ ] Estilos Whoop com gradientes específicos para cada macro
- [ ] Export do componente

## 🔍 Requisitos de Contexto (Consulta Obrigatória)

- [ ] [CONSULTAR DOCUMENTAÇÃO: shadcn/ui - Progress component]
- [ ] [CONSULTAR DOCUMENTAÇÃO: shadcn/ui - Badge variants]

## 💻 Implementação de Referência (Snippets)

```typescript
// frontend/components/nutrition/MacrosSummary.tsx
'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MacrosSummaryData = {
  actualProteinG: number;
  actualCarbsG: number;
  actualFatG: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
};

interface MacrosSummaryProps {
  data: MacrosSummaryData;
  showDetails?: boolean;
}

type Status = 'success' | 'warning' | 'error';

/**
 * Calculate deviation percentage and status
 */
function calculateDeviation(actual: number, target: number): {
  percentage: number;
  status: Status;
} {
  const diff = Math.abs(actual - target);
  const percentage = (diff / target) * 100;

  let status: Status = 'success';
  if (percentage > 10) {
    status = 'error';
  } else if (percentage > 5) {
    status = 'warning';
  }

  return { percentage, status };
}

/**
 * Calculate total calories
 */
function calculateTotalKcal(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

/**
 * Get status icon
 */
function getStatusIcon(status: Status) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
  }
}

/**
 * Macro Row Component
 */
function MacroRow({
  label,
  actual,
  target,
  color,
}: {
  label: string;
  actual: number;
  target: number;
  color: string;
}) {
  const { percentage: deviation, status } = calculateDeviation(actual, target);
  const progress = Math.min((actual / target) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon(status)}
          <span className="font-semibold text-sm">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono">
            <span className={cn('font-bold', color)}>
              {actual.toFixed(1)}g
            </span>
            <span className="text-muted-foreground"> / {target}g</span>
          </span>
          {deviation > 5 && (
            <Badge
              variant={status === 'error' ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {actual > target ? '+' : '-'}
              {deviation.toFixed(0)}%
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            'h-full transition-all duration-300',
            status === 'success' && 'bg-green-500',
            status === 'warning' && 'bg-yellow-500',
            status === 'error' && 'bg-red-500'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Macros Summary Component
 *
 * Displays macro comparison with target values.
 *
 * @example
 * ```tsx
 * <MacrosSummary
 *   data={{
 *     actualProteinG: 185,
 *     actualCarbsG: 195,
 *     actualFatG: 62,
 *     targetProteinG: 180,
 *     targetCarbsG: 200,
 *     targetFatG: 60,
 *   }}
 *   showDetails
 * />
 * ```
 */
export function MacrosSummary({ data, showDetails = true }: MacrosSummaryProps) {
  const actualKcal = calculateTotalKcal(
    data.actualProteinG,
    data.actualCarbsG,
    data.actualFatG
  );

  const targetKcal = calculateTotalKcal(
    data.targetProteinG,
    data.targetCarbsG,
    data.targetFatG
  );

  const kcalDeviation = calculateDeviation(actualKcal, targetKcal);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Resumo de Macros</span>
          {showDetails && (
            <Badge
              variant={
                kcalDeviation.status === 'success'
                  ? 'default'
                  : kcalDeviation.status === 'warning'
                  ? 'secondary'
                  : 'destructive'
              }
              className="text-sm"
            >
              {actualKcal.toFixed(0)} kcal / {targetKcal.toFixed(0)} kcal
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Protein */}
        <MacroRow
          label="Proteína"
          actual={data.actualProteinG}
          target={data.targetProteinG}
          color="text-cyan-400"
        />

        {/* Carbs */}
        <MacroRow
          label="Carboidratos"
          actual={data.actualCarbsG}
          target={data.targetCarbsG}
          color="text-yellow-400"
        />

        {/* Fat */}
        <MacroRow
          label="Gordura"
          actual={data.actualFatG}
          target={data.targetFatG}
          color="text-red-400"
        />

        {/* Summary */}
        {showDetails && (
          <div className="mt-4 rounded-lg border border-border/50 bg-card/50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status Geral:</span>
              <div className="flex items-center gap-2">
                {[data.actualProteinG, data.actualCarbsG, data.actualFatG].every(
                  (actual, i) => {
                    const target = [
                      data.targetProteinG,
                      data.targetCarbsG,
                      data.targetFatG,
                    ][i];
                    return calculateDeviation(actual, target).status === 'success';
                  }
                ) ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="font-semibold text-green-500">
                      Dentro da tolerância (±5%)
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="font-semibold text-yellow-500">
                      Requer ajuste
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

## ✅ Critérios de Aceitação

- [ ] Arquivo `components/nutrition/MacrosSummary.tsx` criado
- [ ] Type `MacrosSummaryData` definido e exportado
- [ ] 3 MacroRow components renderizados (Proteína, Carboidratos, Gordura)
- [ ] Progress bars com cores baseadas em status:
  - Verde: ±5%
  - Amarelo: 5-10%
  - Vermelho: >10%
- [ ] Badges de desvio mostrados apenas quando >5%
- [ ] Calorias totais calculadas corretamente (P*4 + C*4 + F*9)
- [ ] Status geral exibido quando `showDetails={true}`
- [ ] Estilos Whoop com glass-card effect
- [ ] Compilação TypeScript sem erros
- [ ] Teste visual com diferentes cenários:
  ```tsx
  // Cenário 1: Tudo ok (±5%)
  <MacrosSummary data={{
    actualProteinG: 182,
    actualCarbsG: 198,
    actualFatG: 58,
    targetProteinG: 180,
    targetCarbsG: 200,
    targetFatG: 60,
  }} />

  // Cenário 2: Warning (5-10% desvio)
  <MacrosSummary data={{
    actualProteinG: 165,
    actualCarbsG: 220,
    actualFatG: 55,
    targetProteinG: 180,
    targetCarbsG: 200,
    targetFatG: 60,
  }} />

  // Cenário 3: Error (>10% desvio)
  <MacrosSummary data={{
    actualProteinG: 150,
    actualCarbsG: 250,
    actualFatG: 75,
    targetProteinG: 180,
    targetCarbsG: 200,
    targetFatG: 60,
  }} />
  ```

---

## 📊 Relatório de Execução

**Data:** 2025-10-30
**Status:** ✅ Concluído com sucesso

### Arquivos Criados/Modificados

1. **`codex/frontend/components/nutrition/MacrosSummary.tsx`**
   - Componente completamente reescrito conforme especificação
   - Implementação com todos os recursos solicitados:
     - Tipo `MacrosSummaryData` exportado
     - Funções `calculateDeviation()` e `calculateTotalKcal()`
     - Componente interno `MacroRow` com progress bars coloridas
     - Sistema de status (success/warning/error) baseado em desvio percentual
     - Badges de desvio exibidos apenas quando >5%
     - Status geral com validação de todos os macros
     - Estilos Whoop com glass-card effect

2. **`codex/frontend/app/planos/page.tsx`**
   - Atualizado para usar nova interface do MacrosSummary
   - Props alteradas de `totals/targets` para `data` estruturado
   - Adicionada diretiva `'use client'` para corrigir erro de build

### Validações Executadas

- ✅ **TypeScript**: Compilação sem erros (`npx tsc --noEmit`)
- ✅ **ESLint**: Sem warnings ou erros (`npm run lint`)
- ✅ **Build**: Produção compilada com sucesso (`npm run build`)

### Características Implementadas

- **Progress Bars Dinâmicas**: Cores baseadas em status (verde ±5%, amarelo 5-10%, vermelho >10%)
- **Cálculo de Calorias**: Automático usando fórmula correta (P×4 + C×4 + F×9)
- **Visual Feedback**: Ícones (CheckCircle, AlertTriangle, XCircle) e badges de desvio
- **Responsividade**: Layout otimizado com shadcn/ui components
- **TypeScript Completo**: Tipagem forte com interfaces exportadas

### Melhorias Aplicadas

- Correção de bug no arquivo de teste `app/planos/page.tsx` que estava usando interface antiga
- Adição de `'use client'` necessária para Next.js 16 com event handlers
