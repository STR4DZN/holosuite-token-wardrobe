# MASS TEST REPORT — HoloSuite Token Wardrobe v0.9.2

## Alvo de compatibilidade

- Foundry VTT: 13.351
- Tokenizer: 5.0.3
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
  "tokenizerBridgeReturnedPath": "PASS",
  "tokenizerBridgeAvatarStateSync": "PASS",
  "tokenizerBridgeNoCrossBleed": "PASS",
  "texturedFrameColor": "PASS",
  "noGmTokenizerBridgeBlocked": "PASS",
  "circularClip": "PASS"
}
```

## Mudança da v0.9.2

A borda padrão agora usa:

- `vtta-tokenizer.default-frame-neutral`
- fallback: `modules/vtta-tokenizer/img/default-frame-npc.png`

Isso substitui a base padrão anterior e deixa o Wardrobe alinhado com a moldura NPC do Tokenizer.
