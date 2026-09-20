# MASS TEST REPORT — HoloSuite Token Wardrobe v0.9.0

## Alvo de compatibilidade

- Foundry VTT: 13.351
- Tokenizer: **5.0.3**
- HoloSuite Core
- Socketlib

## Resultado

**PASS**

```text
HoloSuite Token Wardrobe | Ready
HoloSuite Token Wardrobe | Enabled Tokenizer UI for players; uploads remain GM-relayed.
{
  "tests": "PASS",
  "permissionOwnerAutonomy": "PASS",
  "neutralTokenTargeting": "PASS",
  "noForcedCanvasControl": "PASS",
  "silentAppearanceRelay": "PASS",
  "silentGalleryFallback": "PASS",
  "relaySwitch": "PASS",
  "directSwitch": "PASS",
  "unauthorizedMatrix": "PASS",
  "authenticatedSocketSender": "PASS",
  "senderSpoofBlocked": "PASS",
  "oversizedUploadBlock": "PASS",
  "tokenizerDisablePlayerRepair": "PASS",
  "tokenizerDirectoryRepair": "PASS",
  "tokenizerStandaloneBridge": "PASS",
  "tokenizerApplyEnabledWithoutFilesUpload": "PASS",
  "tokenizerFileBrowseStillFalse": "PASS",
  "noGlobalFilePickerMonkeypatch": "PASS",
  "discordSignedUrl": "PASS",
  "pinterestDirectUrl": "PASS",
  "migrationV4": "PASS",
  "maxGalleryLimit": "PASS",
  "randomizedCropCases": 5000,
  "randomizedColorCases": 1000,
  "zoomOut10To600": "PASS",
  "fitImage16x9": "PASS",
  "fitImage9x16": "PASS",
  "fitImageUltraWide": "PASS",
  "tokenizer503MarbleTint": "PASS",
  "tokenizer503ColorBlend": "PASS",
  "tokenizerCustomTintFrame": "PASS",
  "ownedRelayTokenInDropdown": "PASS",
  "texturedFrameColor": "PASS",
  "noGmTokenizerBridgeBlocked": "PASS",
  "circularClip": "PASS"
}
```

## Correção visual principal

A v0.9.0 deixa de aproximar o tint do frame.

Ela reproduz o pipeline efetivo do Tokenizer 5.0.3:
1. `default-frame-tint`;
2. fallback `plain-marble-frame-grey.png`;
3. cópia tintada com `source-atop`;
4. blend da cópia sobre o mármore original com `color`;
5. composição final `source-over`.

O antigo `globalAlpha = 0.82` foi removido.

## Regressões cobertas

- Owner autonomia completa sem FILES_UPLOAD;
- FilePicker oculto do Player;
- relay Socketlib autenticado;
- spoof de requester bloqueado;
- Tokenizer standalone bridge;
- Tokenizer Apply sem FILES_UPLOAD;
- Tokenizer browse continua bloqueado;
- Discord signed URL;
- Pinterest direct URL;
- seleção neutra de Token;
- dropdown inclui token Owner que depende de relay;
- zoom 10%–600%;
- botão Imagem inteira;
- 5.000 crops randomizados;
- 1.000 cores randomizadas;
- recorte circular;
- cor no preview e arquivo final;
- base marmorizada 5.0.3;
- custom `default-frame-tint`;
- limite de galeria;
- migração schema v4;
- hardening de path/filename/tamanho.

## Segurança

- nenhuma chamada `Actor.update()`;
- nenhuma chamada `prototypeToken.update()`;
- nenhuma chamada `autoToken()`;
- nenhuma elevação de FILES_UPLOAD/FILES_BROWSE;
- nenhuma seleção automática via `token.control()`;
- mudança do token da cena limitada a `texture.src`.
