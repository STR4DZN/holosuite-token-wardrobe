# AUDITORIA FINAL — HoloSuite Token Wardrobe v0.4.1

## Bugs reproduzidos pela print

1. A moldura cinza/pedra era proveniente do caminho de frame tintado.
2. A imagem era desenhada em todo o canvas quadrado; a área circular era apenas uma indicação visual.

## Correções

PASS — Wardrobe ignora frame-tint.
PASS — LANCER `pilot` e `mech` usam Tokenizer classic PC frame.
PASS — frame PC é lido do valor DEFAULT registrado pelo Tokenizer.
PASS — fallback é `modules/vtta-tokenizer/img/default-frame-pc.png`.
PASS — preview usa recorte circular real.
PASS — exportação usa o mesmo recorte circular real.
PASS — `clip()` ocorre antes de `drawImage()`.
PASS — círculo de recorte usa centro `(size/2,size/2)` e raio `size/2`.
PASS — canvas final não recebe fundo opaco antes da exportação.
PASS — cantos externos permanecem transparentes no WEBP.
PASS — frame é desenhado somente depois da imagem recortada.
PASS — pan/zoom continuam sendo respeitados antes do clip.

## Regressão

PASS — Node `--check`.
PASS — crop horizontal.
PASS — crop vertical.
PASS — zoom 100%–600%.
PASS — pan limitado.
PASS — URL http/https.
PASS — traversal bloqueado.
PASS — diretório de upload Tokenizer.
PASS — migração de schema anterior.
PASS — ownership de Actor.
PASS — ownership de Token.
PASS — HoloSuite `playerVisible`.
PASS — scroll responsivo permanece.
PASS — nenhuma chamada `autoToken()`.
PASS — nenhuma chamada `Actor.update()`.
PASS — nenhuma chamada `prototypeToken.update()`.
PASS — exatamente um `token.document.update()`.
PASS — payload exatamente `{"texture.src": cleanSrc}`.

## Resultado dos mocks

- `circularClip: PASS`
- `classicBrownFrame: PASS`
- `cropMath: PASS`
- `frameConfig: PASS`
- `uploadDirectory: PASS`
- `migration: PASS`

## Teste real recomendado

1. Colar a mesma URL da print.
2. Arrastar/zoom no editor.
3. Confirmar que os quatro cantos mostram transparência no preview.
4. Salvar.
5. Confirmar no Canvas que só o círculo + moldura marrom aparecem.
