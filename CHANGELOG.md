# Changelog

## 0.10.4 — alinhamento e ciclo do editor

- Alinha seletor de personagem, avatar e botão de adicionar na mesma base, com controles de altura uniforme.
- Libera o ciclo de renderização enquanto a imagem carrega: Cancelar e X continuam disponíveis. Fechar aborta o carregamento e ignora respostas tardias.
- Mostra carregamento/erro, permite tentar novamente ou trocar o link original e bloqueia salvar até imagem e borda estarem prontas.
- Cancelar retorna à janela de origem sem reconstruir a galeria ou perder busca/rolagem.
- Reenquadrar preserva ID, favorito, ordem e nome da entrada existente. Renders preservam o nome em edição e o recorte; abrir a mesma entrada novamente foca seu editor.
- Usa IDs únicos para editores de entradas diferentes e limpa o registro ao fechar.
- Bloqueia cancelar/fechar durante o salvamento; falhas de upload mantêm o recorte para nova tentativa.
- Ajusta a prévia à altura disponível, preservando a proporção da arte e corrigindo a escala do arrasto quando a área é retangular.

## 0.10.3 — estado em tempo real e biblioteca compacta

- Atualiza “Em uso”, a prévia e o botão Aplicar após a confirmação da troca, incluindo quando a confirmação chega antes da sincronização local da textura.
- Acompanha eventos `updateToken` e `imageChanged` nas janelas abertas; mantém o estado separado por token e não marca aplicações que falharam.
- Aplica sem reconstruir a galeria, preservando busca, foco e posição de rolagem; bloqueia requisições duplicadas durante a aplicação.
- Reduz os cards para tamanho intermediário, limitado a 180 px, com três colunas na janela padrão.
- Concentra a rolagem na biblioteca; busca, filtros, destino, prévia e aplicação permanecem visíveis no tamanho padrão.
- Substitui abas de personagem por seletor compacto e abre a adição de arte sobre a biblioteca, sem deslocar os controles principais.
- Mantém os temas Prism, controles nativos, pipeline e permissões.

## 0.10.2 — imagens legíveis e controles nativos

- Corrige as miniaturas achatadas por altura fixa de botões do Foundry: área quadrada com tamanho definido pelo card, imagens em `contain`.
- Amplia os cards: grade ajustada ao espaço disponível, duas colunas na janela padrão e nomes maiores.
- Restringe os estilos de botões, inputs e ícones ao conteúdo Prism, preservando fonte, dimensões e ações dos controles nativos de fechar/opções.
- Aplica o isolamento também ao editor; mantém os temas, as preferências individuais e o pipeline de imagem.


## 0.10.1 — identidade visual do tema escuro

- Substitui a base roxa saturada por superfícies grafite, com lavanda apenas nos destaques.
- Recupera a iluminação suave de fundo, cards e prévia circular da referência Prism.
- Usa a família tipográfica da referência, independente da fonte global do Foundry.
- Mantém as preferências individuais e os fluxos da versão 0.10.0.


## 0.10.0 — Prism

- Interface Prism com biblioteca, abas de personagem, filtro de favoritas, busca sem distinção de acentos e prévia dedicada.
- Temas claro e escuro em Configurações → HoloSuite Token Wardrobe → Tema do Wardrobe. Preferência individual (`scope: user`) para GM e players, também disponível no cabeçalho do app.
- Mudança de tema aplicada imediatamente à galeria e ao editor abertos, sem recriar o canvas nem perder o crop.
- Movimento reduzido individual e respeito a `prefers-reduced-motion`.
- Seleção de arte separada de aplicação no token; busca e seleção preservadas ao administrar a coleção.
- Confirmação antes de remover uma aparência. A textura já aplicada não é alterada pela remoção.
- Layout responsivo ao tamanho da janela e movimento do recorte pelo teclado.
- Pipeline de imagem, borda original, esquema v5, autonomia do Owner e relay autenticado preservados.

## 0.9.4

- Pipeline independente de recorte, zoom, pan e borda fixa com saída WEBP 512×512.
