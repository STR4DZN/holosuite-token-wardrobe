# HoloSuite Token Wardrobe v0.9.4

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


## v0.8.1 — zoom-out

O cropper agora permite zoom de **10% a 600%**.

- `100%`: comportamento antigo, cobrindo completamente o token;
- abaixo de `100%`: permite afastar imagens retangulares;
- `Imagem inteira`: calcula automaticamente o zoom necessário para mostrar toda a imagem;
- roda do mouse também pode reduzir abaixo de 100%;
- quando uma dimensão fica menor que o canvas, ela permanece centralizada nesse eixo.

O arquivo final usa exatamente o mesmo zoom/crop do preview.



## v0.8.2 — sem highlight/glow ao escolher token

O Wardrobe não chama mais `token.control()`.

Os botões:
- `Token selecionado`;
- `Meu token na cena`;

apenas guardam `actorId` + `tokenId` e podem centralizar a câmera.

Eles não selecionam/controlam o token no Canvas e, portanto, não acionam a borda/highlight visual do Foundry/LANCER.

A moldura circular gerada no WEBP permanece independente desse overlay da mesa.


## v0.9.0 — fidelidade visual ao Tokenizer 5.0.3

A moldura colorida agora segue o pipeline real do Tokenizer **5.0.3**.

Base:
- `vtta-tokenizer.default-frame-tint`;
- fallback: `modules/vtta-tokenizer/img/plain-marble-frame-grey.png`.

Tint:
1. desenha a moldura marmorizada original;
2. gera uma cópia colorida com `source-atop`;
3. combina a cópia com a original usando `globalCompositeOperation = "color"`;
4. desenha o resultado sobre o token.

Isso preserva a luminosidade, veios, sombras e detalhes da textura marmorizada em vez de aplicar uma camada translúcida por cima.

A cor continua escolhida por aparência.

Também foi corrigido o dropdown de tokens: um Owner vê seus Tokens mesmo quando a atualização direta do TokenDocument é bloqueada e depende do relay.


## v0.9.1 — correção do bridge do Tokenizer nativo

Correção focada em um conflito observado ao usar o Tokenizer nativo com o Wardrobe ativo:
a arte/estado do retrato podia ser sincronizada de forma incompleta.

A ponte agora:
- retorna o `path` salvo em `updateToken()` e `updateAvatar()`;
- sincroniza o caminho salvo em todos os campos usados comumente por integrações do Tokenizer:
  - `tokenOptions.tokenFilename`;
  - `tokenOptions.avatarFilename`;
  - `avatarOptions.avatarFilename`;
  - `tokenFileName` / `avatarFileName`;
  - metadados espelhados (`src`, `img`, `imagePath`, `current`).

Objetivo: evitar que o Tokenizer aplique caminho incompleto ou reaproveite estado errado do token na arte de retrato.


## v0.9.2 — borda padrão = `default-frame-npc.png`

Alteração pedida: a borda padrão agora usa a base do Tokenizer:

- `vtta-tokenizer.default-frame-neutral`
- fallback: `modules/vtta-tokenizer/img/default-frame-npc.png`

Isso substitui a base padrão anterior.

A lógica de cor, crop, relay e bridge do Tokenizer continua a mesma.


## v0.9.3 — sem sistema de cores, com borda fixa

Mudança pedida: o sistema de cores da borda foi removido.

Agora o Wardrobe usa apenas uma borda fixa embutida no módulo:

- `modules/holosuite-token-wardrobe/assets/fixed-border.png`

Consequências:
- não existe mais seleção de cor no cropper;
- o preview e o arquivo final usam exatamente a mesma imagem de borda;
- o fluxo fica mais simples e previsível.

O restante do módulo foi mantido:
- bridge do Tokenizer;
- relay autenticado;
- crop manual;
- zoom 10%–600%;
- imagem inteira.


## v0.9.4 — cropper corrigido

- sistema de cores removido também do código e do schema;
- schema v5 migra entradas antigas e descarta `frameColor`;
- novo JS/CSS/template com nomes v0.9.4 para evitar cache da UI antiga;
- X da janela fecha explicitamente apenas o cropper;
- Cancelar descarta o crop/zoom não salvo e retorna ao Wardrobe;
- Salvar continua fechando o cropper após persistir.

A borda continua sendo exclusivamente:
`modules/holosuite-token-wardrobe/assets/fixed-border.png`.
