# CRM — funil de tarefas e pastas

A aba **CRM** começa sem etapas prontas. O administrador usa **Adicionar coluna** para escolher o nome e a cor de cada etapa, conforme o processo do escritório. Pode editar os nomes, trocar as cores e reordenar as colunas por arraste ou pelas setas. O limite é de 100 colunas; uma coluna só pode ser excluída quando estiver vazia.

## Tarefas

Cada tarefa possui nome, cliente/pasta, descrição, prazo, responsável e etapa. Para avançar no funil, arraste o cartão para outra coluna ou abra a tarefa e altere **Etapa**. Também é possível ordenar os cartões dentro da coluna. A busca considera tarefa, cliente e responsável; o filtro **Somente minhas tarefas** restringe a visualização ao usuário atual.

Todos os usuários autenticados visualizam todas as tarefas e podem baixar seus documentos. Funcionários criam tarefas para si e editam, movem e gerenciam anexos somente das tarefas pelas quais são responsáveis. O administrador pode editar qualquer tarefa, trocar responsáveis e personalizar as colunas. Essas regras são verificadas no backend.

O quadro atualiza após as alterações feitas na própria sessão. Use **Atualizar** para buscar alterações feitas por outra pessoa. Edições concorrentes da mesma tarefa são rejeitadas com uma mensagem para recarregar os dados antes de salvar novamente.

## Documentos

Salve a tarefa antes de anexar documentos. Informe o tipo, usando as sugestões ou escrevendo um tipo personalizado. São permitidos PDF, PNG, JPG, JPEG, WEBP, DOCX, XLSX e TXT, até 10 MB por arquivo e 30 anexos ativos por tarefa. A validação confere extensão e assinaturas básicas de formato; não substitui uma análise antivírus.

Os arquivos são armazenados no PostgreSQL com criptografia AES-256-GCM, utilizando a variável já existente **ARCHIVE_ENCRYPTION_KEY**. Preserve essa chave juntamente com os backups: alterá-la sem recriptografar os arquivos impede a leitura dos anexos anteriores. O download exige autenticação. A remoção oculta o documento da tarefa, preservando o registro e o arquivo criptografado no banco; não há tela de restauração ou rotina de expurgo nesta versão.

## Banco e arquitetura

As tabelas `public.crm_stages`, `public.crm_tasks` e `public.crm_attachments` são criadas automaticamente na primeira utilização, no banco configurado em **AUTH_DATABASE_URL**, junto aos usuários do dashboard. O usuário do banco precisa ter permissão para criar essas tabelas. O CRM exige **DEMO_MODE=false** e usuários de autenticação já configurados.

O módulo backend possui arquivos separados em `config`, `models`, `middlewares`, `services`, `controllers` e `routes`. A API está sob `/api/crm`, protegida pela autenticação existente. O frontend separa quadro, cartões, editor de coluna, editor de tarefa, cliente da API, tipos e estilos em `frontend/src/crm`.

O quadro envia apenas os campos necessários aos cartões. Descrições e metadados completos dos documentos são carregados quando a tarefa é aberta; os bytes dos documentos são transferidos somente no upload ou download. Em produção, mantenha HTTPS configurado no domínio da aplicação.

Para publicar esta atualização, envie as alterações ao GitHub e reimplante backend e frontend no EasyPanel, preservando as variáveis do banco e a chave de criptografia.
