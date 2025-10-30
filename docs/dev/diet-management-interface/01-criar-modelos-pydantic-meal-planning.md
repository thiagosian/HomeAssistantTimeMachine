# 01 - Criar Modelos Pydantic para Meal Planning

## 🎯 Objetivo

Criar modelos Pydantic (`MealPlanItem`, `MealInPlan`, `DietPlanWithMeals`) no backend Python para representar a estrutura de refeições detalhadas, permitindo validação de dados e cálculo automático de macros.

## 📝 Descrição / Contexto

Atualmente, o sistema possui o modelo `DietPlan` que define apenas targets de macros (proteína, carboidratos, gordura). Esta tarefa estende esse modelo para suportar **meal planning detalhado**, onde cada plano de dieta contém múltiplas refeições (`meals`), e cada refeição contém múltiplos items de alimentos (`items`) com quantidades específicas.

Isso é a base da **Fase 1** do plano de implementação, criando a camada de dados necessária antes de implementar os métodos de database e a API tRPC.

**Localização no Plano:** Fase 1.1 - Backend Server Setup

## 📋 Subtarefas (Checklist de Execução)

- [ ] Abrir arquivo `shared/modules/models.py`
- [ ] Adicionar import de `List` do typing (se não existir)
- [ ] Criar classe `MealPlanItem(BaseModel)` com campos:
  - `food_name: str` - Nome do alimento (deve existir na tabela foods)
  - `quantity_g: float` - Quantidade em gramas (Field com gt=0, le=10000)
  - `notes: Optional[str]` - Notas opcionais sobre o item
- [ ] Criar classe `MealInPlan(BaseModel)` com campos:
  - `meal_name: str` - Nome da refeição (ex: "Café da manhã") (Field min_length=1, max_length=100)
  - `meal_order: int` - Ordem da refeição no dia (Field ge=1, le=20)
  - `items: List[MealPlanItem]` - Lista de alimentos nesta refeição (Field min_length=1)
- [ ] Estender classe `DietPlan` para criar `DietPlanWithMeals(DietPlan)` com:
  - `meals: List[MealInPlan]` - Lista de refeições (Field min_length=1)
- [ ] Adicionar método `calculate_total_macros(self, food_lookup: dict) -> dict`:
  - Recebe dicionário {food_name: Food object}
  - Itera por todas as meals e items
  - Calcula macros totais: `protein_g`, `carbs_g`, `fat_g`, `energy_kcal`
  - Retorna dict com totais
- [ ] Adicionar método `validate_against_targets(self, food_lookup: dict, tolerance: float = 0.05) -> dict`:
  - Chama `calculate_total_macros()`
  - Compara totais com `target_protein_g_day`, `target_carbs_g_day`, `target_fat_g_day`
  - Calcula desvio percentual para cada macro
  - Retorna dict: `{'valid': bool, 'totals': dict, 'errors': List[str]}`
  - Se desvio > tolerance (default 5%), adiciona erro à lista
- [ ] Adicionar docstrings detalhadas para cada classe e método
- [ ] Testar instanciação dos modelos com dados de exemplo no Python REPL

## 🔍 Requisitos de Contexto (Consulta Obrigatória)

- [ ] [CONSULTAR DOCUMENTAÇÃO: Pydantic v2 - Validação de campos com Field()]
- [ ] [CONSULTAR DOCUMENTAÇÃO: Pydantic v2 - Model inheritance e extension]
- [ ] [CONSULTAR DOCUMENTAÇÃO: Pydantic v2 - Computed fields e métodos customizados]

## 💻 Implementação de Referência (Snippets)

