# AUDITORIA v0.3.0 — Tokenizer + URL

## Resultado automatizado

PASS — JavaScript `node --check`.
PASS — mock HoloSuite registration.
PASS — mock Tokenizer 5.0.3 API integration.
PASS — URL source preserved separately from generated token.
PASS — Tokenizer receives `updateActor: false`.
PASS — Tokenizer receives the selected URL/file through `tokenFilename`.
PASS — mock Actor received zero `Actor.update()` calls.
PASS — source contains zero `actor.update()` calls.
PASS — exactly one `token.document.update()` exists.
PASS — its payload is exactly `{"texture.src": cleanSrc}`.
PASS — generated Tokenizer output is used as the gallery `src`.
PASS — remote CORS failure prevents gallery creation.
PASS — missing FILES_UPLOAD prevents automatic processing.
PASS — required frame disabled prevents automatic processing.
PASS — raw URL mode works when automatic Tokenizer is disabled.
PASS — unauthorized Actor gallery remains inaccessible.
PASS — unauthorized Token cannot be changed.
PASS — v0.2.1 schema migrates to schema v2.
PASS — reprocessing uses the original `source`.
PASS — HoloSuite Core remains required.
PASS — Tokenizer is declared as a recommended module.
PASS — GM can enable Tokenizer default frame from Wardrobe.
PASS — GM can toggle contain/fill crop behavior from Wardrobe.
PASS — user can adjust Tokenizer player-scoped offset from Wardrobe.
PASS — dangerous URL schemes remain blocked.

## Segurança de estado

O Wardrobe não chama:
- `Actor.update()`;
- `prototypeToken.update()`;
- update de Dynamic Ring;
- update de escala, visão, posição, condição ou automação.

O Tokenizer é invocado como processador com `updateActor:false`.

## Dependência externa

O comportamento automático foi construído contra a API pública atual do módulo
`vtta-tokenizer`, especialmente `api.autoToken(actor, options)`.

## Validação ainda necessária no mundo real

1. Foundry VTT 13.351 real.
2. HoloSuite real.
3. Tokenizer real com a borda que o grupo usa.
4. Player real com FILES_UPLOAD.
5. Uma URL com CORS permitido.
6. Uma URL sem CORS para confirmar a mensagem de erro.
7. LANCER + Lancer Automations após troca de arte.
