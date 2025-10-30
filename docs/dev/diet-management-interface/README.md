# Interface Web Completa para Gestão de Dietas - Roadmap de Implementação

## 📊 Progresso Geral

**Status:** 14 de 29 tarefas documentadas em detalhes

- ✅ **Fase 1:** Infraestrutura tRPC (Tarefas 01-08) - 8 tarefas COMPLETAS
- ✅ **Fase 2:** Componentes shadcn/ui (Tarefa 09) - 1 tarefa COMPLETA
- ✅ **Fase 3:** Componentes Core de Nutrição (Tarefas 10-14) - 5 tarefas COMPLETAS
- ⏳ **Fase 4:** Páginas da Aplicação (Tarefas 15-19) - Resumo abaixo
- ⏳ **Fase 5:** Features Avançadas (Tarefas 20-24) - Resumo abaixo
- ⏳ **Fase 6:** Polish & Testing (Tarefas 25-29) - Resumo abaixo

---

## 📋 Tarefas Detalhadas (01-14)

### Fase 1: Infraestrutura tRPC
- `[01]` Criar Modelos Pydantic para Meal Planning
- `[02]` Criar Database Methods para Foods e Meal Plan Items
- `[03]` Setup tRPC Server - Infraestrutura Base
- `[04]` Criar tRPC Router de Foods
- `[05]` Criar tRPC Router de Meal Plans
- `[06]` Criar tRPC Router de Intervention Plans
- `[07]` Configurar tRPC Client no Next.js
- `[08]` Criar Next.js API Route para tRPC

### Fase 2: Componentes shadcn/ui
- `[09]` Instalar Componentes shadcn/ui Necessários

### Fase 3: Componentes Core de Nutrição
- `[10]` Criar Componente FoodSearchCombobox
- `[11]` Criar Componente MealItemRow
- `[12]` Criar Componente MealCard
- `[13]` Criar Componente MacrosSummary
- `[14]` Criar Componente DietPlanMetadata

---

## 🚀 Tarefas Resumidas (15-29)

### Fase 4: Páginas da Aplicação (15-19)

#### [15] - Implementar Página /app/dietas/page.tsx (Lista de Dietas)

**Objetivo:** Página principal com tabs "Ativo" e "Histórico" mostrando planos de dieta.

**Estrutura:**
- Tab "Ativo":
  - Query: `trpc.interventionPlans.getActive.useQuery({ type: 'nutrition' })`
  - Exibe plano ativo com `MacrosSummary` e lista de meals (read-only)
  - Botões: [Ver Detalhes] [Editar] [Criar Novo]
- Tab "Histórico":
  - Query: `trpc.interventionPlans.getHistory.useQuery({ type: 'nutrition', page: 1, pageSize: 10 })`
  - Table paginada com filtros
  - Ações: [Ver] [Duplicar] [Deletar]

**Arquivo:** `frontend/app/dietas/page.tsx`

**Componentes Usados:** `Tabs`, `Table`, `Button`, `MacrosSummary`, `MealCard`

---

#### [16] - Implementar Página /app/dietas/novo/page.tsx (Criar Nova Dieta)

**Objetivo:** Wizard de 3 steps para criar nova dieta com meals.

**Estrutura:**
- **Step 1:** Metadata
  - Componente: `<DietPlanMetadata onSubmit={handleMetadata} />`
  - Salva em state local
- **Step 2:** Meal Builder
  - Lista de `<MealCard>` editáveis
  - Botão "Adicionar Refeição"
  - State para array de meals
- **Step 3:** Review & Submit
  - Preview de metadata
  - `<MacrosSummary>` com totais calculados
  - Validação ±15% (warning se >5%)
  - Mutation: `trpc.interventionPlans.create.useMutation()` + `trpc.mealPlans.upsertItems.useMutation()`

**Arquivo:** `frontend/app/dietas/novo/page.tsx`

**Navigation:** Redirect para `/dietas/[id]` após sucesso

---

#### [17] - Implementar Página /app/dietas/[id]/page.tsx (Visualizar Dieta)

**Objetivo:** View detalhado de um plano com meals (read-only).

**Estrutura:**
- Layout 2 colunas:
  - **Esquerda (40%):**
    - Card com metadata (nome, objetivo, datas)
    - `<MacrosSummary>` com atual vs target
    - Actions: [Editar] [Duplicar] [Fechar Plano]
  - **Direita (60%):**
    - Lista de `<MealCard>` em read-only mode
    - Totais por refeição
    - Totais diários

**Query:** `trpc.interventionPlans.getById.useQuery({ planId })`

**Arquivo:** `frontend/app/dietas/[id]/page.tsx`

**Mutations:**
- Fechar plano: `trpc.interventionPlans.close.useMutation()`
- Duplicar: `trpc.interventionPlans.duplicate.useMutation()` → redirect

---

#### [18] - Implementar Página /app/dietas/[id]/editar/page.tsx (Editar Dieta)

**Objetivo:** Edição de plano existente (metadata + meals).

