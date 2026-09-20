# Arquitetura — HoloSuite Token Wardrobe v0.8.0

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
