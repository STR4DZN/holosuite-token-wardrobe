# Auditoria e Arquitetura — v0.2.1

## Correções da v0.2.0

- API getGallery protegida por ownership.
- switchImage revalida Actor e Token.
- canUserModify usado quando disponível.
- URLs externas bloqueadas para players.
- protocolos perigosos bloqueados.
- extensões validadas.
- preload antes do update.
- lock por Token contra spam/race.
- update redundante evitado.
- Actor sintético recuperável via Token.
- prioridade de Character sem Token corrigida.
- selects usam listeners change em _onRender.
- DialogV2 substitui Dialog V1.
- Dynamic Token Ring fixo gera aviso.
- favoritos não alteram order.
- schemaVersion + migração.
- registerApp só marca sucesso se retornar registro.
- bringToFront usado em ApplicationV2.
- lazy loading e decoding assíncrono.

## Invariante

Nenhuma troca atualiza outro campo do Token além de `texture.src`.

## Release

Ainda requer smoke test real dentro de Foundry 13.351 com GM e Player.

## Segunda auditoria

- mídia reduzida a imagens estáticas;
- URLs remotas bloqueadas para todos;
- `..` path traversal bloqueado;
- FilePicker.browse usa apenas `extensions`/`bucket`, conforme API pública v13;
- renomear usa DialogV2.input;
- busca passou a filtrar o DOM sem re-render por tecla;
- favoritos são apenas marcação visual e não reagrupam a ordem.

## Terceira auditoria

- URLs externas são removidas já na normalização, portanto não chegam às thumbnails.
- paths com `..`, inclusive URL-encoded, são rejeitados.
- galeria legada v0.1/v0.2 em `flags[module].gallery` é migrada para `state`.
- limite efetivo protegido entre 1 e 100 imagens.
- registro no HoloSuite é idempotente.
