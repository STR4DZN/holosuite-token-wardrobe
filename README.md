# HoloSuite Token Wardrobe v0.8.0

Micro-módulo para Foundry VTT 13.351 integrado ao HoloSuite Core e ao Tokenizer.

## Regra principal

O Owner do Actor controla completamente a própria galeria:

- colar URL;
- enquadrar;
- zoom/arrastar;
- escolher cor da borda;
- salvar;
- reenquadrar;
- renomear;
- favoritar;
- remover;
- trocar a arte do próprio token.

Não existe pedido de autorização ao GM.

## Players e arquivos

Players NÃO recebem:

- FilePicker do Foundry;
- FILES_BROWSE;
- FILES_UPLOAD.

Quando um upload é necessário, o módulo usa um GM ativo apenas como **relay técnico silencioso**.

O GM valida que o requester realmente é Owner do Actor antes de executar:
- upload do WEBP;
- escrita da galeria quando necessária;
- troca de `texture.src` quando o Player não consegue atualizar o TokenDocument diretamente.

## URL

Aceita links diretos `http://` e `https://`.

Exemplos típicos:
- `cdn.discordapp.com/...`
- `media.discordapp.net/...`
- `i.pinimg.com/...`

URLs assinadas do Discord são preservadas sem query-string extra.

Links de página/post/pin não são imagens diretas.

## Editor

- crop manual;
- zoom 100%–600%;
- drag;
- recorte circular real;
- transparência fora do círculo;
- cor da borda por aparência;
- color picker;
- HEX;
- presets.

## Tokenizer standalone sem FILES_UPLOAD

O Tokenizer oficial normalmente exige FILES_UPLOAD para Player.

Com o Wardrobe ativo:
- o setting `vtta-tokenizer.disable-player` é colocado em `false` pelo GM;
- o Tokenizer continua sem FilePicker para o Player;
- quando a janela Tokenizer é renderizada para um Actor que o Player possui, o botão Apply é habilitado;
- `updateToken()` e `updateAvatar()` dessa instância são redirecionados para o GM relay;
- o arquivo final é salvo na pasta configurada pelo Tokenizer.

Nenhuma permissão Foundry é concedida ao Player.

## Tokenizer upload directories

O GM relay usa:
- `vtta-tokenizer.image-upload-directory` para PC/Pilot/Mech;
- `vtta-tokenizer.npc-image-upload-directory` para NPC.

O módulo verifica/cria a árvore de diretórios quando possível.

## LANCER

`pilot` e `mech` são tratados como PC.

A moldura-base PC do Wardrobe é:
`modules/vtta-tokenizer/img/default-frame-pc.png`

A cor final é escolhida no editor e salva por aparência.

## Segurança

O Wardrobe não chama `Actor.update()` nem `prototypeToken.update()`.

A troca de arte da mesa continua limitada a:

```js
{"texture.src": cleanSrc}
```

O Tokenizer standalone mantém seu próprio callback de atualização normal; o Wardrobe apenas substitui o estágio de upload quando o Player não possui FILES_UPLOAD.

## Dependência

`socketlib` é dependência obrigatória para o relay GM autenticado.
