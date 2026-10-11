# Prism 0.10.1 — revisão de identidade visual

## Fonte e evidência

- Fonte visual: `../deliverables/05-prism.html`, conceito Prism aprovado, renderizado em Chrome. Essa fonte apresenta o tema claro; o escuro é uma adaptação cromática, não uma reprodução de uma referência escura existente.
- Comparação de fonte e implementação: `../qa/prism-reference-comparison-0101.jpg`.
- Comparação anterior/corrigido: `../qa/prism-dark-comparison-0101.jpg`.
- Implementação: `../qa/prism-dark-corrected-0101.jpg`.
- Capturas: viewport 1365 × 935 CSS px, screenshots de 1365 × 935 px. Comparações usam dois iframes de 1040 × 1350 CSS px, ambos na escala 0.62; conteúdo do módulo em janela de 980 × 740. A fonte é uma página sem a moldura nativa do Foundry.
- Estado: Angelus, prévia da biblioteca, mesmos assets de demonstração. A captura individual final mostra Aurora selecionada; a comparação usa Vanguarda em ambos os lados.

## Achados e correções

- P1, cores: a versão 0.10.0 usava fundo, painel e estágio em roxo uniforme, perdendo a separação e a iluminação da referência. Corrigido com base grafite, painéis neutros e lavanda nos destaques.
- P2, tratamento de imagem: cards e prévia tinham fundo plano. Recuperados o halo tonal e a guia circular suave da referência; as imagens e o processamento não mudam.
- P2, tipografia: a fonte dependia da variável global do Foundry. A família agora é Segoe UI/Arial, como na Prism original.

## Superfícies conferidas

- Tipografia: família independente do Foundry; pesos, títulos e truncamentos preservados.
- Layout: janela e responsividade preservadas nesta correção. Fonte e módulo têm densidade e controles distintos por integração já existente; esta revisão trata do tema, sem refazer os fluxos. Janelas de 980 e 380 px sem overflow horizontal.
- Cores: claro mantém a paleta original, com iluminação recuperada; escuro traduz essa hierarquia para grafite e lavanda. Textos, estados selecionados e controles conferidos em captura individual legível; a comparação conjunta serve para composição e equilíbrio de cor.
- Assets: os mesmos arquivos da prévia, sem edição, substituição ou nova arte. Borda fixa de produção e pipeline preservados.
- Conteúdo: os textos e ações do módulo permanecem.

## Validação

Troca claro/escuro, seleção para prévia e janela estreita verificadas no navegador. Console sem erros da página; mensagens de metadados da extensão do navegador não pertencem ao módulo. Os 12 testes existentes passam. A prévia usa templates/CSS/JS de produção em runtime Foundry simulado. Não foi executada uma sessão real do Foundry.

Comparação pós-correção não encontrou outros P0/P1/P2 no escopo cromático desta revisão. A aceitação estética continua sendo do usuário.

final result: passed


# Regressão 0.10.2 — miniaturas e cabeçalho

As capturas enviadas pelo usuário (`../upload/Screenshot_10(3).png` e `../upload/Screenshot_11(3).png`) mostram imagens minúsculas em faixas baixas e glyphs quadrados nos controles de fechar/opções.

A prévia anterior não simulava a altura fixa dos botões nem os ícones aplicados diretamente ao botão do cabeçalho. O harness agora inclui ambos os conflitos para verificar a correção.

- CSS 0.10.1 com a fixture: botão de imagem com 32 px de altura, imagem com 12 px; controles do cabeçalho em Arial em vez da fonte de ícones.
- CSS 0.10.2 com a mesma fixture: botão de imagem 274 × 274 px, imagem 254 × 254 px; controles 28 × 28 px na fonte de ícones.
- Janela de 380 px: cards 295 × 295 px, sem overflow lateral (clientWidth e scrollWidth = 365 px).
- Temas claro/escuro, seleção para prévia, abertura/fechamento do menu, fechamento da janela e abertura/fechamento do editor conferidos no runtime simulado. Controles do editor também preservam a fonte de ícones.
- A correção restringe os seletores ao shell do módulo; não substitui os handlers nativos do Foundry.
- Evidência após correção: `../qa/prism-cards-header-0102.jpg`, viewport 1365 × 935.
- Doze testes automatizados continuam passando. Console sem erros do módulo; mensagens de metadados da extensão pertencem ao navegador.

Limite: este teste reproduz os conflitos CSS em runtime simulado; não executa um servidor real do Foundry.

final result: passed