**Estrutura:**
- Form similar ao `/novo` mas pre-populated
- Fetch: `trpc.interventionPlans.getById.useQuery()`
- Section 1: `<DietPlanMetadata defaultValues={plan} />`
- Section 2: Lista de `<MealCard>` editáveis
- Drag-drop para reordenar meals
- Mutations:
  - `trpc.interventionPlans.update.useMutation()` (metadata)
  - `trpc.mealPlans.upsertItems.useMutation()` (meals)

**Arquivo:** `frontend/app/dietas/[id]/editar/page.tsx`

**Navigation:** Redirect para `/dietas/[id]` após sucesso

---

#### [19] - Implementar Página /app/dietas/historico/page.tsx (Histórico Completo)

**Objetivo:** Table avançada com histórico completo de todos os planos.

**Estrutura:**
- Query: `trpc.interventionPlans.getHistory.useQuery({ page, pageSize, type: 'nutrition' })`
- Table com colunas:
  - Nome | Objetivo | Válido De-Até | Proteína | Carbos | Gordura | Calorias | Change Reason | Ações
- Filtros:
  - Search por nome
  - Filtro por objetivo (select)
  - Filtro por período (date range)
- Paginação server-side (shadcn/ui Pagination)
- Modal de preview ao clicar em row (Dialog)

**Arquivo:** `frontend/app/dietas/historico/page.tsx`

**Componentes:** `Table`, `Dialog`, `Input`, `Select`, Pagination

---

### Fase 5: Features Avançadas (20-24)

#### [20] - Implementar Drag & Drop para Reordenar

**Objetivo:** Permitir reordenar meals e items dentro de meals via drag-drop.

**Biblioteca:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

**Implementação:**
- Adicionar `useSortable` hook em `MealCard` e `MealItemRow`
- Adicionar drag handles (GripVertical icon)
- Mutation: `trpc.mealPlans.reorderItems.useMutation()`
- Update meal_order de todos os items afetados em transaction

**Arquivos:**
- `frontend/components/nutrition/MealCard.tsx` (adicionar sortable)
- `frontend/components/nutrition/MealItemRow.tsx` (adicionar sortable)

---

#### [21] - Implementar Templates de Refeições

**Objetivo:** Salvar e reutilizar refeições como templates.

**Backend:**
- Nova tabela: `meal_templates` (id, user_id, name, items JSONB)
- Novo router: `frontend/server/routers/mealTemplates.ts`
  - `list()` - listar templates do usuário
  - `create()` - salvar template
  - `getById()` - buscar template
  - `delete()` - deletar template

**Frontend:**
- Componente: `MealTemplateSelector` (combobox de templates)
- Botão "Salvar como Template" em cada `MealCard`
- Botão "Carregar Template" ao adicionar nova refeição
- Dialog para nome do template

**Arquivos:**
- `frontend/components/nutrition/MealTemplateSelector.tsx`
- `frontend/server/routers/mealTemplates.ts`

---

#### [22] - Implementar Copiar Refeições

**Objetivo:** Duplicar refeições dentro de um plano.

**Implementação:**
- Botão "Duplicar Refeição" em cada `MealCard`
- Modal: "Copiar para qual ordem?" (input number)
- Cria novo `MealInPlan` com items copiados
- Ajusta meal_order dos meals existentes

**Não requer backend adicional** (usa state local e upsertItems)

---

#### [23] - Implementar Validação em Tempo Real

**Objetivo:** Feedback visual imediato ao editar meals.

**Implementação:**
- Hook: `useMacroValidation(meals, targets)`
- Calcula totais em real-time
- Retorna status: 'success' | 'warning' | 'error'
- Toast warnings quando desvio >10%
- Badge de status em `MacrosSummary` atualizado dinamicamente

**Componente:**
- Hook customizado: `frontend/hooks/useMacroValidation.ts`
- Integração em páginas `/novo` e `/[id]/editar`

---

#### [24] - Implementar Gráficos Comparativos

**Objetivo:** Visualizar evolução de macros ao longo do tempo.

**Biblioteca:** `recharts` (já instalada)

**Gráficos:**
1. **Bar Chart:** Target vs Atual (por macro) - em `/dietas/[id]`
2. **Line Chart:** Evolução de macros ao longo do tempo - em `/dietas/historico`
3. **Pie Chart:** Distribuição calórica (P/C/F %) - em `/dietas/[id]`

**Componente:** `frontend/components/nutrition/MacroComparisonChart.tsx`

**Query:** `trpc.interventionPlans.getHistory()` para dados históricos

---

### Fase 6: Polish & Testing (25-29)

#### [25] - Implementar Loading States e Optimistic Updates

**Objetivo:** UX fluida com feedback visual durante operações.

**Implementação:**
- Skeleton components para todas as queries
- Loading spinners em buttons durante mutations
- Optimistic updates em:
  - Editar quantity de item
  - Adicionar/remover item de meal
  - Reordenar items
- React Query `onMutate` e `onSettled` callbacks

**Componentes:**
- `Skeleton` (shadcn/ui) - já instalado
- Wrapping queries com loading states

---

#### [26] - Implementar Error Handling Completo

