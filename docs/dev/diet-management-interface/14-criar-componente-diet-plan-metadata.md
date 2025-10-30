# 14 - Criar Componente DietPlanMetadata

## 🎯 Objetivo

Criar componente React `DietPlanMetadata` com form fields para os metadados de um plano de dieta (nome, objetivo, datas, targets de macros), com validação via react-hook-form e Zod, e cálculo automático de calorias.

## 📝 Descrição / Contexto

Este componente é o form de metadados do plano de dieta, usado tanto na criação quanto na edição. Contém os campos básicos como nome do plano, objetivo, datas de validade e os targets de macros (proteína, carboidratos, gordura). Calcula automaticamente as calorias totais e valida todos os campos.

Será reutilizado nas páginas `/dietas/novo` e `/dietas/[id]/editar`.

**Localização no Plano:** Fase 3.5 - Componentes Core de Nutrição

**Dependências:** Tarefa 09 (shadcn/ui form components) deve estar completa.

## 📋 Subtarefas (Checklist de Execução)

- [ ] Criar arquivo `frontend/components/nutrition/DietPlanMetadata.tsx`
- [ ] Adicionar directive `'use client'`
- [ ] Imports necessários:
  - `useForm` de `react-hook-form`
  - `zodResolver` de `@hookform/resolvers/zod`
  - `z` de `zod`
  - Form components de `@/components/ui/form`
  - `Input`, `Select`, `Label`, `Card` de `@/components/ui/...`
  - `Calendar` icon de `lucide-react`
- [ ] Definir Zod schema `dietPlanMetadataSchema`:
  ```typescript
  const schema = z.object({
    planName: z.string().min(1, 'Nome obrigatório').max(255),
    objective: z.enum(['hypertrophy', 'fat_loss', 'maintenance', 'hypertrophy_fat_loss']),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    targetProteinGDay: z.number().int().min(1).max(500),
    targetCarbsGDay: z.number().int().min(1).max(1000),
    targetFatGDay: z.number().int().min(1).max(300),
    referenceBodyWeightKg: z.number().min(40).max(200),
    tmbEstimated: z.number().int().min(1000).max(5000),
    strategy: z.string().optional(),
    notes: z.string().optional(),
  });
  ```
- [ ] Criar type `DietPlanMetadataFormData` from schema
- [ ] Criar componente com props:
  - `defaultValues?: Partial<DietPlanMetadataFormData>`
  - `onSubmit: (data: DietPlanMetadataFormData) => void`
  - `isSubmitting?: boolean`
- [ ] Setup react-hook-form com zodResolver
- [ ] Implementar watcher para calcular calorias totais automaticamente:
  - Protein * 4 + Carbs * 4 + Fat * 9
  - Display em read-only field ou badge
- [ ] Render form fields em layout grid:
  - Row 1: planName (full width)
  - Row 2: objective (select) + validFrom (date input) + validTo (date input, optional)
  - Row 3: targetProteinGDay + targetCarbsGDay + targetFatGDay
  - Row 4: referenceBodyWeightKg + tmbEstimated
  - Row 5: Calculated total kcal (display only)
  - Row 6: strategy (text) + notes (textarea) (optional, collapsible)
- [ ] Adicionar labels descritivos e placeholders
- [ ] Error messages para cada field
- [ ] Export do componente e type

## 🔍 Requisitos de Contexto (Consulta Obrigatória)

- [ ] [CONSULTAR DOCUMENTAÇÃO: react-hook-form - useForm e Controller]
- [ ] [CONSULTAR DOCUMENTAÇÃO: Zod - Schema validation e custom error messages]
- [ ] [CONSULTAR DOCUMENTAÇÃO: shadcn/ui - Form component com react-hook-form]

## 💻 Implementação de Referência (Snippets)

