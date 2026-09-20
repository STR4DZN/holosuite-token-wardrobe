# AUDITORIA FINAL — HoloSuite Token Wardrobe v0.8.1

## Mudança

Zoom do cropper agora vai de **10% a 600%**.

- 100% = comportamento antigo (`cover`);
- abaixo de 100% = zoom-out;
- botão `Imagem inteira` = calcula o `contain` automaticamente;
- roda do mouse também reduz abaixo de 100%.

## Casos exatos

PASS — quadrada -> fit 100%.
PASS — 1600x900 -> fit 56.25%.
PASS — 900x1600 -> fit 56.25%.
PASS — 3000x1000 -> fit 33.33%.
PASS — ultra-wide extremo -> piso 10%.

## Stress

PASS — 5.000 combinações aleatórias de crop entre 10% e 600%.
PASS — 1.000 casos aleatórios de cor.
PASS — clip circular real.
PASS — eixos menores que o canvas permanecem centralizados.
PASS — pan continua limitado nos eixos maiores.

## Bug adicional corrigido

O preview já usava `frameColor`, mas havia um caminho antigo no canvas final que ainda podia usar `frameConfig.tintColor`.

PASS — preview usa `frameColor`.
PASS — exportação final usa `frameColor`.
PASS — exportação final não usa `frameConfig.tintColor`.

## Regressão v0.8

HoloSuite Token Wardrobe | Ready
HoloSuite Token Wardrobe | Enabled Tokenizer UI for players; uploads remain GM-relayed.
{
  "tests": "PASS",
  "permissionOwnerAutonomy": "PASS",
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
  "texturedFrameColor": "PASS",
  "noGmTokenizerBridgeBlocked": "PASS",
  "circularClip": "PASS"
}

## Segurança

PASS — Socketlib authenticated sender.
PASS — nenhum raw `game.socket`.
PASS — nenhum `Actor.update()`.
PASS — nenhum `prototypeToken.update()`.
PASS — nenhum `autoToken()`.
PASS — Player continua sem FilePicker.
PASS — troca de token limitada a `texture.src`.
