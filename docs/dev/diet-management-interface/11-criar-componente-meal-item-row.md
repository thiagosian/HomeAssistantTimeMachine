# 11 - Criar Componente MealItemRow

## 🎯 Objetivo

Criar componente React `MealItemRow` que exibe um item de alimento em uma refeição com edição inline de quantidade, cálculo automático de macros e botão de remoção.

## 📝 Descrição / Contexto

Este componente representa uma linha em uma lista de alimentos de uma refeição. Deve permitir editar a quantidade em gramas inline, calcular macros automaticamente com base na quantidade, e ter um botão para remover o item.

Será usado dentro do componente `MealCard` (Tarefa 12) para compor a lista de alimentos de cada refeição.

**Localização no Plano:** Fase 3.2 - Componentes Core de Nutrição

**Dependências:** Tarefa 09 (shadcn/ui) deve estar completa.

## 📋 Subtarefas (Checklist de Execução)

- [ ] Criar arquivo `frontend/components/nutrition/MealItemRow.tsx`
- [ ] Adicionar directive `'use client'`
- [ ] Imports necessários:
  - `useState` do React
  - `Input` de `@/components/ui/input`
  - `Button` de `@/components/ui/button`
  - `Trash2`, `GripVertical` icons de `lucide-react`
- [ ] Definir type `MealItem`:
  ```typescript
  type MealItem = {
    itemId?: string; // UUID (optional para novos items)
    foodId: string;
    foodName: string;
    quantityG: number;
    // Nutritional data per 100g
    energyKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    notes?: string;
  };
  ```
- [ ] Criar componente com props:
  - `item: MealItem`
  - `onChange: (item: MealItem) => void`
  - `onDelete: () => void`
  - `dragHandleProps?: any` (para drag-drop futuro)
- [ ] Implementar função `calculateMacros` que calcula macros baseado em quantity_g
- [ ] Render com layout horizontal:
  - Drag handle (GripVertical icon) - opcional
  - Nome do alimento (truncate se muito longo)
  - Input de quantidade (number, min=0, max=10000, step=1)
  - Macros calculados exibidos (P/C/F + kcal)
  - Botão de delete (Trash2 icon)
- [ ] onChange debounced no input de quantidade (300ms)
- [ ] Estilos Whoop: hover effect, cores de macros (cyan/yellow/red)
- [ ] Export do componente

## 🔍 Requisitos de Contexto (Consulta Obrigatória)

- [ ] [CONSULTAR DOCUMENTAÇÃO: React - Controlled inputs e onChange patterns]
- [ ] [CONSULTAR DOCUMENTAÇÃO: shadcn/ui - Input component e number type]

## 💻 Implementação de Referência (Snippets)

```typescript
// frontend/components/nutrition/MealItemRow.tsx
'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MealItem = {
  itemId?: string;
  foodId: string;
  foodName: string;
  quantityG: number;
  // Nutritional data per 100g
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes?: string;
};

interface MealItemRowProps {
  item: MealItem;
  onChange: (item: MealItem) => void;
  onDelete: () => void;
  dragHandleProps?: any;
}

/**
 * Calculate macros based on quantity
 */
function calculateMacros(item: MealItem) {
  const multiplier = item.quantityG / 100;
  return {
    kcal: item.energyKcal * multiplier,
    protein: item.proteinG * multiplier,
    carbs: item.carbsG * multiplier,
    fat: item.fatG * multiplier,
  };
}

/**
 * Meal Item Row Component
 *
 * Displays a food item in a meal with inline editing.
 *
 * @example
 * ```tsx
 * <MealItemRow
 *   item={item}
 *   onChange={(updated) => updateItem(updated)}
 *   onDelete={() => removeItem(item.itemId)}
 * />
 * ```
 */
export function MealItemRow({
  item,
  onChange,
  onDelete,
  dragHandleProps,
}: MealItemRowProps) {
  const [quantity, setQuantity] = useState(item.quantityG.toString());

  // Debounced update
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseFloat(quantity);
      if (!isNaN(parsed) && parsed > 0 && parsed !== item.quantityG) {
        onChange({ ...item, quantityG: parsed });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [quantity]);

  const macros = calculateMacros(item);

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-3 transition-all hover:border-border hover:bg-card">
      {/* Drag Handle (optional) */}
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          className="cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {/* Food Name */}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium text-sm">{item.foodName}</p>
        {item.notes && (
          <p className="truncate text-xs text-muted-foreground">{item.notes}</p>
        )}
      </div>

      {/* Quantity Input */}
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20 text-right"
          min={0}
          max={10000}
          step={1}
        />
        <span className="text-xs text-muted-foreground">g</span>
      </div>

      {/* Calculated Macros */}
      <div className="flex gap-3 text-xs">
        <span className="text-cyan-400 font-medium">
          P: {macros.protein.toFixed(1)}g
        </span>
        <span className="text-yellow-400 font-medium">
          C: {macros.carbs.toFixed(1)}g
        </span>
        <span className="text-red-400 font-medium">
          G: {macros.fat.toFixed(1)}g
        </span>
        <span className="text-muted-foreground">
          {macros.kcal.toFixed(0)} kcal
        </span>
      </div>

      {/* Delete Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

## ✅ Critérios de Aceitação

- [ ] Arquivo `components/nutrition/MealItemRow.tsx` criado
- [ ] Type `MealItem` definido e exportado
- [ ] Input de quantidade funciona com debounce de 300ms
- [ ] Macros são calculados automaticamente ao mudar quantidade
- [ ] Botão de delete chama `onDelete` callback
- [ ] Drag handle (GripVertical) renderizado apenas se `dragHandleProps` fornecido
- [ ] Hover effects aplicados (border e opacity dos botões)
- [ ] Estilos de macros com cores Whoop (cyan/yellow/red)
- [ ] Compilação TypeScript sem erros
- [ ] Teste visual em página temporária:
  ```tsx
  'use client';

  import { useState } from 'react';
  import { MealItemRow, MealItem } from '@/components/nutrition/MealItemRow';

  export default function TestPage() {
    const [item, setItem] = useState<MealItem>({
      foodId: '123',
      foodName: 'Arroz branco cozido',
      quantityG: 200,
      energyKcal: 130,
      proteinG: 2.5,
      carbsG: 28,
      fatG: 0.2,
    });

    return (
      <div className="p-8 max-w-2xl">
        <h1>Test MealItemRow</h1>
        <MealItemRow
          item={item}
          onChange={setItem}
          onDelete={() => console.log('Delete clicked')}
        />
        <pre className="mt-4">{JSON.stringify(item, null, 2)}</pre>
      </div>
    );
  }
  ```
