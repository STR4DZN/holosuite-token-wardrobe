# AUDITORIA FINAL — HoloSuite Token Wardrobe v0.5.1

## Bugs desta revisão

1. `Token selecionado` não reagia de forma confiável.
2. `Meu token na cena` não encontrava o Token quando o Actor era Owner mas `actor.isOwner`/TokenDocument update não refletiam isso como esperado.
3. O frame PC podia continuar grey porque a v0.5.0 respeitava `default-frame-pc` customizado do mundo.
4. URLs assinadas do Discord podiam ser quebradas pelo cache-busting adicionado pelo Wardrobe.

## Correções

PASS — `Token selecionado` usa listener DOM direto.
PASS — `Meu token na cena` usa listener DOM direto.
PASS — ownership robusto por `isOwner`, `testUserPermission`, `getUserLevel` e ownership map.
PASS — seleção do token não depende de `TokenDocument.canUserModify()`.
PASS — botão controla o token com `token.control({releaseOthers:true})`.
PASS — botão centraliza a câmera no token quando possível.
PASS — feedback visual/notificação após seleção.
PASS — GM relay permanece disponível para troca quando player não pode atualizar TokenDocument.
PASS — LANCER `pilot/mech` força `modules/vtta-tokenizer/img/default-frame-pc.png`.
PASS — `default-frame-pc` custom/grey do mundo é ignorado para PC no Wardrobe.
PASS — pipeline `frame-tint` continua ignorado.
PASS — URLs remotas não recebem query param extra.
PASS — URL Discord assinada preservada byte-for-byte.
PASS — URL direta `i.pinimg.com` preservada.
PASS — recorte circular real permanece.
PASS — transparência externa permanece.

## Testes executados

PASS — Node `--check`.
PASS — mock `Token selecionado`.
PASS — mock `Meu token na cena`.
PASS — mock Actor Owner com `actor.isOwner=false`.
PASS — mock TokenDocument sem permissão direta de update.
PASS — mock GM relay de troca.
PASS — frame PC forçado apesar de world setting apontar para `plain-marble-frame-grey.png`.
PASS — Discord CDN signed URL.
PASS — Pinterest direct image URL.
PASS — circular clip antes de drawImage.
PASS — raio circular `size/2`.

## Segurança

Existem duas chamadas `token.document.update()`:
- caminho direto local;
- executor do GM relay.

Ambas possuem exatamente:

```js
{"texture.src": cleanSrc}
```

Nenhuma chamada:
- `Actor.update()`;
- `prototypeToken.update()`;
- `autoToken()`.

## Nota de teste visual

Tokens já gerados nas versões anteriores continuam contendo a moldura antiga dentro do próprio WEBP.
Para verificar a correção do frame, use `Reenquadrar` e salve novamente, ou crie uma nova aparência.
