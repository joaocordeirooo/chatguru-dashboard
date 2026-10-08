# ChatGuru Dashboard · Darcísio Müller

Protótipo de gestão de mensagens, frontend React/TypeScript e API REST Node.js/TypeScript separados. Tarifa de referência **R$ 0,035 por mensagem enviada**, não uma implementação das regras de faturamento da Meta.

## Executar

Node.js 22+. Na raiz:

```sh
npm ci
cp backend/.env.example backend/.env
# Defina JWT_SECRET com pelo menos 32 caracteres aleatórios.
npm run dev --workspace backend
# Em outro terminal:
npm run dev --workspace frontend
```

Acesse http://localhost:5173. Demonstração usa dados fictícios e contas em memória:

- admin@example.test / DemoAdmin!2026
- ana@example.test / DemoEquipe!2026

DEMO_MODE=true nunca lê os registros reais, mesmo com uma URL configurada. Cadastros demonstrativos se perdem ao reiniciar. Em ambiente público, qualquer pessoa com as credenciais demonstrativas pode entrar; mantenha apenas dados fictícios nesse modo.

## PostgreSQL existente

As tabelas atendimento.contatos, atendimento.conversas e atendimento.mensagens são lidas sem migrações nem alterações. O pool força transações somente leitura. Recomenda-se uma conta com SELECT apenas nessas tabelas. Configure DATABASE_URL **somente no ambiente do backend**, e AUTH_DATABASE_URL para um banco separado de autenticação. O host interno do EasyPanel funciona somente na rede da VPS. Senha/URL mascarada na imagem não são credenciais utilizáveis.

Configure DEMO_MODE=false, OUTGOING_DIRECTION, SENT_STATUSES (lista separada por vírgulas) e RECEIVED_DIRECTION de acordo com os valores reais do n8n. Valores confirmados pelo workflow: saida, enviada, entrada. Apenas saida/enviada conta custo; pendente_envio, envio_incerto, erro e scheduled ficam fora. Cada linha elegível de mensagens conta um envio; confirme que o n8n não grava duplicatas. id_mensagem_origem não foi presumido único sem evidência. Histórico usa o responsável atual da conversa, não necessariamente o funcionário que enviou na época. Para atribuição histórica precisa, o n8n terá de registrar o autor em cada envio.

Para contas persistentes, configure BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD e execute npm run migrate --workspace backend (ou node dist/migrate.js no contêiner). Isso cria somente dashboard_users no banco de autenticação, e não modifica contas existentes. Depois remova a senha de bootstrap do ambiente.

Funcionários são vinculados por e-mail exato, normalizado para minúsculas, a conversas.responsavel_email. Um funcionário vê somente agregados de suas conversas; clientes compartilhados somam somente as conversas dele. Administrador vê todos, incluindo conversas sem responsável. Bigints são tratados como strings nas respostas.

## API

Todas as respostas de dados exigem JWT em cookie HttpOnly, SameSite=Strict (Secure em produção). JWT expira em 1h; cada requisição verifica usuário ativo e versão de sessão.

- POST /api/auth/login — email/password
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/dashboard?from=2026-10-01&to=2026-10-31&group=employee&page=1 — group também conversation/client; limite 20 grupos, período máximo 366 dias.
- GET /api/users — admin
- POST /api/users — admin; name/email/password (mínimo 12 caracteres), cria funcionário
- PATCH /api/users/:id — admin; active/password, revoga sessões anteriores
- GET /health

API rejeita campos inesperados, limita payload a 16 KB e tentativas de login. Escritas exigem Origin igual a APP_ORIGIN; integrações de servidor não estão expostas neste protótipo. Custos são inteiros em milésimos de real (35 por envio), evitando erro de arredondamento por mensagem. Totais do período podem mudar se o n8n registrar mensagens enquanto consultas são executadas.

## Privacidade e criptografia

O navegador recebe somente os agregados solicitados e dados mínimos de contas. Texto, telefone, url_arquivo, campos_cliente e payload_original não são consultados nem retornados. Rotas usam HTTPS/TLS via proxy do EasyPanel; a API interna deve permanecer privada. TLS protege em trânsito, não oculta dados do usuário autenticado no DevTools. Senhas são derivadas com scrypt e salt aleatório. O protótipo não criptografa retroativamente mensagens existentes: isso exigiria mudança coordenada do n8n. Para armazenamento, habilite criptografia de disco e backups na VPS. Não coloque dados reais, .env, dumps ou segredos em GitHub público.

## EasyPanel

Use dois serviços Docker a partir do mesmo repositório, contexto raiz, Dockerfiles backend/Dockerfile e frontend/Dockerfile. Backend porta interna 3000, frontend porta 80. Configure HTTPS e domínio no frontend. APP_ORIGIN deve ser exatamente https://seu-dominio. NODE_ENV=production em backend. A API deve estar acessível somente pelo frontend/rede interna. No frontend/nginx.conf, substitua backend:3000 pelo DNS interno do serviço backend no EasyPanel. Conecte o backend à rede interna do PostgreSQL. Use as variáveis backend/.env.example como referência, sem incluí-las no repositório. DATABASE_SSL=true exige certificado válido; nunca desabilitamos sua validação.

Para um teste Docker local: defina APP_ORIGIN=http://localhost:8080 e NODE_ENV=development no backend/.env e rode docker compose up --build.

## Validação

npm run build e npm test verificam compilação e limites de autenticação, acesso de funcionário, cálculo, cadastro admin, origem e revogação. A conexão real e o deploy dependem das credenciais da VPS. A API não envia mensagens nem modifica o workflow n8n.

## Histórico importado e painel gerencial

A API /api/dashboard aceita dataSource=history (padrão) ou workflow, além de channel, author, type e status. O histórico usa atendimento.historico_chatguru; o workflow usa o schema configurado em SOURCE_SCHEMA, padrão atendimento. As duas origens não são somadas: o CSV não traz IDs únicos suficientes para reconciliar envios entre fontes.

O dashboard exibe registros, envios, erros, chats com envio, autores com envio, custo estimado, totais diários e distribuições por tipo/status. O botão “Relatório 2998 · 01 a 07/10/2026” aplica o filtro do primeiro lote. O CSV contém somente saídas, por isso não representa mensagens recebidas. Todas as consultas de um relatório usam uma transação somente leitura com snapshot consistente. Página vazia preserva o total de grupos.

Execute backend/sql/002_history.sql no banco de dados de origem antes de usar os novos relatórios. A extensão não destrutiva adiciona canal/status/criado_em_origem e corrige a view para excluir erros históricos. A coluna historical_author em public.dashboard_users é criada no mesmo banco; caso AUTH_DATABASE_URL aponte para outro banco, crie a coluna e índice nesse banco também. O admin vincula cada funcionário ao nome exato do autor no CSV pelo cadastro ou botão “Vincular autor”. Funcionário sem vínculo não recebe histórico, e não pode ampliar acesso por filtros. No workflow permanece o filtro por e-mail do responsável atual da conversa.

A carga personalizada do CSV e o script destrutivo de substituição são entregues separadamente, fora do repositório público. Não existem dados de clientes, credenciais de administrador ou chaves de arquivamento neste repositório. Faça backup antes de qualquer limpeza. O script de substituição recria o primeiro admin; não requer migrate após sua conclusão. Textos, telefones e links da carga são armazenados criptografados e não consultados pela API.

Os testes incluem consultas executadas em PostgreSQL embarcado com dados fictícios: limites de datas no fuso de Brasília, exclusão de erros do custo, isolamento por autor, tentativas de filtros maliciosos, paginação e separação do histórico/workflow.
