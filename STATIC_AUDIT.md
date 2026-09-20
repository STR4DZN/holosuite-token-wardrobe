# AUDITORIA FINAL — HoloSuite Token Wardrobe v0.5.0

## Objetivos desta revisão

1. Players devem poder colar URL sem acesso aos arquivos do Foundry.
2. Players devem poder trocar a imagem do próprio token na cena mesmo sem permissão direta de update no TokenDocument.
3. O app precisava voltar a ter um atalho para focar o token atual do player na mesa.
4. A borda não deve usar o pipeline grey/tinted do Tokenizer.
5. O recorte circular real da v0.4.1 precisa permanecer intacto.

## Correções aplicadas

PASS — GM relay via `game.socket` para upload final.
PASS — GM relay via `game.socket` para `texture.src`.
PASS — validação de ownership do Actor no GM antes de atender relay.
PASS — players sem `FILES_UPLOAD` continuam podendo preparar URL.
PASS — botão de browse do Foundry fica oculto para players.
PASS — botão `Token selecionado`.
PASS — botão `Meu token na cena`.
PASS — seleção/descoberta de token não exige mais permissão direta de update.
PASS — `validateSwitchRequest()` aceita relay GM quando o player não pode modificar o token diretamente.
PASS — `getTokenizerFrameConfig()` usa `default-frame-pc` / `neutral` / `npc` configurados no mundo.
PASS — `frame-tint` continua ignorado no Wardrobe.
PASS — recorte circular real permanece.
PASS — canto externo continua transparente.
PASS — preview e exportação continuam usando a mesma função de crop.

## Mocks executados

PASS — frame clássico configurado: `custom/brown-ring.png`.
PASS — readiness via GM relay sem `FILES_UPLOAD`.
PASS — upload via relay.
PASS — switch via relay.
PASS — actor default resolvido mesmo sem `token.document.canUserModify()`.
PASS — contexto indica `canBrowseFiles=false` para player.
PASS — contexto indica `relayUpload=true`.
PASS — contexto indica `canPickCurrentToken=true`.
PASS — clip circular real.
PASS — registro HoloSuite playerVisible.

## Invariantes de segurança

PASS — nenhuma chamada `Actor.update()`.
PASS — nenhuma chamada `prototypeToken.update()`.
PASS — exatamente duas chamadas `token.document.update()` no código:
- caminho local direto;
- caminho GM relay.
PASS — em ambos os casos o payload é exatamente `{"texture.src": cleanSrc}`.

## Observação sobre Discord / Pinterest

O módulo aceita URL direta do arquivo de imagem.
Links de página/post/pin ainda podem falhar; para esses casos o usuário deve usar o endereço direto do arquivo ou proxy do Tokenizer.