```python
from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from datetime import date

class MealPlanItem(BaseModel):
    """
    Representa um item de alimento em uma refeição.

    Attributes:
        food_name: Nome exato do alimento (deve existir na tabela foods)
        quantity_g: Quantidade em gramas (0-10000g)
        notes: Notas opcionais (ex: "Consumir 30min pré-treino")
    """
    food_name: str = Field(..., min_length=1, max_length=255)
    quantity_g: float = Field(..., gt=0, le=10000, description="Quantity in grams")
    notes: Optional[str] = Field(None, max_length=500)


class MealInPlan(BaseModel):
    """
    Representa uma refeição completa com múltiplos alimentos.

    Attributes:
        meal_name: Nome da refeição (ex: "Café da manhã", "Pré-treino")
        meal_order: Ordem sequencial da refeição no dia (1-20)
        items: Lista de alimentos nesta refeição (mínimo 1)
    """
    meal_name: str = Field(..., min_length=1, max_length=100)
    meal_order: int = Field(..., ge=1, le=20, description="Order of meal in the day")
    items: List[MealPlanItem] = Field(..., min_length=1)


class DietPlanWithMeals(DietPlan):
    """
    Extensão do DietPlan com meal planning detalhado.

    Attributes:
        meals: Lista de refeições do dia (mínimo 1)

    Methods:
        calculate_total_macros: Calcula macros totais das refeições
        validate_against_targets: Valida se macros estão dentro da tolerância
    """
    meals: List[MealInPlan] = Field(..., min_length=1)

    def calculate_total_macros(self, food_lookup: dict) -> dict:
        """
        Calcula macros totais de todas as refeições.

        Args:
            food_lookup: Dict {food_name: Food object} com dados nutricionais

        Returns:
            dict com: total_protein_g, total_carbs_g, total_fat_g, total_energy_kcal

        Raises:
            ValueError: Se algum food_name não existir no food_lookup
        """
        totals = {
            'total_protein_g': 0.0,
            'total_carbs_g': 0.0,
            'total_fat_g': 0.0,
            'total_energy_kcal': 0.0
        }

        for meal in self.meals:
            for item in meal.items:
                if item.food_name not in food_lookup:
                    raise ValueError(f"Food '{item.food_name}' not found in database")

                food = food_lookup[item.food_name]
                multiplier = item.quantity_g / 100.0  # Dados do DB são por 100g

                totals['total_protein_g'] += food.protein_g * multiplier
                totals['total_carbs_g'] += food.carbs_g * multiplier
                totals['total_fat_g'] += food.fat_g * multiplier
                totals['total_energy_kcal'] += food.energy_kcal * multiplier

        return totals

    def validate_against_targets(
        self,
        food_lookup: dict,
        tolerance: float = 0.05
    ) -> dict:
        """
        Valida se macros das refeições estão dentro da tolerância dos targets.

        Args:
            food_lookup: Dict {food_name: Food object}
            tolerance: Tolerância percentual (default: 0.05 = ±5%)

        Returns:
            dict: {
                'valid': bool,
                'totals': dict,
                'errors': List[str]
            }
        """
        totals = self.calculate_total_macros(food_lookup)
        errors = []

        # Validar proteína
        protein_diff = abs(totals['total_protein_g'] - self.target_protein_g_day)
        protein_pct = protein_diff / self.target_protein_g_day
        if protein_pct > tolerance:
            errors.append(
                f"Protein deviation: {protein_diff:.1f}g "
                f"({protein_pct*100:.1f}% > {tolerance*100:.0f}%)"
            )

        # Validar carboidratos
        carbs_diff = abs(totals['total_carbs_g'] - self.target_carbs_g_day)
        carbs_pct = carbs_diff / self.target_carbs_g_day
        if carbs_pct > tolerance:
            errors.append(
                f"Carbs deviation: {carbs_diff:.1f}g "
                f"({carbs_pct*100:.1f}% > {tolerance*100:.0f}%)"
            )

        # Validar gordura
        fat_diff = abs(totals['total_fat_g'] - self.target_fat_g_day)
        fat_pct = fat_diff / self.target_fat_g_day
        if fat_pct > tolerance:
            errors.append(
                f"Fat deviation: {fat_diff:.1f}g "
                f"({fat_pct*100:.1f}% > {tolerance*100:.0f}%)"
            )

        return {
            'valid': len(errors) == 0,
            'totals': totals,
            'errors': errors
        }
```

## ✅ Critérios de Aceitação

- [ ] Arquivo `shared/modules/models.py` contém as 3 novas classes
- [ ] Todos os campos possuem validações apropriadas (Field com constraints)
- [ ] Método `calculate_total_macros()` retorna valores corretos
- [ ] Método `validate_against_targets()` identifica desvios > 5% corretamente
- [ ] Docstrings completas em todas as classes e métodos
- [ ] Teste manual no REPL confirma que os modelos funcionam:
  ```python
  from shared.modules.models import DietPlanWithMeals, MealInPlan, MealPlanItem

  # Criar plano de exemplo
  plan = DietPlanWithMeals(
      plan_name="Test Plan",
      plan_type="nutrition",
      objective="hypertrophy",
      valid_from="2025-11-01",
      target_protein_g_day=180,
      target_carbs_g_day=200,
      target_fat_g_day=60,
      reference_body_weight_kg=80,
      tmb_estimated=2000,
      meals=[
          MealInPlan(
              meal_name="Breakfast",
              meal_order=1,
              items=[
                  MealPlanItem(food_name="Aveia em flocos", quantity_g=80),
                  MealPlanItem(food_name="Banana prata", quantity_g=100)
              ]
          )
      ]
  )

  # Validar que o modelo foi criado
  assert plan.plan_name == "Test Plan"
  assert len(plan.meals) == 1
  assert len(plan.meals[0].items) == 2
  ```

---

## 📊 Relatório de Implementação

