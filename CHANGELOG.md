# Changelog

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
