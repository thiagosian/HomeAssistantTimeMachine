# 05 - Criar tRPC Router de Meal Plans

## 🎯 Objetivo

Implementar o router tRPC `mealPlansRouter` com 5 endpoints para gerenciar meal plan items (CRUD + cálculo de macros), permitindo criação, edição e visualização de refeições detalhadas.

## 📝 Descrição / Contexto

Este router expõe as funções de database de meal_plan_items (Tarefa 02) através de tRPC, permitindo que o frontend manipule refeições com mutations type-safe. Suporta operações bulk (upsert de múltiplos items) para eficiência.

**Localização no Plano:** Fase 1.3 - tRPC Routers (mealPlans)

**Dependências:** Tarefas 02 e 03 devem estar completas.

## 📋 Subtarefas (Checklist de Execução)

- [ ] Criar arquivo `frontend/server/routers/mealPlans.ts`
- [ ] Import de `router`, `publicProcedure` de `../trpc`
- [ ] Import de `z` do `zod`
- [ ] Criar `mealPlansRouter` usando `router({})`
- [ ] Implementar endpoint `getItems`:
  - Input: `z.object({ planId: z.string().uuid() })`
  - Query type: `.query()`
  - Chamar `get_meal_plan_items()`
  - Retornar array de items com food data
- [ ] Implementar endpoint `calculateMacros`:
  - Input: `z.object({ planId: z.string().uuid() })`
  - Query type: `.query()`
  - Chamar `calculate_meal_plan_macros()`
  - Retornar dict com totais
- [ ] Implementar endpoint `upsertItems`:
  - Input: `z.object({ planId: z.string().uuid(), items: z.array(itemSchema) })`
  - Mutation type: `.mutation()`
  - Deletar items existentes do plano
  - Inserir novos items (bulk)
  - Retornar count de items inseridos
- [ ] Implementar endpoint `deleteItem`:
  - Input: `z.object({ itemId: z.string().uuid() })`
  - Mutation type: `.mutation()`
  - DELETE single item
  - Retornar success boolean
- [ ] Implementar endpoint `reorderItems`:
  - Input: `z.object({ planId: z.string().uuid(), updates: z.array(z.object({ itemId: uuid(), newOrder: int() })) })`
  - Mutation type: `.mutation()`
  - UPDATE meal_order de múltiplos items
  - Usar transaction para atomicidade
  - Retornar success boolean
- [ ] Adicionar schema Zod para `itemSchema`:
  ```typescript
  const itemSchema = z.object({
    foodId: z.string().uuid(),
    mealName: z.string().min(1).max(100),
    mealOrder: z.number().int().min(1).max(20),
    quantityG: z.number().positive().max(10000),
    notes: z.string().optional(),
  });
  ```
- [ ] Importar `mealPlansRouter` em `_app.ts`:
  ```typescript
  export const appRouter = router({
    foods: foodsRouter,
    mealPlans: mealPlansRouter,
  });
  ```

## 🔍 Requisitos de Contexto (Consulta Obrigatória)

- [ ] [CONSULTAR DOCUMENTAÇÃO: tRPC v11 - Mutations vs Queries]
- [ ] [CONSULTAR DOCUMENTAÇÃO: tRPC v11 - Input validation com Zod arrays]
- [ ] [CONSULTAR DOCUMENTAÇÃO: PostgreSQL - Transactions e BEGIN/COMMIT/ROLLBACK]

## 💻 Implementação de Referência (Snippets)

