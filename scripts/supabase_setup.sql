-- ============================================================
-- RestaurOS — setup do Supabase
--
-- Rode isso UMA VEZ no SQL Editor do seu projeto Supabase
-- (supabase.com → seu projeto → SQL Editor → New query → colar → Run).
--
-- O que isso cria: uma única tabela com uma linha, guardando o
-- estado inteiro do sistema (produtos, pedidos, usuários, chamados,
-- contas, pagamentos etc.) como JSON — o mesmo formato que hoje já
-- fica em data/db.json. Não é um schema relacional por tabela: é a
-- forma mais simples de dar persistência real sem reescrever o
-- backend inteiro. Ver o comentário no topo de server/db.js.
-- ============================================================

create table if not exists restauros_state (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Nenhum cliente do navegador acessa essa tabela diretamente — só o
-- backend, usando a service_role key (que ignora RLS). Mesmo assim,
-- deixamos RLS ligado e sem nenhuma policy, então mesmo que a chave
-- errada (anon/public) seja usada por engano em algum lugar, o
-- acesso continua bloqueado por padrão.
alter table restauros_state enable row level security;

-- Confirma que a tabela foi criada
select 'Tabela restauros_state criada com sucesso ✅' as resultado;