```typescript
// frontend/components/nutrition/DietPlanMetadata.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dietPlanMetadataSchema = z.object({
  planName: z.string().min(1, 'Nome obrigatório').max(255),
  objective: z.enum([
    'hypertrophy',
    'fat_loss',
    'maintenance',
    'hypertrophy_fat_loss',
  ]),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  validTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .optional()
    .or(z.literal('')),
  targetProteinGDay: z.coerce.number().int().min(1).max(500),
  targetCarbsGDay: z.coerce.number().int().min(1).max(1000),
  targetFatGDay: z.coerce.number().int().min(1).max(300),
  referenceBodyWeightKg: z.coerce.number().min(40).max(200),
  tmbEstimated: z.coerce.number().int().min(1000).max(5000),
  strategy: z.string().optional(),
  notes: z.string().optional(),
});

export type DietPlanMetadataFormData = z.infer<typeof dietPlanMetadataSchema>;

interface DietPlanMetadataProps {
  defaultValues?: Partial<DietPlanMetadataFormData>;
  onSubmit: (data: DietPlanMetadataFormData) => void;
  isSubmitting?: boolean;
}

const objectiveLabels: Record<string, string> = {
  hypertrophy: 'Hipertrofia',
  fat_loss: 'Perda de Gordura',
  maintenance: 'Manutenção',
  hypertrophy_fat_loss: 'Hipertrofia + Perda de Gordura',
};

/**
 * Diet Plan Metadata Form Component
 *
 * Form for diet plan metadata (name, objective, dates, macro targets).
 *
 * @example
 * ```tsx
 * <DietPlanMetadata
 *   defaultValues={{
 *     planName: "Cutting Fase 1",
 *     objective: "fat_loss",
 *     validFrom: "2025-11-01",
 *     targetProteinGDay: 180,
 *     targetCarbsGDay: 200,
 *     targetFatGDay: 60,
 *     referenceBodyWeightKg: 80,
 *     tmbEstimated: 2000,
 *   }}
 *   onSubmit={(data) => console.log(data)}
 * />
 * ```
 */
export function DietPlanMetadata({
  defaultValues,
  onSubmit,
  isSubmitting = false,
}: DietPlanMetadataProps) {
  const form = useForm<DietPlanMetadataFormData>({
    resolver: zodResolver(dietPlanMetadataSchema),
    defaultValues: {
      planName: '',
      objective: 'maintenance',
      validFrom: new Date().toISOString().split('T')[0],
      validTo: '',
      targetProteinGDay: 150,
      targetCarbsGDay: 200,
      targetFatGDay: 60,
      referenceBodyWeightKg: 80,
      tmbEstimated: 2000,
      strategy: '',
      notes: '',
      ...defaultValues,
    },
  });

  // Watch macros for kcal calculation
  const [protein, carbs, fat] = form.watch([
    'targetProteinGDay',
    'targetCarbsGDay',
    'targetFatGDay',
  ]);

  const totalKcal = protein * 4 + carbs * 4 + fat * 9;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Informações do Plano</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Plan Name */}
            <FormField
              control={form.control}
              name="planName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Plano *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Cutting Fase 1"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Objective + Dates */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="objective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Objetivo *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(objectiveLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Válido De *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Válido Até</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Macro Targets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base font-semibold">
                  Targets de Macros (g/dia) *
                </FormLabel>
                <Badge variant="secondary" className="text-sm">
                  Total: ~{totalKcal.toFixed(0)} kcal/dia
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="targetProteinGDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proteína</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          disabled={isSubmitting}
                          className="text-cyan-400"
                        />
                      </FormControl>
                      <FormDescription>1-500g</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetCarbsGDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Carboidratos</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          disabled={isSubmitting}
                          className="text-yellow-400"
                        />
                      </FormControl>
                      <FormDescription>1-1000g</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetFatGDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gordura</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          disabled={isSubmitting}
                          className="text-red-400"
                        />
                      </FormControl>
                      <FormDescription>1-300g</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Reference Data */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="referenceBodyWeightKg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Peso Corporal de Referência (kg) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>40-200kg</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tmbEstimated"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TMB Estimado (kcal) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>1000-5000 kcal</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Optional Fields */}
            <details className="rounded-lg border border-border/50 bg-card/50 p-4">
              <summary className="cursor-pointer font-semibold text-sm text-muted-foreground">
                Campos Opcionais
              </summary>
              <div className="mt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="strategy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estratégia</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Ciclagem de carbos, Refeeds a cada 7 dias"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Observações adicionais..."
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </details>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

## ✅ Critérios de Aceitação

- [x] Arquivo `components/nutrition/DietPlanMetadata.tsx` criado
- [x] Schema `dietPlanMetadataSchema` definido e exportado
- [x] Type `DietPlanMetadataFormData` exportado
- [x] Todos os campos obrigatórios com validação Zod
- [x] Calorias totais calculadas automaticamente (display only badge)
- [x] Select de objective com labels em português
- [x] Date inputs funcionam corretamente
- [x] Campos opcionais dentro de `<details>` collapsible
- [x] Error messages exibidas abaixo de cada field
- [x] Form submits via `onSubmit` callback
- [x] Estilos Whoop com glass-card effect
- [x] Compilação TypeScript sem erros
- [ ] Teste visual com defaultValues preenchidos

---

## 📊 Relatório de Execução

**Data:** 2025-10-30
**Status:** ✅ Concluído

### Implementação Realizada

1. **Arquivo criado:** `frontend/components/nutrition/DietPlanMetadata.tsx`
   - Componente funcional com todas as features especificadas
   - Validação completa via Zod schema
   - Integração com react-hook-form usando zodResolver

2. **Schema e Validação:**
   - Schema `dietPlanMetadataSchema` definido com todas as validações
   - Type `DietPlanMetadataFormData` exportado e inferido corretamente
   - Campos numéricos com validação de range (min/max)
   - Campos de data com validação de formato ISO
   - Campos opcionais (validTo, strategy, notes)

3. **Features Implementadas:**
   - Cálculo automático de calorias totais (Proteína × 4 + Carboidratos × 4 + Gordura × 9)
   - Display de calorias em badge com atualização em tempo real via `form.watch()`
   - Select de objetivo com labels em português
   - Campos de data funcionais (type="date")
   - Section collapsible para campos opcionais (`<details>`)
   - Error messages com FormMessage do shadcn/ui
   - Estilos Whoop com glass-card effect

4. **Ajustes Técnicos:**
   - **Desafio TypeScript:** O uso de `z.coerce.number()` causava erros de inferência de tipos com zodResolver
   - **Solução aplicada:** Migração para `z.number()` com `valueAsNumber` nos inputs
   - Todos os inputs numéricos agora usam `onChange={(e) => field.onChange(e.target.valueAsNumber)}`
   - Isso garante que os valores sejam números nativos ao invés de strings

5. **Validações de Build:**
   - ✅ ESLint passou sem warnings (`npm run lint`)
   - ✅ TypeScript compilation passou sem erros (`npm run build`)
   - ✅ Next.js build completado com sucesso

### Arquitetura do Componente

```
DietPlanMetadata
├── Props: defaultValues, onSubmit, isSubmitting
├── Form State: react-hook-form + zodResolver
├── Computed: totalKcal (via watch)
└── Layout:
    ├── Row 1: planName (full width)
    ├── Row 2: objective + validFrom + validTo (grid 3 cols)
    ├── Row 3: targetProtein + targetCarbs + targetFat (grid 3 cols)
    ├── Row 4: referenceBodyWeight + tmbEstimated (grid 2 cols)
    ├── Badge: Total kcal calculado
    └── Collapsible: strategy + notes
```

### Notas Técnicas

- Componente marcado como `'use client'` para uso de hooks
- Todos os campos numéricos usam `valueAsNumber` para type safety
- validTo aceita string vazia ou formato ISO válido
- defaultValues incluem valores sensíveis para experiência inicial positiva
- Badge de calorias atualiza em tempo real sem re-render completo

### Próximos Passos Sugeridos

- Integrar componente em página de criação de dieta (`/dietas/novo`)
- Integrar em página de edição de dieta (`/dietas/[id]/editar`)
- Adicionar teste visual com Storybook ou página de teste
- Implementar testes unitários para cálculo de calorias
- Conectar onSubmit com tRPC mutation para salvar no banco
