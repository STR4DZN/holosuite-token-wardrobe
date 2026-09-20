# HoloSuite Token Wardrobe v0.5.0

## Fluxo atual

A versão 0.4 remove o auto-enquadramento da versão 0.3.

```text
colar URL / escolher imagem
        ↓
editor manual
        ↓
arrastar + zoom
        ↓
preview com a moldura real do Tokenizer
        ↓
confirmar
        ↓
o módulo renderiza arte + moldura
        ↓
upload no diretório configurado no Tokenizer
        ↓
galeria
        ↓
troca somente texture.src
```

## URL

Aceita link direto `http://` / `https://` de imagem, incluindo CDNs quando o servidor permite uso em canvas.

Para reenquadrar e exportar uma imagem remota, o navegador precisa poder lê-la via CORS.
O módulo reutiliza o proxy configurado no Tokenizer quando aplicável.

Links de páginas (por exemplo, uma página de Pin em vez do arquivo da imagem) não são imagens diretas.

## Editor manual

- arraste a imagem;
- zoom de 100% a 600%;
- roda do mouse também altera zoom;
- o círculo escurecido mostra a área segura;
- a moldura configurada no Tokenizer aparece por cima durante a edição;
- Resetar volta ao enquadramento central padrão.

O zoom mínimo mantém a imagem cobrindo completamente o quadrado, como seletores de avatar.

## Tokenizer

A v0.4 NÃO chama `autoToken()`.

Ela usa somente as configurações e assets do Tokenizer:
- borda padrão PC/NPC;
- borda tintada quando configurada;
- cores de tint;
- diretório de upload;
- tamanho configurado do token;
- proxy configurado para URLs.

Isso elimina o segundo auto-enquadramento que estava alterando o posicionamento escolhido pelo usuário.

## Segurança

A única mutação em Token continua sendo:

```js
await token.document.update({"texture.src": cleanSrc});
```

Não altera Actor, Prototype Token, posição, escala, visão, luz, HP, condições ou flags de automação.

## Tela pequena

A janela principal e o editor:
- respeitam `vw` e `vh`;
- possuem altura máxima;
- têm rolagem vertical própria;
- usam grid de duas colunas em telas menores;
- mantêm os botões de confirmação do cropper fixos no rodapé.

## Schema v3

Cada entrada salva:
- `source`: URL/arquivo original;
- `src`: imagem final com moldura;
- `crop.zoom`;
- `crop.panX`;
- `crop.panY`.

Assim **Reenquadrar** abre novamente a imagem original usando o posicionamento salvo.

## LANCER

A integração classifica Actors `pilot` e `mech` como PC para escolher:
- `default-frame-pc`;
- `image-upload-directory`.

Actors `npc` e `deployable` permanecem no caminho NPC.


## Correções v0.4.1

- removido uso de frame tintado no Wardrobe;
- `pilot`, `mech`, `character` e `pc` usam o **frame clássico padrão de PC do Tokenizer**;
- o preview e o arquivo final agora aplicam máscara circular real;
- pixels fora do círculo ficam transparentes no WEBP;
- a imagem não pode mais aparecer nos cantos quadrados;
- preview usa fundo quadriculado para deixar a transparência visível.

A escolha do frame clássico usa o valor **default registrado pelo Tokenizer**, não o frame tintado ativo no mundo.


## Correções v0.5.0

- players podem colar URL mesmo sem acesso aos arquivos do Foundry;
- upload final pode ser feito por **GM relay** quando o player não possui `FILES_UPLOAD`;
- troca de `texture.src` também pode ser feita por **GM relay** quando o token da cena não é modificável diretamente pelo player;
- botão **Token selecionado** para pegar o token atualmente marcado na mesa;
- botão **Meu token na cena** para focar automaticamente o primeiro token do player na cena atual;
- botão **Escolher imagem do Foundry** agora fica apenas para GM;
- o frame do Wardrobe usa o **frame configurado em `default-frame-pc` / `default-frame-neutral` / `default-frame-npc`**, ignorando o pipeline de tint.

### Importante sobre Discord / Pinterest

O app aceita **URL direta da imagem**.  
Exemplos que tendem a funcionar:
- `cdn.discordapp.com/...`
- `media.discordapp.net/...`
- `i.pinimg.com/...`

Links de página, como um pin do Pinterest ou post, não são arquivo de imagem direto e podem falhar.
