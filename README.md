# HoloSuite Token Wardrobe v0.10.3 — Prism

Módulo standalone de gerenciamento de artes de token para Foundry VTT v13.351.

## Interface e temas

Prism possui temas **Claro** e **Escuro**, com layout adaptado ao tamanho da janela.

Cada player e GM escolhe em **Configurar Configurações → HoloSuite Token Wardrobe → Tema do Wardrobe**, ou no seletor **Tema** do cabeçalho do app. A configuração é individual por usuário neste mundo (`scope: user`), com Claro como padrão. Ela também afeta o editor de recorte e muda sem recarregar nem perder o enquadramento em andamento.

Há uma preferência individual para **Reduzir movimentos do Wardrobe**; a configuração de movimento reduzido do sistema também é respeitada.

Selecione uma arte para ver a prévia e clique em **Aplicar no token** para confirmar. Use o seletor de personagem, filtro de favoritas e busca para organizar a biblioteca. A busca permanece ao favoritar ou renomear uma entrada. Sem token, a coleção continua visível, mas a aplicação e preparação de imagem exigem um token na cena.

A indicação **Em uso** muda após a confirmação da aplicação e acompanha alterações externas do token. A galeria tem rolagem própria, com busca, filtros, destino e prévia visíveis na janela padrão. Os cards usam tamanho intermediário, limitado a 180 px. **Adicionar uma arte** abre um painel sobre a biblioteca, sem deslocar o botão Aplicar. Em janelas muito pequenas, o layout empilha os painéis para manter a leitura.

O recorte aceita arraste, zoom e setas do teclado (5 px; Shift + setas: 20 px). Remover uma entrada pede confirmação e mantém a textura já aplicada no token.

## Desenvolvimento e release

`npm ci`, `npm run check` e `npm test` validam sintaxe, templates e os fluxos Prism com um ambiente Foundry simulado. Esses testes não substituem a integração em uma sessão real do Foundry.

`python3 tools/package_module.py` gera o ZIP instalável em `dist/`, sem dependências npm ou arquivos de teste. O workflow de release valida, empacota e publica o manifest e ZIP quando a versão de `module.json` é atualizada na branch main.

## Função

O Owner do Actor pode:

- colar uma URL direta de imagem;
- escolher uma imagem do Foundry quando tiver permissão de browse;
- enquadrar manualmente;
- aplicar zoom de 10% a 600%;
- arrastar a imagem;
- usar o botão **Imagem inteira**;
- aplicar a borda fixa do próprio módulo;
- salvar o resultado em WEBP;
- reenquadrar uma aparência já salva;
- renomear, favoritar e remover aparências;
- trocar somente a `texture.src` do próprio token.

## Independência

O Wardrobe é responsável por todo o pipeline de imagem:

1. carrega a imagem de origem;
2. faz crop/zoom/pan em canvas;
3. aplica recorte circular;
4. desenha `assets/fixed-border.png`;
5. gera WEBP 512×512;
6. salva em armazenamento próprio;
7. registra a aparência no flag do Actor;
8. troca a textura do TokenDocument quando solicitado.

Não existe bridge, hook, monkeypatch ou dependência de outro editor de tokens.

## Armazenamento próprio

Diretório padrão:

```text
[data] holosuite-token-wardrobe/tokens
```

O GM pode alterar o diretório em **Configurações do Módulo → Diretório de armazenamento**.

O módulo cria a árvore de diretórios quando possível.

## Players e permissões

O módulo não concede permissões adicionais do Foundry.

Quando o Player é Owner do Actor mas não possui `FILES_UPLOAD`, um GM ativo pode atuar apenas como relay técnico autenticado via socketlib.

O GM valida o remetente real e o ownership antes de:

- fazer upload do WEBP processado;
- persistir o estado da galeria quando necessário;
- trocar `texture.src` quando o Player não consegue atualizar o TokenDocument diretamente.

## Borda

A borda usada pelo preview e pelo arquivo final é exclusivamente:

```text
modules/holosuite-token-wardrobe/assets/fixed-border.png
```

Não existe sistema de cor/tint.

## Saída

- formato: WEBP;
- tamanho: 512×512;
- cantos externos transparentes;
- crop do preview e do arquivo final usam o mesmo estado;
- zoom permitido: 10%–600%.

## URLs

Aceita fontes locais suportadas e links diretos `http://` / `https://`.

Alguns sites bloqueiam carregamento externo por CORS. Nesse caso, use um arquivo local do Foundry ou outra origem que permita carregamento direto.

## Segurança

- nomes de arquivo são sanitizados;
- paths com traversal são bloqueados;
- uploads relay têm limite de tamanho;
- o requester do socket é obtido do contexto autenticado do socketlib;
- a galeria é validada antes de uma textura ser aplicada;
- o módulo não altera o prototype token inteiro;
- a troca de aparência da cena é limitada a `texture.src`.

## Dependências

- HoloSuite Core
- socketlib

## Foundry

- mínimo: v13
- verificado: v13.351
