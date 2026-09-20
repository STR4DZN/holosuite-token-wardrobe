# Arquitetura v0.5.0

## Mudança principal

`autoToken()` foi removido integralmente.

Motivo: o Tokenizer possui seu próprio pipeline de Layer/crop/offset. Mesmo com `updateActor:false`,
isso podia modificar visualmente o enquadramento escolhido antes de gerar o arquivo.

A v0.4 trata Tokenizer como provedor de **moldura + configuração de armazenamento**.

## Pipeline

1. `source` é carregado.
2. O usuário controla zoom e pan num canvas quadrado.
3. A moldura real configurada no Tokenizer é carregada como overlay.
4. Ao confirmar, o módulo renderiza:
   - imagem enquadrada;
   - frame do Tokenizer.
5. Canvas é exportado para WEBP.
6. `FilePicker.upload()` grava no diretório de upload configurado pelo Tokenizer.
7. A galeria recebe o novo `src`.
8. A troca no mapa atualiza somente `texture.src`.

## Crop math

`baseScale = max(canvas / imageWidth, canvas / imageHeight)`.

Zoom mínimo = `1`, garantindo cobertura total do quadrado.

Pan é limitado por:

```text
maxX = (drawWidth  - canvasSize) / 2
maxY = (drawHeight - canvasSize) / 2
```

Logo não é possível arrastar até expor áreas vazias do canvas.

## Preview

O preview usa:
- imagem real;
- área circular segura;
- frame real Tokenizer;
- tint do frame, quando Tokenizer usa frame-tint.

## Responsive

A shell usa layout flex:
- header fixo;
- conteúdo `min-height:0; overflow-y:auto`;
- footer do cropper fixo.

Isso corrige o problema anterior em telas pequenas onde o conteúdo era cortado sem possibilidade de scroll.

## LANCER

O adapter não replica cegamente a classificação genérica do Tokenizer:
`pilot` e `mech` são tratados como PC, evitando selecionar a moldura/diretório NPC no sistema LANCER.


## Correção de frame

A v0.4.1 ignora `frame-tint` dentro do Wardrobe e lê o valor `default`
registrado em `vtta-tokenizer.default-frame-pc`.

Para LANCER `pilot` e `mech`, isso seleciona a moldura clássica de PC
em vez de `plain-marble-frame-grey.png`.

## Máscara circular real

Preview e exportação usam a mesma função `drawCroppedSource()`:

```text
save()
beginPath()
arc(center, radius=size/2)
clip()
drawImage(...)
restore()
```

Portanto os cantos ficam transparentes antes de a moldura ser desenhada.
O WEBP exportado contém o recorte, não apenas uma indicação visual de área segura.


## GM Relay

A v0.5.0 introduz relay leve via `game.socket` no canal do módulo.

### Casos de uso

1. Player **sem `FILES_UPLOAD`** salva a imagem recortada:
   - cliente do player renderiza o canvas;
   - converte o blob para base64;
   - envia pedido ao GM ativo;
   - GM reconstroi o arquivo e usa `FilePicker.upload()`;
   - retorna o path final.

2. Player **sem permissão direta para atualizar o TokenDocument**:
   - player seleciona uma arte da galeria;
   - envia pedido ao GM ativo;
   - GM valida ownership do Actor do requester;
   - GM executa `token.document.update({"texture.src": cleanSrc})`.

### Segurança

O relay só atende se o requester for OWNER do Actor correspondente.
Mesmo via relay, o módulo continua limitado a:
- upload do arquivo final;
- update de `texture.src` do token escolhido.

Não há atualização de Actor, Prototype Token, HP, posição ou automações.
