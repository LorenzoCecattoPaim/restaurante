# RestaurOS — Backend (Render)

API REST em Node.js puro. Zero dependências externas.

## 🚀 Deploy no Render

1. Suba este repositório no GitHub
2. Em [render.com](https://render.com) → **New Web Service** → conecte o repo
3. Configure:
   - **Build Command:** deixe vazio
   - **Start Command:** `node server/server.js`
4. Adicione as variáveis de ambiente:

```
NODE_ENV=production
ADMIN_USER=admin
ADMIN_PASS=SuaSenhaSegura123
KITCHEN_USER=cozinha
KITCHEN_PASS=SenhaCozinha456
RESTAURANT_NAME=Nome do Restaurante
ALLOWED_ORIGIN=https://seu-frontend.vercel.app
```

5. Após deploy, copie a URL do Render (ex: `https://restauros-api.onrender.com`)
6. Cole essa URL no frontend como `VITE_API_URL` ou diretamente no `config.js`

## 🔌 Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | /health | ❌ | Health check |
| POST | /api/auth/login | ❌ | Login |
| POST | /api/auth/logout | ✅ | Logout |
| GET | /api/categories | ❌ | Categorias |
| GET | /api/products | ❌ | Produtos |
| POST | /api/products | ✅ | Criar produto |
| PUT | /api/products/:id | ✅ | Editar produto |
| DELETE | /api/products/:id | ✅ | Remover produto |
| POST | /api/orders | ❌ | Criar pedido (cliente) |
| GET | /api/orders | ✅ | Listar pedidos |
| PUT | /api/orders/:id/status | ✅ | Atualizar status |
| GET | /api/dashboard | ✅ | Métricas |
| GET/PUT | /api/settings | ✅ | Configurações |

## 💾 Persistência

Em produção (Render free), o filesystem é efêmero. Os dados ficam em memória durante a sessão do servidor.

Para persistência real: use **Render Disks** (plano pago) ou migre para PostgreSQL.

## 🔧 Dev local

```bash
node server/server.js
# ou com reload automático:
node --watch server/server.js
```
