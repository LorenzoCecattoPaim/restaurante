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
| Painel do Garçom | `https://seu-frontend.vercel.app/waiter` |
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

---

## 🧩 Operação integrada (chamados, contas, financeiro, análises)

### Novas telas no admin
| Tela | Quem acessa | O que faz |
|---|---|---|
| Chamados | Gerente, Garçom | Fila de "Chamar garçom" / "Pedir a conta" → Assumir → Concluir. Destaque após o limite configurado |
| Contas | Gerente, Garçom | Consumo aberto por mesa (vindo dos pedidos) → Pagar conta (PIX, Crédito, Débito, Dinheiro, Outros) → mesa liberada |
| Financeiro | Gerente | Faturamento, contas pagas, ticket médio, formas de pagamento, histórico e estorno |
| Análises | Gerente | Tempo para assumir / de atendimento / total, por horário, por funcionário e por mesa |
| Equipe | Gerente | Cadastrar/editar garçom ou cozinha, ativar/desativar, histórico e indicadores por funcionário |

No cardápio (`/?mesa=N`) o cliente tem o botão **Chamar garçom**, sem login. O garçom, depois de logar, cai direto no painel dedicado (`/waiter`) com "Chamados pendentes" (assumir) e "Meus atendimentos" (concluir).

### Variáveis de ambiente novas (backend)
| Variável | Exemplo | Uso |
|---|---|---|
| `WAITERS` | `joao:senha1,maria:senha2` | Bootstrap opcional de garçons por env var (o cadastro normal é pela tela Equipe) |
| `DATA_DIR` | `/var/data` | Persiste o banco em arquivo também em produção — só funciona se o disco for persistente |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | ver seção abaixo | **Forma recomendada de persistir em produção** — funciona no plano free do Render, sem precisar de disco pago |
| `RATE_LIMIT_MAX` | `30` | Requisições/min por IP nas rotas públicas (pedidos e chamados) |

Em **Configurações** defina o *Total de mesas* e o tempo para *Destacar chamado*.

### 💾 Persistência de dados (evitar perder tudo a cada deploy)

Por padrão, em produção (`NODE_ENV=production`) sem nenhuma configuração extra, o banco fica **só em memória** — some a cada redeploy ou quando o serviço reinicia. Isso é proposital: o plano gratuito do Render tem disco efêmero. Duas formas de resolver:

**Opção recomendada — Supabase (grátis, sem cartão, sem expirar):**
1. Crie um projeto em [supabase.com](https://supabase.com) (gratuito).
2. No projeto → **SQL Editor** → cole o conteúdo de `scripts/supabase_setup.sql` → **Run**.
3. No projeto → **Settings → API**: copie a **Project URL** e a **service_role key** (não é a `anon`/`public`).
4. No Render → seu serviço → **Environment**: adicione `SUPABASE_URL` (a Project URL) e `SUPABASE_SERVICE_KEY` (a service_role key).
5. Redeploy. O log deve mostrar `💾 Dados → persistidos no Supabase ☁️`, e `/health` deve responder `"persistence":"supabase","persistenceConnected":true`.

> O free tier do Supabase pausa o projeto após 7 dias sem nenhuma requisição (os dados não são apagados, só fica temporariamente indisponível até reabrir manualmente pelo dashboard). Para um restaurante em operação normal, isso não costuma ser um problema — mas se ficar muito tempo fechado, vale dar uma olhada.

**Opção alternativa — disco no Render:** defina `DATA_DIR` apontando para um [Persistent Disk](https://render.com/docs/disks) do Render (isso exige plano pago, o free não suporta disco).

Sem nenhuma das duas configuradas, o app continua funcionando normalmente — só não guarda nada entre reinicializações.

### Regras importantes
- A conta de uma mesa = pedidos não cancelados e ainda não pagos. Não existe cadastro de consumo paralelo.
- O pagamento é validado no servidor (conta aberta, mesmos pedidos/valor, idempotência). Desconto só pelo gerente.
- Pagamentos nunca são apagados: o gerente pode **estornar** com motivo; tudo fica em `/api/audit`.
- Pedido já pago não pode ser cancelado (estorne antes).

### Qualidade
```bash
npm test        # testes de integração e de cálculo (node:test, sem dependências)
npm run check   # sintaxe de todos os JS e scripts inline dos HTML
```
