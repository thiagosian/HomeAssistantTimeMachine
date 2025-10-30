# 12 - Criar Componente MealCard

## 🎯 Objetivo

Criar componente React `MealCard` que agrupa múltiplos `MealItemRow` representando uma refeição completa, com header (nome + ordem), lista de items, totais de macros e botão para adicionar alimentos.

## 📝 Descrição / Contexto

Este componente é um card expansível que representa uma refeição inteira (ex: "Café da manhã", "Almoço"). Contém uma lista de `MealItemRow` components, calcula e exibe os totais da refeição, e permite adicionar novos alimentos via `FoodSearchCombobox`.

Deve suportar collapse/expand state para economizar espaço visual quando necessário.

**Localização no Plano:** Fase 3.3 - Componentes Core de Nutrição

**Dependências:** Tarefas 10 (FoodSearchCombobox) e 11 (MealItemRow) devem estar completas.

## 📋 Subtarefas (Checklist de Execução)

- [ ] Criar arquivo `frontend/components/nutrition/MealCard.tsx`
- [ ] Adicionar directive `'use client'`
- [ ] Imports necessários:
  - `useState` do React
  - `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` de `@/components/ui/card`
  - `Button` de `@/components/ui/button`
  - `Separator` de `@/components/ui/separator`
  - `Plus`, `ChevronDown`, `ChevronUp` icons de `lucide-react`
  - `MealItemRow`, `MealItem` de `./MealItemRow`
  - `FoodSearchCombobox`, `FoodOption` de `./FoodSearchCombobox`
- [ ] Definir type `Meal`:
  ```typescript
  type Meal = {
    mealName: string;
    mealOrder: number;
    items: MealItem[];
  };
  ```
- [ ] Criar componente com props:
  - `meal: Meal`
  - `onChange: (meal: Meal) => void`
  - `onDelete?: () => void` (opcional - para deletar refeição inteira)
- [ ] Implementar state para:
  - `isExpanded` (collapse/expand)
  - `showAddFood` (toggle do combobox)
- [ ] Implementar função `calculateMealTotals` que soma macros de todos os items
- [ ] Implementar handlers:
  - `handleAddFood(food: FoodOption)` - adiciona novo item à refeição
  - `handleUpdateItem(index, item)` - atualiza item específico
  - `handleDeleteItem(index)` - remove item
- [ ] Render estrutura:
  - CardHeader: nome da refeição + ordem + botão expand/collapse
  - CardContent: lista de MealItemRow (se expanded)
  - CardFooter: totais da refeição + botão "Adicionar Alimento"
- [ ] Estilos Whoop com glass-morphism effect
- [ ] Export do componente

## 🔍 Requisitos de Contexto (Consulta Obrigatória)

- [ ] [CONSULTAR DOCUMENTAÇÃO: React - Lifting state up e child component updates]
- [ ] [CONSULTAR DOCUMENTAÇÃO: shadcn/ui - Card component variants]

## 💻 Implementação de Referência (Snippets)

