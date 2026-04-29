# RestaurOS — Frontend (Vercel)

Interface completa do sistema: cardápio, admin, cozinha e login.  
HTML + CSS + JavaScript puro — zero dependências, zero build step.

---

## ⚙️ Configuração obrigatória antes do deploy

Abra o arquivo `js/config.js` e cole a URL do seu backend no Render:

```js
const CONFIG = {
  API_URL: 'https://SEU-BACKEND.onrender.com',  // ← cole aqui
  POLL_INTERVAL: 8000,
};
```

---

## 🚀 Deploy no Vercel

### 1. Suba no GitHub

```bash
git init
git add .
git commit -m "feat: RestaurOS frontend"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/restauros-frontend.git
git push -u origin main
```

### 2. Importe no Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New Project**
2. Importe o repositório `restauros-frontend`
3. Configure:
   - **Framework Preset:** Other
   - **Root Directory:** `/` (raiz)
   - **Build Command:** deixe **vazio**
   - **Output Directory:** deixe **vazio**
4. Clique em **Deploy**

> O `vercel.json` já cuida de todo o roteamento — nenhuma config adicional necessária.

### 3. Copie a URL do Vercel

Após deploy, você recebe algo como `https://restauros-frontend.vercel.app`.

Volte ao painel do **Render** e adicione essa URL na variável `ALLOWED_ORIGIN` do backend:

```
ALLOWED_ORIGIN=https://restauros-frontend.vercel.app
```

---

## 📱 URLs do sistema (após deploy)

| Tela | URL |
|---|---|
| Cardápio (Mesa 5) | `https://seu-frontend.vercel.app/?mesa=5` |
| Login | `https://seu-frontend.vercel.app/login` |
| Painel Admin | `https://seu-frontend.vercel.app/admin` |
| Tela da Cozinha | `https://seu-frontend.vercel.app/kitchen` |

---

## 🔧 Desenvolvimento local

Abra com qualquer servidor estático. A forma mais simples:

```bash
# Python (já vem no macOS/Linux)
python3 -m http.server 8080

# Node.js (instale uma vez)
npx serve .
```

Depois edite `js/config.js` e mude `API_URL` para `http://localhost:3000` enquanto o backend roda local.

---

## 📁 Estrutura

```
restauros-frontend/
├── css/
│   ├── admin.css     design system dark SaaS
│   └── menu.css      cardápio mobile-first
├── js/
│   ├── config.js     URL do backend ← EDITE AQUI
│   ├── api.js        cliente HTTP + auth + retry
│   ├── ui.js         toast, modal, formatters, chart
│   ├── app.js        bootstrap + navegação + auth guard
│   ├── dashboard.js  métricas + gráfico por hora
│   ├── products.js   CRUD produtos + categorias
│   ├── orders.js     pedidos + polling + som + impressão
│   └── settings.js   configurações do restaurante
├── admin.html        painel administrativo
├── kitchen.html      KDS — tela da cozinha
├── login.html        autenticação
├── index.html        cardápio do cliente
├── vercel.json       roteamento Vercel
└── .gitignore
```
