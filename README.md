# HoloSuite Token Wardrobe v0.2.1

Micro-módulo para Foundry VTT 13.351 integrado ao HoloSuite Core.

## Regra principal

A troca final modifica deliberadamente apenas:

```js
await token.document.update({"texture.src": cleanSrc});
```

Não altera Actor portrait, Prototype Token, posição, tamanho, escala, visão, luz, disposição,
statuses, effects, iniciativa ou flags de outros módulos.

## Segurança

Antes do update:
- valida Actor e ownership;
- valida Token ↔ Actor;
- usa `TokenDocument.canUserModify` quando disponível;
- exige imagem cadastrada na galeria do Actor;
- bloqueia `javascript:`, `data:` e `vbscript:`;
- bloqueia URLs e esquemas externos;
- valida extensão;
- faz preload da mídia;
- serializa trocas por Token;
- não atualiza se a imagem já estiver ativa.

A API pública também bloqueia leitura da galeria de Actors não autorizados.

## Dynamic Token Ring

Subject Texture fixa é detectada e gera aviso. O módulo não altera o ring automaticamente.

## Dados

`flags["holosuite-token-wardrobe"].state`

```json
{
  "schemaVersion": 1,
  "gallery": []
}
```

## Recursos

- HoloSuite app `Aparências`
- File Picker somente para imagens
- importação de pasta
- busca
- favoritos
- renomear
- reordenar
- múltiplos Actors/Tokens
- ApplicationV2
- DialogV2
- schema/migração

## Migração

Galerias das versões v0.1/v0.2 são migradas automaticamente para o schema atual quando o usuário tem permissão de gerenciamento.