**Objetivo:** Tratamento robusto de erros com feedback ao usuário.

**Implementação:**
- Error boundaries em páginas principais
- Toast notifications para erros (usando `sonner`)
- Error states em queries:
  - Empty states customizados
  - Retry buttons
  - Error messages descritivas
- Validation errors em forms (já implementado em Fase 3)

**Componentes:**
- `ErrorBoundary` wrapper component
- `ErrorState` component reutilizável

---

#### [27] - Implementar Responsive Design

**Objetivo:** Interface adaptável para mobile, tablet e desktop.

**Breakpoints:**
- Mobile: < 640px (sm)
- Tablet: 640-1024px (md/lg)
- Desktop: > 1024px (xl)

**Adaptações:**
- Mobile:
  - Tabs verticais → stacked
  - Table → cards scrollable
  - 2-column layout → single column
  - Sidebar collapsible
- Tablet:
  - Layout otimizado para toque
  - Combobox com touch-friendly target size

**CSS:** Tailwind responsive utilities (`sm:`, `md:`, `lg:`)

---

#### [28] - Implementar Melhorias de Acessibilidade

**Objetivo:** Garantir interface acessível (WCAG 2.1 Level AA).

**Implementação:**
- ARIA labels em todos os interactive elements
- Keyboard navigation:
  - Tab order lógico
  - Enter/Space para selecionar
  - Esc para fechar modals
  - Arrow keys em combobox
- Focus management:
  - Visible focus indicators
  - Trap focus em modals
  - Restore focus ao fechar
- Screen reader support:
  - Semantic HTML
  - `role` attributes onde necessário
  - `aria-live` regions para updates dinâmicos

**Teste:** axe DevTools

---

#### [29] - Criar Testes E2E

**Objetivo:** Testes end-to-end dos fluxos críticos.

**Framework:** Playwright (já usado em MCP)

**Cenários de Teste:**
1. **Criar Dieta Completa:**
   - Preencher metadata
   - Adicionar 3 meals com 2-3 foods cada
   - Validar macros
   - Submeter
   - Verificar redirecionamento
2. **Editar Dieta Existente:**
   - Abrir plano
   - Editar quantidade de item
   - Adicionar novo item
   - Remover item
   - Salvar
   - Verificar persistência
3. **Validação de Macros:**
   - Criar plano com macros fora da tolerância
   - Verificar warning exibido
   - Corrigir macros
   - Verificar status verde

**Arquivo:** `frontend/e2e/diet-management.spec.ts`

---

## 🎯 Ordem de Execução Recomendada

### Sprint 1: Fundação (Tarefas 01-09) - ~6-8 horas
Backend + tRPC + shadcn/ui

### Sprint 2: Componentes (Tarefas 10-14) - ~6-8 horas
Componentes core reutilizáveis

### Sprint 3: Páginas Principais (Tarefas 15-18) - ~8-10 horas
CRUD completo de dietas

### Sprint 4: Histórico + Features (Tarefas 19-22) - ~6-8 horas
Histórico + Drag-drop + Templates

### Sprint 5: Validação + Charts (Tarefas 23-24) - ~3-4 horas
Real-time validation + Gráficos

### Sprint 6: Polish + Testing (Tarefas 25-29) - ~6-8 horas
Loading, Errors, Responsive, A11y, E2E

**Total Estimado:** 35-46 horas de desenvolvimento

---

## 📦 Dependências Entre Tarefas

```
[01,02] → [03] → [04,05,06] → [07] → [08]
         ↓
[09] → [10,11,12,13,14]
      ↓
[15,16,17,18,19]
      ↓
[20,21,22,23,24]
      ↓
[25,26,27,28,29]
```

**Crítico:** Tarefas 01-08 devem ser completadas antes de qualquer outra.

---

## ✅ Checklist de Conclusão

- [ ] Todas as 29 tarefas implementadas
- [ ] Compilação TypeScript sem erros
- [ ] Todas as queries tRPC funcionando
- [ ] Todas as mutations tRPC funcionando
- [ ] Componentes renderizando corretamente
- [ ] Páginas navegáveis
- [ ] Drag-drop funcional
- [ ] Templates funcionais
- [ ] Validação em tempo real funcional
- [ ] Gráficos renderizando
- [ ] Loading states implementados
- [ ] Error handling implementado
- [ ] Responsive design implementado
- [ ] Acessibilidade verificada
- [ ] Testes E2E passando

---

## 🚢 Entrega Final

Após conclusão das 29 tarefas, o sistema terá:

✅ CRUD completo de dietas (criar, editar, visualizar, deletar)
✅ Gestão detalhada de refeições e alimentos
✅ Busca de alimentos com autocomplete
✅ Cálculo automático de macros em tempo real
✅ Validação visual com feedback imediato
✅ Drag & drop para reordenar
✅ Templates de refeições
✅ Histórico completo com filtros
✅ Gráficos comparativos
✅ Design Whoop consistente
✅ Type-safety completa (tRPC + Zod)
✅ Responsive e acessível
✅ Production-ready

**Interface web completa para gestão de dietas no Codex Health System!** 🎉
