# Arquitetura v0.4.0

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
