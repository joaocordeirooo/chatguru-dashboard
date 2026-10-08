-- Extensão não destrutiva das tabelas existentes. Executar no chatguru_bd.
ALTER TABLE atendimento.historico_chatguru ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'legado';
ALTER TABLE atendimento.historico_chatguru ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'enviada';
ALTER TABLE atendimento.historico_chatguru ADD COLUMN IF NOT EXISTS criado_em_origem timestamptz;
ALTER TABLE atendimento.historico_chatguru ALTER COLUMN enviado_em DROP NOT NULL;
CREATE INDEX IF NOT EXISTS dashboard_historico_periodo_idx ON atendimento.historico_chatguru (canal, (COALESCE(enviado_em,criado_em_origem)));
CREATE TABLE IF NOT EXISTS public.dashboard_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text UNIQUE NOT NULL,role text NOT NULL CHECK(role IN ('admin','employee')),active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 0,password_hash text NOT NULL);
ALTER TABLE public.dashboard_users ADD COLUMN IF NOT EXISTS historical_author text;
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_users_author_unique ON public.dashboard_users(historical_author) WHERE historical_author IS NOT NULL AND role='employee';
CREATE OR REPLACE VIEW atendimento.controle_anotacoes AS
SELECT 'historico_mensagem'::text AS origem,h.chave_importacao AS chave_registro,h.chat_id,h.contato_nome,h.telefone,h.texto,h.enviado_em AS registrada_em,0.035 AS valor_simulado_reais
FROM atendimento.historico_chatguru h WHERE h.status='enviada'
UNION ALL
SELECT 'anotacao_workflow'::text,('anotacao:'::text || a.id::text),c.chat_id,ct.nome,ct.telefone,a.texto,a.registrada_em,0.035
FROM atendimento.anotacoes a JOIN atendimento.mensagens m ON m.id=a.mensagem_id JOIN atendimento.conversas c ON c.id=m.conversa_id JOIN atendimento.contatos ct ON ct.id=c.contato_id
WHERE a.destino='chatguru' AND a.status='registrada';
