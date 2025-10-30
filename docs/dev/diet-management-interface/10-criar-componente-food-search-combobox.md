# 10 - Criar Componente FoodSearchCombobox

## 🎯 Objetivo

Criar componente React `FoodSearchCombobox` com autocomplete que permite buscar alimentos do banco de dados com debounce, exibindo nome, categoria e macros principais, retornando o Food object completo ao selecionar.

## 📝 Descrição / Contexto

Este é o componente fundamental para adicionar alimentos às refeições. Usa o endpoint `trpc.foods.search` com debounce de 300ms para evitar queries excessivas, e exibe resultados em um dropdown estilo Combobox (shadcn/ui).

O componente deve ser reutilizável e controlado (recebe `value` e `onChange` como props).

**Localização no Plano:** Fase 3.1 - Componentes Core de Nutrição

**Dependências:** Tarefas 04 (foods router), 07 (tRPC client), 09 (shadcn/ui combobox) devem estar completas.

## 📋 Subtarefas (Checklist de Execução)

- [ ] Criar diretório `frontend/components/nutrition/` se não existir
- [ ] Criar arquivo `frontend/components/nutrition/FoodSearchCombobox.tsx`
- [ ] Adicionar directive `'use client'` no topo
- [ ] Imports necessários:
  - `useState`, `useEffect` do React
  - `trpc` de `@/lib/trpc`
  - `Combobox`, `Command`, `Popover` de `@/components/ui/...`
  - `Search`, `Check` icons de `lucide-react`
- [ ] Definir type `FoodOption` para resultado da busca
- [ ] Criar componente com props:
  - `value?: FoodOption | null`
  - `onChange: (food: FoodOption | null) => void`
  - `placeholder?: string`
  - `disabled?: boolean`
- [ ] Implementar state para query (debounced)
- [ ] Hook `useDebouncedValue` para debounce de 300ms
- [ ] Query tRPC `trpc.foods.search.useQuery({ query: debouncedQuery, limit: 20 })`
- [ ] Render Combobox com:
  - Trigger mostrando alimento selecionado ou placeholder
  - Content com Command (search input + lista de results)
  - Cada item mostra: nome + categoria + macros (P/C/F)
  - Loading state enquanto está buscando
  - Empty state quando não há resultados
- [ ] Adicionar estilos Whoop (dark mode, verde para selecionado)
- [ ] Export do componente

## 🔍 Requisitos de Contexto (Consulta Obrigatória)

- [ ] [CONSULTAR DOCUMENTAÇÃO: shadcn/ui - Combobox component usage]
- [ ] [CONSULTAR DOCUMENTAÇÃO: React - useDebounce custom hook pattern]
- [ ] [CONSULTAR DOCUMENTAÇÃO: tRPC React Query - useQuery with enabled flag]

## 💻 Implementação de Referência (Snippets)

```typescript
// frontend/components/nutrition/FoodSearchCombobox.tsx
'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { trpc } from '@/lib/trpc';

export type FoodOption = {
  food_id: string;
  name: string;
  category: string | null;
  energy_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
};

interface FoodSearchComboboxProps {
  value?: FoodOption | null;
  onChange: (food: FoodOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Custom hook for debouncing values
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Food Search Combobox Component
 *
 * Autocomplete search for foods with debounced queries.
 *
 * @example
 * ```tsx
 * const [selectedFood, setSelectedFood] = useState<FoodOption | null>(null);
 *
 * <FoodSearchCombobox
 *   value={selectedFood}
 *   onChange={setSelectedFood}
 *   placeholder="Buscar alimento..."
 * />
 * ```
 */
export function FoodSearchCombobox({
  value,
  onChange,
  placeholder = 'Buscar alimento...',
  disabled = false,
}: FoodSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  // tRPC query with debounced search
  const { data: foods = [], isLoading } = trpc.foods.search.useQuery(
    {
      query: debouncedQuery,
      limit: 20,
    },
    {
      enabled: debouncedQuery.length > 0,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {value ? (
            <span className="flex items-center gap-2">
              <span className="font-medium">{value.name}</span>
              <span className="text-xs text-muted-foreground">
                ({value.category || 'Sem categoria'})
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput
            placeholder="Buscar alimento..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isLoading && searchQuery.length > 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <Search className="mx-auto h-4 w-4 animate-pulse" />
                Buscando...
              </div>
            )}

            {!isLoading && searchQuery.length > 0 && foods.length === 0 && (
              <CommandEmpty>Nenhum alimento encontrado.</CommandEmpty>
            )}

            {!isLoading && foods.length > 0 && (
              <CommandGroup heading="Alimentos">
                {foods.map((food) => (
                  <CommandItem
                    key={food.food_id}
                    value={food.name}
                    onSelect={() => {
                      onChange(food as FoodOption);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{food.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {food.category || 'Sem categoria'} •{' '}
                        {food.energy_kcal.toFixed(0)} kcal
                      </span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="text-cyan-400">
                        P: {food.protein_g.toFixed(1)}g
                      </span>
                      <span className="text-yellow-400">
                        C: {food.carbs_g.toFixed(1)}g
                      </span>
                      <span className="text-red-400">
                        G: {food.fat_g.toFixed(1)}g
                      </span>
                    </div>
                    <Check
                      className={cn(
                        'ml-2 h-4 w-4',
                        value?.food_id === food.food_id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searchQuery.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Digite para buscar alimentos
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

## ✅ Critérios de Aceitação

- [ ] Arquivo `components/nutrition/FoodSearchCombobox.tsx` criado
- [ ] Componente é controlado (recebe value/onChange)
- [ ] Debounce de 300ms implementado
- [ ] Query tRPC `foods.search` ativada apenas quando query > 0
- [ ] Loading state exibido durante busca
- [ ] Empty state quando não há resultados
- [ ] Cada item mostra: nome + categoria + macros
- [ ] Seleção fecha o popover e limpa o search
- [ ] Estilos consistentes com design Whoop (dark mode)
- [ ] Compilação TypeScript sem erros
- [ ] Teste visual em página temporária:
  ```tsx
  // app/test-components/page.tsx
  'use client';

  import { useState } from 'react';
  import { FoodSearchCombobox, FoodOption } from '@/components/nutrition/FoodSearchCombobox';

  export default function TestPage() {
    const [food, setFood] = useState<FoodOption | null>(null);

    return (
      <div className="p-8">
        <h1>Test FoodSearchCombobox</h1>
        <FoodSearchCombobox value={food} onChange={setFood} />
        {food && <pre>{JSON.stringify(food, null, 2)}</pre>}
      </div>
    );
  }
  ```