```typescript
// frontend/server/routers/mealPlans.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

const itemSchema = z.object({
  foodId: z.string().uuid(),
  mealName: z.string().min(1).max(100),
  mealOrder: z.number().int().min(1).max(20),
  quantityG: z.number().positive().max(10000),
  notes: z.string().optional(),
});

export const mealPlansRouter = router({
  /**
   * Get all meal plan items for a plan
   */
  getItems: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const { planId } = input;

        const sql = `
          SELECT
            mpi.item_id,
            mpi.plan_id,
            mpi.meal_name,
            mpi.meal_order,
            mpi.quantity_g,
            mpi.notes,
            f.food_id,
            f.name AS food_name,
            f.category,
            f.energy_kcal,
            f.protein_g,
            f.carbs_g,
            f.fat_g,
            f.fiber_g
          FROM meal_plan_items mpi
          INNER JOIN foods f ON mpi.food_id = f.food_id
          WHERE mpi.plan_id = $1
          ORDER BY mpi.meal_order ASC, mpi.item_id ASC
        `;

        const result = await ctx.db.query(sql, [planId]);

        return result.rows;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get meal plan items',
          cause: error,
        });
      }
    }),

  /**
   * Calculate total macros for a meal plan
   */
  calculateMacros: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const { planId } = input;

        const sql = `
          SELECT
            COALESCE(SUM((mpi.quantity_g / 100.0) * f.protein_g), 0) AS total_protein_g,
            COALESCE(SUM((mpi.quantity_g / 100.0) * f.carbs_g), 0) AS total_carbs_g,
            COALESCE(SUM((mpi.quantity_g / 100.0) * f.fat_g), 0) AS total_fat_g,
            COALESCE(SUM((mpi.quantity_g / 100.0) * f.energy_kcal), 0) AS total_energy_kcal
          FROM meal_plan_items mpi
          INNER JOIN foods f ON mpi.food_id = f.food_id
          WHERE mpi.plan_id = $1
        `;

        const result = await ctx.db.query(sql, [planId]);

        return result.rows[0] || {
          total_protein_g: 0,
          total_carbs_g: 0,
          total_fat_g: 0,
          total_energy_kcal: 0,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to calculate macros',
          cause: error,
        });
      }
    }),

  /**
   * Upsert meal plan items (delete existing + insert new)
   */
  upsertItems: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        items: z.array(itemSchema),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const client = await ctx.db.connect();

      try {
        const { planId, items } = input;

        await client.query('BEGIN');

        // Delete existing items
        await client.query('DELETE FROM meal_plan_items WHERE plan_id = $1', [
          planId,
        ]);

        // Insert new items
        if (items.length > 0) {
          const insertSql = `
            INSERT INTO meal_plan_items (
              plan_id, food_id, meal_name, meal_order, quantity_g, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `;

          for (const item of items) {
            await client.query(insertSql, [
              planId,
              item.foodId,
              item.mealName,
              item.mealOrder,
              item.quantityG,
              item.notes || null,
            ]);
          }
        }

        await client.query('COMMIT');

        return { success: true, count: items.length };
      } catch (error) {
        await client.query('ROLLBACK');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upsert meal plan items',
          cause: error,
        });
      } finally {
        client.release();
      }
    }),

  /**
   * Delete a single meal plan item
   */
  deleteItem: publicProcedure
    .input(
      z.object({
        itemId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { itemId } = input;

        const result = await ctx.db.query(
          'DELETE FROM meal_plan_items WHERE item_id = $1',
          [itemId]
        );

        return { success: result.rowCount > 0 };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete meal plan item',
          cause: error,
        });
      }
    }),

  /**
   * Reorder meal plan items (update meal_order)
   */
  reorderItems: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        updates: z.array(
          z.object({
            itemId: z.string().uuid(),
            newOrder: z.number().int().min(1).max(20),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const client = await ctx.db.connect();

      try {
        const { planId, updates } = input;

        await client.query('BEGIN');

        // Update meal_order for each item
        for (const update of updates) {
          await client.query(
            'UPDATE meal_plan_items SET meal_order = $1 WHERE item_id = $2 AND plan_id = $3',
            [update.newOrder, update.itemId, planId]
          );
        }

        await client.query('COMMIT');

        return { success: true };
      } catch (error) {
        await client.query('ROLLBACK');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reorder items',
          cause: error,
        });
      } finally {
        client.release();
      }
    }),
});
```

## ✅ Critérios de Aceitação

- [ ] Arquivo `frontend/server/routers/mealPlans.ts` criado
- [ ] 5 procedures implementadas (3 queries + 2 mutations)
- [ ] Schema `itemSchema` definido com validações Zod
- [ ] `upsertItems` usa transaction (BEGIN/COMMIT/ROLLBACK)
- [ ] `mealPlansRouter` adicionado ao `appRouter` em `_app.ts`
- [ ] Compilação TypeScript sem erros
- [ ] Teste manual de mutation (após API route configurada):
  ```bash
  # Teste de upsertItems
  curl -X POST http://localhost:3000/api/trpc/mealPlans.upsertItems \
    -H "Content-Type: application/json" \
    -d '{"planId":"uuid","items":[...]}'
  ```

---

## 📋 Relatório de Implementação

**Data de Execução:** 2025-10-30
**Executor:** Claude Code

### ✅ Tarefas Concluídas

1. **Criação do arquivo mealPlans.ts**
   - Localização: `frontend/server/routers/mealPlans.ts` (227 linhas)
   - Todos os 5 endpoints implementados conforme especificação

2. **Endpoints Implementados:**
   - ✅ `getItems` (query) - Busca items de um meal plan com JOIN em foods
   - ✅ `calculateMacros` (query) - Calcula totais de macros e calorias
   - ✅ `upsertItems` (mutation) - Insere/atualiza items com transaction
   - ✅ `deleteItem` (mutation) - Remove um item específico
   - ✅ `reorderItems` (mutation) - Reordena items com transaction

3. **Schema Zod:**
   - ✅ `itemSchema` implementado com validações completas:
     - foodId (UUID)
     - mealName (string, 1-100 chars)
     - mealOrder (int, 1-20)
     - quantityG (positive number, max 10000)
     - notes (optional string)

4. **Gerenciamento de Transactions:**
   - ✅ Implementado usando a função `transaction()` de `@/lib/db`
   - ✅ Suporte a BEGIN/COMMIT/ROLLBACK automático
   - ✅ Error handling com TRPCError em todos endpoints

5. **Integração com App Router:**
   - ✅ `mealPlansRouter` já estava importado em `_app.ts`
   - ✅ Disponível como `trpc.mealPlans.*`

### 🔧 Ajustes Técnicos Realizados

1. **Correção de Transaction Handling:**
   - Substituído `ctx.db.connect()` por `transaction()` helper
   - Motivo: `ctx.db` só expõe `{ query }`, não o pool completo
   - Solução: Importar e usar `transaction` de `@/lib/db`

2. **Verificação TypeScript:**
   - ✅ Nenhum erro de tipo no mealPlansRouter
   - ✅ Compilação TypeScript bem-sucedida para o router
   - ℹ️  Existem erros de TS em outros arquivos do projeto (não relacionados)

### 📊 Status dos Critérios de Aceitação

- [x] Arquivo `frontend/server/routers/mealPlans.ts` criado
- [x] 5 procedures implementadas (3 queries + 2 mutations)
- [x] Schema `itemSchema` definido com validações Zod
- [x] `upsertItems` usa transaction (BEGIN/COMMIT/ROLLBACK)
- [x] `mealPlansRouter` adicionado ao `appRouter` em `_app.ts`
- [x] Compilação TypeScript sem erros (no mealPlansRouter)
- [ ] Teste manual de mutation (requer servidor dev rodando)

### 📝 Observações

- O router utiliza `publicProcedure` conforme especificado no documento
- Todas as queries retornam dados com JOIN em `foods` para enriquecer informações
- Error handling implementado com `TRPCError` e códigos apropriados
- Transactions garantem atomicidade nas operações de upsert e reorder
- Compatível com tRPC v11 e Next.js 16

### 🚀 Próximos Passos Sugeridos

1. Testar endpoints via cliente tRPC no frontend
2. Criar componentes React para interface de meal planning
3. Adicionar testes unitários para as procedures
4. Implementar validação de existência de `planId` antes de operações
