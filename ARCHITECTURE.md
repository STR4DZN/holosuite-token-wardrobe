# Arquitetura / Auditoria — v0.3.0

## Integração Tokenizer

API pública usada:

```js
game.modules.get("vtta-tokenizer").api.autoToken(actor, {
  tokenFilename: source,
  updateActor: false,
  isWildCard: false,
  nameSuffix,
  disposition
})
```

O código do Tokenizer mostra que `autoToken` gera o View internamente, inicializa a imagem,
adiciona as camadas padrão, gera blob e faz upload. `updateActor` só é executado quando
`mergedOptions.updateActor` é verdadeiro. Nosso adapter passa `false`.

## Por que não usamos autoToken(actor) puro

O fluxo padrão do Tokenizer pode atualizar:
- Actor portrait;
- Prototype Token;
- Tokens ativos;
- Dynamic Ring;
- escala, dependendo das configurações.

Isso não serve para este módulo. A integração usa somente composição/upload e depois o Wardrobe
aplica o arquivo final com seu próprio update restrito a `texture.src`.

## Origem versus resultado

`source` nunca é perdido.
`src` é a arte pronta para o Canvas.

Isso permite trocar borda/enquadramento e reprocessar sem precisar recuperar a imagem original.

## Enquadramento

O Tokenizer centraliza a imagem no Layer durante `Layer.fromImage`. A configuração
`default-crop-image` escolhe entre enquadramento que contém a imagem e crop para preencher.
Quando uma borda é adicionada, `default-token-offset` é aplicado e auto-escalado pelo Tokenizer.

## CORS / URL

Para URL remota, o Wardrobe faz preflight compatível com o comportamento público do Tokenizer
e respeita as configurações `proxy` e `force-proxy`. Se falhar, a entrada não é criada.

## Locks

- troca de token: lock por token;
- processamento Tokenizer: lock por Actor.

Isso evita duas composições/uploads concorrentes disputarem o mesmo contexto.

## Invariante

Existe uma única chamada `token.document.update` no módulo e o payload é somente:

```js
{"texture.src": cleanSrc}
```

## Ajuste sem abrir Tokenizer

O setting `vtta-tokenizer.default-token-offset` é player-scoped no Tokenizer.
O Wardrobe oferece **Ajustar recuo** e grava nesse mesmo setting. Assim cada usuário pode
afinar a entrada da imagem na borda sem abrir a aplicação do Tokenizer.
