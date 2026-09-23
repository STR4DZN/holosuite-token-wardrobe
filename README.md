# HoloSuite Token Wardrobe v0.9.4

Módulo standalone de gerenciamento de artes de token para Foundry VTT v13.351.

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
