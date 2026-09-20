# HoloSuite Token Wardrobe v0.3.0

Micro-módulo para Foundry VTT 13.351 integrado ao HoloSuite Core.

## Fluxo principal

```text
Arquivo/URL original
        ↓
HoloSuite → Aparências
        ↓
Tokenizer autoToken (sem abrir a janela)
        ↓
centraliza/enquadra usando as configurações do Tokenizer
        ↓
aplica a borda padrão
        ↓
faz upload da imagem final
        ↓
Token Wardrobe salva o resultado na galeria
        ↓
ao escolher a aparência:
TokenDocument.update({"texture.src": final})
```

O Tokenizer é chamado com `updateActor: false`. Ele é usado somente como motor de composição e upload.

## Segurança mecânica

A única mutação feita pelo Token Wardrobe no Token continua sendo:

```js
await token.document.update({"texture.src": cleanSrc});
```

O módulo não altera Actor portrait, Prototype Token, posição, tamanho, escala, visão, luz,
disposition, statuses, effects, iniciativa, Dynamic Ring ou flags de outros módulos.

## URL

URLs `http://` e `https://` são aceitas.

Quando o Tokenizer automático está ativo, a URL é carregada com comportamento compatível com o Tokenizer:
- CORS anônimo;
- proxy do Tokenizer quando configurado;
- falha antes da tokenização se a imagem não puder ser carregada.

A URL original é preservada em `source`; o arquivo final gerado pelo Tokenizer fica em `src`.

## Tokenizer

Integração esperada: módulo `vtta-tokenizer`.

O painel Aparências mostra:
- Tokenizer conectado;
- versão;
- permissão FILES_UPLOAD;
- borda padrão ON/OFF;
- enquadramento CONTER/PREENCHER;
- offset configurado;
- botão **Ajustar recuo** no próprio app (setting player-scoped do Tokenizer);
- processamento automático ON/OFF.

GM pode ativar a borda padrão e alternar o modo de enquadramento sem abrir a janela do Tokenizer.

### Permissão de upload

O autoToken precisa conseguir salvar o arquivo final no Foundry. Players precisam de `FILES_UPLOAD`,
o mesmo requisito do Tokenizer.

## Schema v2

```json
{
  "schemaVersion": 2,
  "gallery": [
    {
      "id": "...",
      "name": "Combate",
      "source": "https://.../arte.png",
      "src": "uploads/tokens/actor.Token.hstw-....webp?hstw=...",
      "processor": "tokenizer",
      "processedAt": 0,
      "processorVersion": "5.0.3",
      "favorite": false,
      "order": 0
    }
  ]
}
```

Entradas das versões anteriores são migradas automaticamente. Como versões antigas não armazenavam a
origem separadamente, `source` recebe o antigo `src`.

## Reprocessar

Cada card possui um botão de varinha. Ele reutiliza `source`, roda novamente no Tokenizer com as
configurações atuais e substitui apenas a imagem processada da galeria.
