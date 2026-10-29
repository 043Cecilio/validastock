<div align="center">

# ValidaStock

### Controle de Estoque Perecível por Lote, Validade (FEFO) e Prevenção de Perdas

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma_6-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

<br />

![Dashboard do ValidaStock](./docs/dashboard.png)

</div>

---

## Sumário

- [O Problema](#-o-problema)
- [A Solução](#-a-solução)
- [Stack Tecnológica](#-stack-tecnológica)
- [Decisões de Engenharia](#-decisões-de-engenharia-e-arquitetura)
- [Diagramas](#-diagramas)
- [Testes Unitários](#-testes-unitários)
- [API](#-api)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Como Rodar](#-como-rodar-o-projeto)
- [Roadmap](#-roadmap-de-evolução)
- [Autor](#-autor)

---

## O Problema

Pequenos mercados, padarias, farmácias de manipulação, clínicas odontológicas/estéticas e restaurantes costumam controlar o estoque em planilhas que somam apenas a **quantidade total** de um item, por exemplo *"40 caixas de leite"*.

O que essa soma esconde é que **10 caixas vencem em 3 dias** e **30 vencem em 25 dias**. O resultado é:

-  **Prejuízo financeiro direto** com descartes de produtos vencidos;
-  **Alto risco sanitário** pela possibilidade de venda ou uso de itens fora da validade.

## A Solução

O **ValidaStock** é um sistema Full-Stack que:

- [x] Gerencia entradas por **Lote** e **Data de Validade**;
- [x] Aplica o algoritmo **FEFO** (*First Expired, First Out*, o primeiro que vence é o primeiro que sai) nas baixas de estoque;
- [x] **Bloqueia lotes vencidos** em saídas de consumo normais;
- [x] Oferece um **simulador visual de alocação**, mostrando de quais lotes a baixa sairá antes de efetivá-la;
- [x] Gera um **painel analítico de risco de vencimento** (Vencidos, 0–7, 8–15 e 16–30 dias);
- [x] Entrega um **relatório financeiro de Consumo vs. Perdas**.

---

##  Stack Tecnológica

| Camada | Tecnologias |
|---|---|
| **Backend** | Node.js, TypeScript, Express 4, Prisma ORM 6, Zod |
| **Banco de Dados** | PostgreSQL 16 (container Docker Alpine) |
| **Testes** | Vitest (testes unitários de domínio) |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React |

---

## Decisões de Engenharia e Arquitetura

### 1. Isolamento de Domínio e Algoritmo FEFO + FIFO
 `backend/src/domain/fefo.ts`

A função pura `allocateFefoBatches` é **desacoplada do banco de dados**, o que permite testá-la em milissegundos, sem mocks de infraestrutura.

- **Consumo fracionado entre múltiplos lotes:** uma saída de 15 unidades consome automaticamente 10 unidades do `Lote A` (vence antes) e 5 do `Lote B` (vence depois).
- **Desempate determinístico (FIFO):** se dois lotes têm exatamente a mesma validade, consome-se primeiro o que entrou mais cedo no estoque (`createdAt ASC`).
- **Bloqueio sanitário:** lotes já vencidos são ignorados nas baixas de consumo (`OUT_CONSUMPTION`), mesmo que tenham saldo físico.
- **Normalização de datas em UTC (`toStartOfDayUTC`):** evita bugs clássicos de fuso horário (ex.: GMT-3) ao comparar datas de validade.

### 2. Controle de Concorrência e Transações Atômicas
 `backend/src/services/stockService.ts`

- A baixa de estoque usa `prisma.$transaction` com nível de isolamento `Prisma.TransactionIsolationLevel.Serializable`, evitando *race conditions* e **saldo negativo** em requisições simultâneas.
- Uma **trava otimista adicional** no `updateMany` valida `currentQuantity: { gte: alloc.takenQuantity }` no exato momento do decremento.

### 3. Modelagem Relacional Voltada à Auditoria Financeira
 `backend/prisma/schema.prisma`

- **Valores monetários em centavos** (`unitCostInCents: Int`), eliminando erros de precisão de ponto flutuante (IEEE 754).
- **Rastreabilidade em dois níveis:**
  - `StockMovement`: cabeçalho da operação (`IN`, `OUT_CONSUMPTION`, `OUT_LOSS`);
  - `StockMovementItem`: itens consumidos de cada lote, **congelando o custo unitário histórico** do lote no momento da baixa.
- **Índice composto** `@@index([productId, expirationDate, currentQuantity])` na tabela `Batch`, otimizando a query do FEFO.

### 4. Simulador de Alocação FEFO
 `POST /api/stock/fefo-preview`

Permite ao operador ver na tela **exatamente de quais lotes e em quais quantidades** o algoritmo retirará os produtos, antes de efetivar a transação no banco.

---

##  Diagramas

### Fluxo de decisão do algoritmo FEFO

```mermaid
flowchart TD
    A([Requisição de saída<br/>produto + quantidade]) --> B{Quantidade<br/>válida?}
    B -- Não --> E1[/InvalidQuantityError/]
    B -- Sim --> C[Filtrar lotes vencidos<br/>validade < hoje em UTC]
    C --> D{Saldo válido total<br/>≥ quantidade?}
    D -- Não --> E2[/InsufficientStockError/]
    D -- Sim --> F[Ordenar lotes por<br/>expirationDate ASC]
    F --> G[Desempate FIFO<br/>createdAt ASC]
    G --> H[Alocar entre lotes<br/>consumo fracionado]
    H --> I{Modo}
    I -- Preview --> J([Retorna alocação<br/>sem alterar o banco])
    I -- Baixa --> K[Transação Serializable]
    K --> L[updateMany com trava otimista<br/>currentQuantity gte takenQuantity]
    L --> M[Registra StockMovement<br/>+ StockMovementItem<br/>com custo congelado]
    M --> N([Baixa concluída])
```

### Modelo Entidade-Relacionamento

```mermaid
erDiagram
    Category ||--o{ Product : "agrupa"
    Product ||--o{ Batch : "possui"
    Product ||--o{ StockMovement : "movimenta"
    StockMovement ||--|{ StockMovementItem : "contém"
    Batch ||--o{ StockMovementItem : "origina"

    Category {
        string name
    }
    Product {
        string name
        int minStock
    }
    Batch {
        date expirationDate
        int currentQuantity
        int unitCostInCents
        datetime createdAt
    }
    StockMovement {
        enum type "IN | OUT_CONSUMPTION | OUT_LOSS"
        datetime createdAt
    }
    StockMovementItem {
        int quantity
        int unitCostInCents "custo congelado"
    }
```

>  O diagrama apresenta as entidades e os campos de maior relevância para o domínio. A definição completa está em [`backend/prisma/schema.prisma`](./backend/prisma/schema.prisma).

---

## Testes Unitários

Os testes ficam em `backend/tests/fefo.spec.ts` (**Vitest**) e cobrem **5 cenários de borda** do algoritmo FEFO:

| # | Cenário | O que garante |
|---|---|---|
| 1 | **Consumo fracionado entre lotes** | Uma saída de 15 un. consome 10 do lote que vence antes e 5 do seguinte |
| 2 | **Desempate FIFO** | Com a mesma validade, o lote mais antigo (`createdAt ASC`) é consumido primeiro |
| 3 | **Bloqueio de lotes vencidos** | Lotes vencidos são ignorados no consumo, mesmo com saldo físico |
| 4 | **Estoque insuficiente** | Lança `InsufficientStockError` quando o saldo válido não cobre a saída |
| 5 | **Quantidade inválida** | Lança `InvalidQuantityError` para quantidades não positivas |

```bash
cd backend
npm test
```

---

## API

**Base URL:** `http://localhost:3333/api`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Healthcheck do servidor |
| `GET` | `/api/categories` | Lista categorias |
| `POST` | `/api/categories` | Cria categoria |
| `GET` | `/api/products` | Lista produtos, calculando `validStock`, `expiredStock` e `isLowStock` |
| `POST` | `/api/products` | Cadastra novo produto |
| `POST` | `/api/batches` | Registra entrada de novo lote em transação com movimentação `IN` |
| `POST` | `/api/stock/fefo-preview` | Simula a alocação FEFO **sem alterar o banco** |
| `POST` | `/api/stock/withdraw-fefo` | Baixa automática FEFO com transação `Serializable` (`OUT_CONSUMPTION`) |
| `POST` | `/api/stock/withdraw-loss` | Registra descarte/perda sanitária ou avaria em lote específico (`OUT_LOSS`) |
| `GET` | `/api/alerts/expiration` | Lotes agrupados em `expired`, `within7Days`, `within15Days` e `within30Days` + resumo financeiro em risco |
| `GET` | `/api/reports/financial` | Métricas de consumo FEFO vs. perdas (`lossPercentage`) e histórico auditado de movimentações |

### Exemplo: `POST /api/stock/withdraw-fefo`

**Requisição**

```json
{
  "productId": 1,
  "quantity": 15
}
```

**Resposta (exemplo ilustrativo)**

```json
{
  "movementId": 42,
  "type": "OUT_CONSUMPTION",
  "totalQuantity": 15,
  "allocations": [
    {
      "batchId": 7,
      "batchCode": "LOTE-A",
      "expirationDate": "2026-11-02",
      "takenQuantity": 10
    },
    {
      "batchId": 9,
      "batchCode": "LOTE-B",
      "expirationDate": "2026-11-20",
      "takenQuantity": 5
    }
  ]
}
```

> O `Lote A` (vence antes) é esgotado primeiro; o restante sai do `Lote B`.

---

## Estrutura do Projeto

```text
validastock/
├── docker-compose.yml          # Container PostgreSQL 16 (validastock_db)
├── docs/
│   └── dashboard.png           # Screenshot oficial da interface
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Modelagem (Category, Product, Batch, StockMovement, StockMovementItem)
│   │   └── seed.ts             # Seed dinâmico com datas relativas ao dia atual
│   ├── src/
│   │   ├── domain/
│   │   │   ├── errors.ts       # DomainError, InsufficientStockError, InvalidQuantityError
│   │   │   └── fefo.ts         # Algoritmo FEFO puro + normalização UTC
│   │   ├── lib/
│   │   │   └── prisma.ts       # Instância do PrismaClient
│   │   ├── services/
│   │   │   ├── stockService.ts # Transações atômicas, preview FEFO e baixa por perda
│   │   │   └── alertService.ts # Dashboard de vencimento (7/15/30d) e relatório financeiro
│   │   ├── routes/
│   │   │   └── api.ts          # Endpoints Express + schemas Zod + error handler
│   │   └── server.ts           # Entrypoint na porta 3333
│   └── tests/
│       └── fefo.spec.ts        # 5 testes unitários no Vitest cobrindo casos de borda
└── frontend/
    ├── src/
    │   ├── App.tsx             # Dashboard completo (Alertas, Simulador FEFO, Entrada e Auditoria)
    │   └── index.css           # Configuração Tailwind CSS
    └── vite.config.ts
```

---

## Como Rodar o Projeto

### Pré-requisitos

- Node.js
- Docker e Docker Compose

### 1. Clonar o repositório

```bash
git clone https://github.com/043Cecilio/validastock.git
cd validastock
```

### 2. Subir o banco de dados (na raiz)

```bash
docker compose up -d
```

### 3. Backend

```bash
cd backend
npm install
```

Crie o arquivo `.env` em `backend/`:

```env
DATABASE_URL="postgresql://admin:adminpassword@localhost:5432/validastock?schema=public"
PORT=3333
```

Crie as tabelas, popule o banco com dados de demonstração e inicie:

```bash
npm run db:migrate
npx tsx prisma/seed.ts
npm test
npm run dev
```

> O seed usa **datas relativas ao dia atual**, então os alertas de vencimento sempre terão dados relevantes para demonstração.

### 4. Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Acesse: **http://localhost:5173**

---

## Roadmap de Evolução

### Entregue no MVP

- [x] Cadastro de categorias, produtos e lotes com data de validade
- [x] Algoritmo FEFO com desempate FIFO e consumo fracionado entre lotes
- [x] Bloqueio de lotes vencidos em saídas de consumo
- [x] Simulador de alocação FEFO antes da baixa
- [x] Baixa transacional com isolamento `Serializable` e trava otimista
- [x] Registro de perdas/descartes (`OUT_LOSS`)
- [x] Painel de risco de vencimento (Vencidos, 0–7, 8–15 e 16–30 dias)
- [x] Relatório financeiro de Consumo vs. Perdas com histórico auditado
- [x] Testes unitários de domínio com Vitest

### Próximos passos

- [ ] **Leitura de XML de NF-e** para cadastro automático de lotes de entrada
- [ ] **Sugestão de promoção automática** para lotes na faixa de 15 dias
- [ ] **Suporte a múltiplos depósitos**

---

## Autor

**Gabriel Cecilio Menezes**

[![GitHub](https://img.shields.io/badge/GitHub-043Cecilio-181717?style=for-the-badge&logo=github)](https://github.com/043Cecilio)

---

<div align="center">

⭐ Se este projeto foi útil ou interessante, considere deixar uma estrela no repositório!

</div>