**Data de Execução:** 2025-10-30
**Status:** ✅ Concluído com Sucesso

### Resumo das Alterações

Foram implementados com sucesso todos os modelos Pydantic para meal planning no arquivo `shared/modules/models.py`:

#### 1. **MealPlanItem** (Linhas 140-151)
- ✅ Campo `food_name`: str (1-255 caracteres)
- ✅ Campo `quantity_g`: float (0-10000g com validação)
- ✅ Campo `notes`: Optional[str] (até 500 caracteres)
- ✅ Docstring completa com descrição de atributos

#### 2. **MealInPlan** (Linhas 154-165)
- ✅ Campo `meal_name`: str (1-100 caracteres)
- ✅ Campo `meal_order`: int (1-20 com validação)
- ✅ Campo `items`: List[MealPlanItem] (mínimo 1 item)
- ✅ Docstring completa com descrição de atributos

#### 3. **DietPlanWithMeals** (Linhas 168-269)
- ✅ Herda de `DietPlan` corretamente
- ✅ Campo `meals`: List[MealInPlan] (mínimo 1 refeição)
- ✅ Método `calculate_total_macros(food_lookup: dict) -> dict`
  - Calcula proteína, carboidratos, gordura e energia totais
  - Valida existência de alimentos no lookup
  - Aplica multiplicador correto (quantity_g / 100)
- ✅ Método `validate_against_targets(food_lookup: dict, tolerance: float = 0.05) -> dict`
  - Compara macros calculados com targets do plano
  - Identifica desvios acima da tolerância (padrão: ±5%)
  - Retorna dict com status de validação, totais e erros
- ✅ Docstrings completas em todos os métodos

### Testes Realizados

#### Teste 1: Criação de Instâncias
```python
✓ MealPlanItem criado com sucesso (80g Aveia, 100g Banana)
✓ MealInPlan criado com sucesso (Café da manhã, 2 items)
✓ DietPlanWithMeals criado com sucesso (1 meal)
```

#### Teste 2: Validação de Campos
```python
✓ Validação rejeitou food_name vazio
✓ Validação rejeitou quantity_g = 0
```

#### Teste 3: Cálculo de Macros
```python
✓ Método calculate_total_macros() funcionando
  - Entrada: 80g Aveia + 100g Banana + 200g Frango
  - Saída: 74.4g protein, 70.8g carbs, 14.1g fat, 739.2 kcal
  - Cálculos matematicamente corretos
```

#### Teste 4: Validação contra Targets
```python
✓ Método validate_against_targets() funcionando
  - Identificou 3 desvios (protein, carbs, fat > 5%)
  - Retornou mensagens de erro formatadas corretamente
  - Flag 'valid' = False quando há desvios
```

#### Teste 5: Tratamento de Erros
```python
✓ ValueError lançado ao tentar calcular macros com alimento inexistente
  - Mensagem: "Food 'Invalid Food' not found in database"
```

### Verificações de Qualidade

- ✅ **Testes Python:** 49 testes executados, nenhum quebrado pelos novos modelos
- ✅ **Imports:** List já estava importado, nenhuma dependência adicional necessária
- ✅ **Docstrings:** Todas as classes e métodos documentados em PT-BR
- ✅ **Validações:** Field constraints aplicados em todos os campos conforme especificação
- ✅ **Herança:** DietPlanWithMeals herda corretamente de DietPlan
- ✅ **Type Hints:** Todos os métodos com type hints corretos

### Observações

1. **Imports Existentes:** O arquivo já continha `List` importado do `typing`, não foi necessário adicionar.

2. **Estrutura do Código:** Os novos modelos foram inseridos entre `DietPlan` e `TrainingPlan`, mantendo a organização lógica do arquivo.

3. **Compatibilidade:** Nenhum teste existente foi quebrado pela adição dos novos modelos.

4. **Precisão dos Cálculos:** O método `calculate_total_macros()` usa multiplicador correto (quantity_g / 100.0) assumindo que os dados do banco são por 100g (padrão TACO).

5. **Frontend Build:** Existe um erro TypeScript pré-existente no arquivo `app/api/trpc/[trpc]/route.ts` (linha 17) relacionado ao `transformer: superjson` no tRPC. Este erro é **independente** das alterações feitas nos modelos Pydantic e requer correção separada.

### Próximos Passos (Fase 1.2)

Conforme o plano de implementação, as próximas tarefas são:

1. **02-implementar-crud-meal-plans.md** - Métodos de database para CRUD de meal plans
2. **03-criar-rotas-trpc-meal-plans.md** - Endpoints tRPC para a API
3. **04-criar-pagina-meal-planner.md** - Interface de usuário no frontend

---

**Implementado por:** Claude Code
**Commit:** `764f3bc` - "Implement Pydantic models for meal planning (Phase 1.1)"
