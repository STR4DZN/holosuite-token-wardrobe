# Arquitetura — HoloSuite Token Wardrobe v0.9.4

## Objetivo

Pipeline de arte de token totalmente próprio e isolado.

## Componentes

### Wardrobe UI

Seleciona Actor/Token, mostra a galeria e inicia o editor.

### Cropper

Pipeline local:

1. carrega a imagem de origem;
2. normaliza crop/zoom/pan;
3. renderiza preview 512×512;
4. aplica clip circular;
5. desenha a borda fixa do módulo;
6. gera WEBP 512×512.

### Armazenamento

Setting próprio:

```text
holosuite-token-wardrobe.uploadDirectory
```

Default:

```text
[data] holosuite-token-wardrobe/tokens
```

Nenhuma configuração de outro módulo é lida.

### Silent GM Relay

Transporte: `socketlib.executeAsGM()`.

Ações permitidas:

- `saveAppearance`;
- `saveGalleryState`;
- `switchTexture`.

Toda ação valida o requester autenticado e o ownership do Actor.

## saveAppearance

Player:

- renderiza o WEBP final;
- envia base64 + metadata.

GM:

- valida Owner;
- sanitiza filename;
- garante o diretório próprio;
- faz upload;
- grava a galeria no flag do Actor.

## saveGalleryState

Fallback quando o cliente Owner não consegue persistir diretamente.

O GM normaliza todas as entradas antes de salvar.

## switchTexture

Quando o Player não pode atualizar o TokenDocument diretamente:

- GM valida Owner;
- confirma que a imagem pertence à galeria;
- altera somente `texture.src`.

## Frame

Asset único:

```text
modules/holosuite-token-wardrobe/assets/fixed-border.png
```

O preview e o WEBP final usam o mesmo arquivo.

## Schema

Schema v5:

- id
- name
- source
- src
- favorite
- order
- processor
- processedAt
- crop

## Limites

- máximo configurável de aparências, limitado internamente a 100;
- relay base64 limitado a ~28 MB codificado;
- output fixo 512×512;
- zoom 0.10..6.00;
- protocolos perigosos e traversal de paths são bloqueados.

## Autenticação

O Player não envia `requesterId`.

A função registrada no socketlib obtém o remetente apenas de:

```js
this.socketdata.userId
```

Sem contexto autenticado, a operação falha.

## Neutral token targeting

Identificar um TokenDocument não controla nem seleciona o token no Canvas.

O módulo não chama `token.control()`.

## Independência

O módulo não registra hooks de aplicações de editores externos, não substitui métodos de terceiros e não lê settings de terceiros.
