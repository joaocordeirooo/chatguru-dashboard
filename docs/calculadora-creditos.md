# Calculadora de créditos

Disponível para administradores em **Categorias e custos**, com cálculo no backend em `POST /api/billing/calculate`.

Tarifas extraídas do código da calculadora fornecido pelo responsável: marketing USD 0,0625; utilidade, autenticação e serviço USD 0,0068; Gupshup USD 0,001 por mensagem enviada ou recebida. São referências para simulação, não consulta automática de contrato ou fatura. A cotação padrão 5,45 pode ser alterada e não representa cotação atual.

O administrador informa as quantidades por número (2998 e 0061), categorias, recebidas, saldos inicial/final, cotação e volumes anteriores no mês. Mensagens humanas e automáticas devem ser incluídas uma única vez. Não somar diálogos com registros de mensagens que já representem o mesmo envio. A calculadora não reclassifica mensagens nem modifica o banco.

Franquia de serviço: `min(serviço no período, max(0, 1000 - serviço anterior no mês))`, calculada independentemente por número. Somente as mensagens restantes são tarifadas. A franquia não se aplica a marketing, utilidade, autenticação ou à taxa Gupshup.

Taxa Gupshup: `min(teto, fluxo acumulado até o fim × 0,001) - min(teto, fluxo anterior × 0,001)`. O teto padrão USD 75 representa um único grupo de cobrança. Confirmar com a plataforma se os números compartilham o teto; para grupos distintos simular separadamente e informar os saldos correspondentes ao mesmo grupo. Fluxo inclui todas as enviadas e recebidas do grupo, desde o início do mês. Nunca reaplicar o teto ou a franquia a cada filtro diário.

Por segurança de interpretação, um cálculo aceita apenas datas dentro do mesmo mês, a partir de outubro de 2026. Ao trocar período ou número, os volumes são limpos e devem ser informados novamente. Saldo e volume precisam ter cortes de horário equivalentes; as datas são uma identificação do intervalo informado e não uma leitura automática de eventos. Isenções de entrada gratuita de 72h, contratos específicos, créditos adicionados, estornos e ajustes não são modelados. A diferença entre saldo inicial e final só representa cobrança quando esses movimentos não ocorreram.

Resultados: taxa Meta por número, serviço gratuito/cobrado, taxa Gupshup, total USD e BRL, consumo exato do saldo e diferença. A diferença usa **simulado menos consumo**. USD usa unidades inteiras de milionésimo; o cálculo não arredonda cada mensagem para centavos. A igualdade entre totais não comprova categorias.

Os cartões antigos de CSV continuam como referência provisória (R$ 0,035 para serviço/sem categoria e R$ 0,3217 para marketing), explicitamente separados da conciliação. Eles não são uma fatura e não incluem a taxa Gupshup nem franquias.

Fonte para a regra de serviço por número/mês: https://support.gupshup.io/hc/en-us/articles/62362400519705-WhatsApp-Service-Messages-Pricing-w-e-f-01-Oct-2026

Não há migração de banco ou novas variáveis de ambiente para a calculadora. Para publicar, atualize o código e implante backend e frontend juntos.
