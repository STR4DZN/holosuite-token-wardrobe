# Arquitetura — HoloSuite Token Wardrobe v0.9.0

## Componentes

### Wardrobe UI
Gerencia galeria do Actor Owner e abre o cropper.

### Cropper
Render local:
1. carrega source;
2. crop/zoom/pan;
3. clip circular;
4. frame;
5. frameColor;
6. WEBP.

### Silent GM Relay
Transporte: `socketlib.executeAsGM()`.

Ações permitidas:
- `saveAppearance`;
- `saveGalleryState`;
- `switchTexture`;
- `tokenizerUpload`.

Toda ação valida ownership no GM.

## saveAppearance

Player:
- renderiza WEBP;
- envia base64 + metadata.

GM:
- valida Owner;
- sanitiza filename;
- garante diretório;
- faz upload;
- grava gallery flag.

Nenhuma confirmação humana.

## saveGalleryState

Fallback para Foundry/system que impeça `Actor.setFlag()` no cliente Owner.

GM normaliza todas as entradas antes de persistir.

## switchTexture

Se Player não pode alterar TokenDocument diretamente:
- GM valida Owner;
- confirma que `src` pertence à galeria;
- altera somente `texture.src`.

## Tokenizer Compatibility Bridge

Motivo: Tokenizer oficial usa `game.user.can("FILES_UPLOAD")` para:
- decidir `canUpload`;
- desabilitar Apply;
- opcionalmente desabilitar o módulo para Players.

Integração:
- GM coloca `vtta-tokenizer.disable-player=false`;
- hooks `renderTokenizer` e `renderApplicationV2`;
- detecta instância Tokenizer;
- exige Actor Owner + GM ativo;
- sobrescreve apenas `updateToken()` e `updateAvatar()` da instância;
- esses métodos enviam o Blob ao relay `tokenizerUpload`;
- `_prepareContext()` da instância passa `canUpload=true`;
- botão `#ok` é habilitado.

Não há monkeypatch de `game.user.can`, FilePicker global ou permissões Foundry.

## Diretórios

Antes de upload, `ensureDirectoryExists()` tenta criar cada segmento via `FilePicker.createDirectory`.

Paths com traversal não são aceitos por `parseDirectorySetting`/sanitização de entrada de upload.

## Schema

Schema v4:
- id
- name
- source
- src
- favorite
- order
- processor
- processedAt
- crop
- frameColor

## Limites

- máximo 100 aparências;
- base64 relay máximo ~28 MB codificado;
- filenames sanitizados;
- URL protocols perigosos bloqueados;
- gallery source precisa ser http/https ou imagem local suportada.


## Autenticação do relay

O Player não envia `requesterId`.

A função registrada no socketlib é uma função normal e obtém o remetente somente de:

```js
this.socketdata.userId
```

Sem contexto autenticado, a ação falha com `TW_AUTH_UNAUTHENTICATED`.

Isso impede spoof do ID de outro Player no payload.


## Zoom-out

`crop.zoom` passa a aceitar `0.10..6.00`.

A escala de referência continua sendo `cover` em `zoom=1`.

`computeFitZoom()` calcula:

```text
containScale / coverScale
```

Isso permite ao botão `Imagem inteira` chegar ao enquadramento que mostra a imagem inteira sem alterar o modelo de dados.

Em eixos cujo tamanho renderizado fica menor que o canvas, `pan=0` é imposto para manter centralização previsível.


## Neutral token targeting

O Wardrobe diferencia:
- **identificar um TokenDocument** para trocar `texture.src`;
- **controlar um Token no Canvas**.

A primeira operação não exige a segunda.

Nenhum fluxo do Wardrobe chama `token.control()` ou `canvas.tokens.controlled = ...`.
Isso evita ativar overlays visuais de seleção/hover do Foundry/LANCER.


## Tokenizer 5.0.3 frame fidelity

Referência: `src/tokenizer/Layer.js::applyTint()` do Tokenizer 5.0.3.

O Wardrobe reproduz:
- marble source;
- `source-atop` para formar a cópia colorida;
- blend `color` sobre o frame original;
- `source-over` para compor o frame final.

O antigo `globalAlpha = 0.82` foi removido.

A imagem-base vem de `vtta-tokenizer.default-frame-tint`, cujo default no 5.0.3 é:
`modules/vtta-tokenizer/img/plain-marble-frame-grey.png`.