```typescript
// frontend/components/nutrition/MealCard.tsx
'use client';

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { MealItemRow, MealItem } from './MealItemRow';
import { FoodSearchCombobox, FoodOption } from './FoodSearchCombobox';

export type Meal = {
  mealName: string;
  mealOrder: number;
  items: MealItem[];
};

interface MealCardProps {
  meal: Meal;
  onChange: (meal: Meal) => void;
  onDelete?: () => void;
}

/**
 * Calculate total macros for a meal
 */
function calculateMealTotals(items: MealItem[]) {
  return items.reduce(
    (totals, item) => {
      const multiplier = item.quantityG / 100;
      return {
        kcal: totals.kcal + item.energyKcal * multiplier,
        protein: totals.protein + item.proteinG * multiplier,
        carbs: totals.carbs + item.carbsG * multiplier,
        fat: totals.fat + item.fatG * multiplier,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/**
 * Meal Card Component
 *
 * Displays a complete meal with multiple food items.
 *
 * @example
 * ```tsx
 * <MealCard
 *   meal={{
 *     mealName: "Café da manhã",
 *     mealOrder: 1,
 *     items: [...]
 *   }}
 *   onChange={(updated) => updateMeal(updated)}
 * />
 * ```
 */
export function MealCard({ meal, onChange, onDelete }: MealCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddFood, setShowAddFood] = useState(false);

  const totals = calculateMealTotals(meal.items);

  const handleAddFood = (food: FoodOption | null) => {
    if (!food) return;

    const newItem: MealItem = {
      foodId: food.food_id,
      foodName: food.name,
      quantityG: 100, // Default quantity
      energyKcal: food.energy_kcal,
      proteinG: food.protein_g,
      carbsG: food.carbs_g,
      fatG: food.fat_g,
    };

    onChange({
      ...meal,
      items: [...meal.items, newItem],
    });

    setShowAddFood(false);
  };

  const handleUpdateItem = (index: number, updatedItem: MealItem) => {
    const newItems = [...meal.items];
    newItems[index] = updatedItem;
    onChange({ ...meal, items: newItems });
  };

  const handleDeleteItem = (index: number) => {
    const newItems = meal.items.filter((_, i) => i !== index);
    onChange({ ...meal, items: newItems });
  };

  return (
    <Card className="glass-card">
      {/* Header */}
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {meal.mealOrder}
            </span>
            <span>{meal.mealName}</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({meal.items.length} {meal.items.length === 1 ? 'item' : 'itens'})
            </span>
          </CardTitle>

          <div className="flex gap-2">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Content (collapsible) */}
      {isExpanded && (
        <>
          <CardContent className="space-y-2">
            {meal.items.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum alimento adicionado
              </div>
            ) : (
              meal.items.map((item, index) => (
                <MealItemRow
                  key={item.itemId || index}
                  item={item}
                  onChange={(updated) => handleUpdateItem(index, updated)}
                  onDelete={() => handleDeleteItem(index)}
                />
              ))
            )}

            {/* Add Food Combobox */}
            {showAddFood && (
              <div className="mt-4">
                <FoodSearchCombobox
                  value={null}
                  onChange={handleAddFood}
                  placeholder="Buscar alimento para adicionar..."
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddFood(false)}
                  className="mt-2 w-full"
                >
                  Cancelar
                </Button>
              </div>
            )}
          </CardContent>

          <Separator />

          {/* Footer - Totals */}
          <CardFooter className="flex flex-col gap-3">
            {/* Meal Totals */}
            <div className="flex w-full items-center justify-between text-sm">
              <span className="font-semibold">Totais da Refeição:</span>
              <div className="flex gap-4">
                <span className="text-cyan-400 font-medium">
                  P: {totals.protein.toFixed(1)}g
                </span>
                <span className="text-yellow-400 font-medium">
                  C: {totals.carbs.toFixed(1)}g
                </span>
                <span className="text-red-400 font-medium">
                  G: {totals.fat.toFixed(1)}g
                </span>
                <span className="text-primary font-semibold">
                  {totals.kcal.toFixed(0)} kcal
                </span>
              </div>
            </div>

            {/* Add Food Button */}
            {!showAddFood && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddFood(true)}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Alimento
              </Button>
            )}
          </CardFooter>
        </>
      )}

      {/* Collapsed State - Show only totals */}
      {!isExpanded && (
        <CardContent>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{meal.items.length} alimentos</span>
            <div className="flex gap-3">
              <span>P: {totals.protein.toFixed(0)}g</span>
              <span>C: {totals.carbs.toFixed(0)}g</span>
              <span>G: {totals.fat.toFixed(0)}g</span>
              <span className="font-semibold text-foreground">
                {totals.kcal.toFixed(0)} kcal
              </span>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
```

## ✅ Critérios de Aceitação

- [ ] Arquivo `components/nutrition/MealCard.tsx` criado
- [ ] Type `Meal` definido e exportado
- [ ] Collapse/expand state funciona
- [ ] Lista de `MealItemRow` renderizada corretamente
- [ ] Botão "Adicionar Alimento" mostra `FoodSearchCombobox`
- [ ] Adicionar alimento funciona e atualiza a lista
- [ ] Editar item funciona via `MealItemRow` onChange
- [ ] Deletar item funciona
- [ ] Totais da refeição calculados e exibidos corretamente
- [ ] Estado collapsed mostra resumo (X alimentos + totais)
- [ ] Estilos Whoop com glass-card effect
- [ ] Compilação TypeScript sem erros
- [ ] Teste visual em página temporária com 2-3 refeições
