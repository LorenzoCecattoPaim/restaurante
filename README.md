# 🍽️ RestaurOS

Sistema de gestão para restaurante com autoatendimento.  
**Node.js puro — zero dependências.**

---

## 🚀 Rodar localmente

```bash
# Requisito: Node.js 18+
node server/server.js

# Com auto-reload (Node 18+)
node --watch server/server.js
```

Acesse: **http://localhost:3000/login**

| Usuário   | Senha        | Acesso          |
|-----------|--------------|-----------------|
| `admin`   | `admin123`   | Painel completo |
| `cozinha` | `cozinha123` | Tela da cozinha |

---

## ☁️ Deploy — Railway (recomendado, gratuito)

Railway conecta direto no GitHub e faz deploy automático a cada push.

### 1. Suba o projeto no GitHub

```bash
git init
git add .
git commit -m "feat: RestaurOS MVP"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/restauros.git
git push -u origin main
```

### 2. Crie o projeto no Railway

1. Acesse [railway.app](https://railway.app) e faça login com GitHub
2. Clique em **New Project** → **Deploy from GitHub repo**
3. Selecione o repositório `restauros`
4. Railway detecta o `package.json` e faz deploy automaticamente

### 3. Configure variáveis de ambiente

No painel do Railway → aba **Variables**, adicione:

```
NODE_ENV=production
ADMIN_USER=admin
ADMIN_PASS=SuaSenhaForte123
KITCHEN_USER=cozinha
KITCHEN_PASS=SenhaCozinha456
RESTAURANT_NAME=Nome do Seu Restaurante
```

> Troque as senhas — as padrão são só para desenvolvimento.

### 4. Gere uma URL pública

Railway → aba **Settings** → **Domains** → **Generate Domain**

Você receberá algo como: `restauros-production.up.railway.app`

### 5. Pronto

- Cardápio: `https://sua-url.railway.app/?mesa=5`
- Admin:    `https://sua-url.railway.app/admin`
- Cozinha:  `https://sua-url.railway.app/kitchen`

---

## ☁️ Deploy alternativo — Render (gratuito)

1. Acesse [render.com](https://render.com) → **New Web Service**
2. Conecte o repositório GitHub
3. Configure:
   - **Start Command:** `node server/server.js`
   - **Environment:** Node
4. Adicione as mesmas variáveis de ambiente acima
5. Clique em **Create Web Service**

---

## ⚠️ Persistência em produção

O filesystem do Railway e Render é efêmero — dados somem a cada deploy.

Em produção o banco roda em memória (dados do dia ficam no ar, mas um novo deploy reseta).

**Solução A — Railway Volume (mais simples):**
1. No painel Railway, adicione um **Volume** ao serviço
2. Mount path: `/app/data`
3. Mude a variável: `NODE_ENV=development`

**Solução B — PostgreSQL (para produção séria):**
Railway oferece PostgreSQL gratuito. Basta adicionar o serviço no painel e substituir `server/db.js` por uma versão que use `pg`.

---

## 📁 Estrutura

```
restauros/
├── public/
│   ├── css/
│   │   ├── admin.css        design system dark SaaS
│   │   └── menu.css         estilo do cardápio
│   ├── js/
│   │   ├── api.js           cliente HTTP + auth automática
│   │   ├── ui.js            toast, modal, formatters, chart
│   │   ├── app.js           bootstrap + navegação + auth guard
│   │   ├── dashboard.js     métricas + gráfico por hora
│   │   ├── products.js      CRUD produtos + categorias
│   │   ├── orders.js        pedidos + polling + som + impressão
│   │   └── settings.js      configurações do restaurante
│   ├── admin.html           painel administrativo
│   ├── kitchen.html         KDS — tela da cozinha
│   ├── login.html           autenticação
│   └── index.html           cardápio do cliente
├── server/
│   ├── server.js            HTTP server + arquivos estáticos
│   ├── routes.js            roteador da API REST
│   ├── controllers.js       lógica de negócio
│   ├── auth.js              sessões, login, categorias, settings
│   └── db.js                JSON em arquivo (dev) ou memória (prod)
├── railway.json             config de deploy Railway
├── Procfile                 config de deploy Render/Heroku
├── .gitignore
└── package.json
```

---

## 🔌 API REST

### Públicas (sem auth)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/login | Login |
| GET | /api/categories | Categorias |
| GET | /api/products | Produtos ativos |
| POST | /api/orders | Criar pedido |

### Protegidas (Bearer token)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/dashboard | Métricas do dia |
| POST/PUT/DELETE | /api/products/:id | CRUD produtos |
| GET | /api/orders | Listar pedidos |
| PUT | /api/orders/:id/status | Atualizar status |
| GET/PUT | /api/settings | Configurações |
| POST/DELETE | /api/categories | Categorias |
