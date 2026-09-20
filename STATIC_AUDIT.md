# AUDITORIA FINAL — HoloSuite Token Wardrobe v0.4.0

## Resultado

PASS — `node --check`.
PASS — registro HoloSuite mockado.
PASS — `playerVisible: true`.
PASS — seleção de frame Tokenizer PC.
PASS — seleção de frame tintado.
PASS — suporte explícito LANCER `pilot` e `mech` como PC.
PASS — diretório de upload Tokenizer PC.
PASS — parser de diretório `[data]`.
PASS — parser de diretório `[s3:bucket]`.
PASS — matemática de cover para imagem horizontal.
PASS — matemática de cover para imagem vertical.
PASS — pan limitado para nunca revelar vazio.
PASS — zoom limitado de 100% a 600%.
PASS — URL Discord-like preservada.
PASS — `javascript:` bloqueado.
PASS — traversal `../` bloqueado.
PASS — traversal URL-encoded bloqueado.
PASS — migração schema v2 -> v3.
PASS — crop default aplicado a entrada legada.
PASS — galeria de Actor não autorizado permanece invisível.
PASS — troca de Token não autorizado falha.
PASS — exatamente um `token.document.update()` existe.
PASS — payload final é exatamente `{"texture.src": cleanSrc}`.
PASS — nenhuma chamada `Actor.update()`.
PASS — nenhuma chamada `prototypeToken.update()`.
PASS — nenhuma chamada `autoToken()`.
PASS — nenhum uso de `default-crop-image`.
PASS — nenhum uso de `default-token-offset`.
PASS — moldura vem das configurações do Tokenizer.
PASS — upload usa diretório do Tokenizer.
PASS — URL é inserida diretamente no app.
PASS — editor possui drag manual.
PASS — editor possui zoom manual.
PASS — editor possui Resetar.
PASS — editor possui Reenquadrar.
PASS — app principal possui rolagem vertical.
PASS — editor possui rolagem vertical.
PASS — height chain usa `min-height:0` + flex.
PASS — limites responsivos por `vw`/`vh`.
PASS — layout reduzido em telas pequenas.
PASS — footer do editor fica separado da área rolável.

## Mudança arquitetural decisiva

A v0.4.0 não chama mais `vtta-tokenizer.api.autoToken()`.

O Tokenizer agora serve como fonte das configurações visuais:
- frame PC/NPC;
- frame tintado e tint;
- diretório de upload;
- tamanho de saída;
- proxy de URL.

O enquadramento é 100% controlado pelo usuário.

## Validação que ainda depende do Foundry real

- confirmar visualmente a moldura customizada específica do seu Tokenizer;
- confirmar CORS de links reais do Discord/Pinterest usados na mesa;
- confirmar upload no hosting real;
- validar interação final com LANCER Automations no mundo.
