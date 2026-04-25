# 🍽️ RestaurOS — Sistema de Gestão para Restaurante

MVP completo de autoatendimento + painel admin + tela de cozinha (KDS).  
Construído com **Node.js puro** — zero dependências externas.

---

## 🚀 Como rodar (3 comandos)

```bash
# 1. Entre na pasta
cd restauros

# 2. Inicie o servidor
node server/server.js

# 3. Acesse no navegador
# http://localhost:3000/login
```

> **Requisito:** Node.js 18 ou superior  
> `node --version` para verificar

---

## 🔐 Credenciais

| Usuário   | Senha        | Acesso              |
|-----------|--------------|---------------------|
| `admin`   | `admin123`   | Painel completo     |
| `cozinha` | `cozinha123` | Apenas tela KDS     |

---

## 📱 URLs do sistema

| Tela               | URL                                  |
|--------------------|--------------------------------------|
| Login              | http://localhost:3000/login          |
| Admin / Dashboard  | http://localhost:3000/admin          |
| Cozinha (KDS)      | http://localhost:3000/kitchen        |
| Cardápio (cliente) | http://localhost:3000/?mesa=5        |

> O número da mesa é passado via query string (`?mesa=N`).  
> Em produção, gere um QR Code para cada mesa apontando para essa URL.

---

## 📁 Estrutura de arquivos

```
restauros/
├── data/
│   └── db.json              ← Banco de dados (criado automaticamente)
│
├── public/
│   ├── css/
│   │   ├── admin.css        ← Design system do painel (dark SaaS)
│   │   └── menu.css         ← Estilo do cardápio público
│   ├── js/
│   │   ├── api.js           ← Cliente HTTP (fetch centralizado + auth)
│   │   ├── ui.js            ← Toast, Modal, formatters, chart SVG
│   │   ├── app.js           ← Bootstrap, auth guard, navegação
│   │   ├── dashboard.js     ← Métricas + gráfico de receita por hora
│   │   ├── products.js      ← CRUD de produtos + categorias
│   │   ├── orders.js        ← Pedidos + polling + som + impressão
│   │   └── settings.js      ← Configurações do restaurante
│   ├── admin.html           ← Painel administrativo completo
│   ├── kitchen.html         ← KDS — tela da cozinha
│   ├── login.html           ← Autenticação
│   └── index.html           ← Cardápio (autoatendimento do cliente)
│
├── server/
│   ├── server.js            ← HTTP server + arquivos estáticos
│   ├── routes.js            ← Roteador da API REST
│   ├── controllers.js       ← Lógica de negócio
│   ├── auth.js              ← Autenticação, sessões, settings, categorias
│   └── db.js                ← Persistência JSON em arquivo
│
├── package.json
└── README.md
```

---

## 🔌 API REST

### Pública (sem autenticação)
| Método | Rota             | Descrição                   |
|--------|------------------|-----------------------------|
| GET    | /api/categories  | Listar categorias           |
| GET    | /api/products    | Listar produtos ativos      |
| POST   | /api/orders      | Criar pedido (cliente)      |
| POST   | /api/auth/login  | Fazer login                 |
| POST   | /api/auth/logout | Fazer logout                |

### Protegida (requer Bearer token)
| Método | Rota                      | Descrição              |
|--------|---------------------------|------------------------|
| GET    | /api/dashboard            | Métricas do dia        |
| POST   | /api/products             | Criar produto          |
| PUT    | /api/products/:id         | Editar produto         |
| DELETE | /api/products/:id         | Remover produto        |
| GET    | /api/orders               | Listar pedidos         |
| PUT    | /api/orders/:id/status    | Atualizar status       |
| GET    | /api/settings             | Ver configurações      |
| PUT    | /api/settings             | Salvar configurações   |
| POST   | /api/categories           | Criar categoria        |
| DELETE | /api/categories/:nome     | Remover categoria      |

---

## ✨ Funcionalidades implementadas

### Painel Admin
- ✅ Dashboard com métricas em tempo real (pedidos, faturamento, ticket médio)
- ✅ Gráfico de barras SVG — receita por hora
- ✅ Top 5 itens mais vendidos com barra de progresso
- ✅ CRUD completo de produtos com modal
- ✅ Toggle ativo/inativo inline na tabela
- ✅ Filtro por categoria, status e busca por texto
- ✅ Gestão de categorias (criar/remover)
- ✅ Gestão de pedidos com filtro por status
- ✅ Avanço de status com feedback otimista (UI atualiza antes da API)
- ✅ Cancelamento de pedidos
- ✅ Impressão de comanda via window.print()
- ✅ Configurações do restaurante

### Cozinha (KDS)
- ✅ Tickets coloridos por status (azul/laranja/verde)
- ✅ Timer de urgência por tempo de espera (verde → amarelo → vermelho)
- ✅ Bipe sonoro para novos pedidos (Web Audio API)
- ✅ Pisca a aba do browser ao receber pedido
- ✅ Observações do cliente destacadas em amarelo
- ✅ Polling automático a cada 8s

### Autenticação
- ✅ Login com token de sessão (válido por 8h)
- ✅ Redirect automático por role (admin → /admin, cozinha → /kitchen)
- ✅ Auth guard no frontend (redireciona para /login se sem token)
- ✅ Proteção de rotas na API (401 sem token)

### Cardápio (Cliente)
- ✅ Listagem por categorias com tabs
- ✅ Carrinho com controle de quantidade
- ✅ Envio de pedido com número da mesa e nome
- ✅ Campo de observações por pedido

---

## 🗺️ Próximos passos (roadmap)

| Prioridade | Feature                              | Esforço |
|------------|--------------------------------------|---------|
| 🔴 Alta    | Migrar para SQLite (better-sqlite3)  | 2h      |
| 🔴 Alta    | Troca de senha para usuários         | 1h      |
| 🟡 Média   | WebSocket (substituir polling)       | 3h      |
| 🟡 Média   | Upload de imagem (multer)            | 2h      |
| 🟡 Média   | QR Code generator para mesas        | 1h      |
| 🟢 Baixa   | Histórico de pedidos com filtro de data | 3h  |
| 🟢 Baixa   | Exportar relatório CSV               | 2h      |
| 🟢 Baixa   | PWA completo (offline, ícone)        | 2h      |

---

## 🛠️ Desenvolvimento no VS Code

Extensões recomendadas:
- **REST Client** — testar a API direto no editor
- **Live Server** — não necessário (o Node já serve os estáticos)
- **Prettier** — formatação de código
- **ESLint** — linting

Para auto-reload durante desenvolvimento:
```bash
node --watch server/server.js
```
