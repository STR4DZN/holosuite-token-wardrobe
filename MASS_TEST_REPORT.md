# MASS TEST REPORT — HoloSuite Token Wardrobe v0.8.0

## Resultado

**PASS**

### Testes comportamentais

```text
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
  "randomizedCropCases": 2500,
  "randomizedColorCases": 1000,
  "texturedFrameColor": "PASS",
  "noGmTokenizerBridgeBlocked": "PASS",
  "circularClip": "PASS"
}
```

### Cobertura

- Owner autonomy com `playerCanManage=false`;
- Player sem `FILES_UPLOAD`;
- Player sem `FILES_BROWSE`;
- saveAppearance via GM relay silencioso;
- fallback de `Actor.setFlag()` via GM;
- troca de token via relay;
- troca direta quando permitida;
- matriz de requester não autorizado;
- autenticação real do remetente via `this.socketdata.userId`;
- tentativa de spoof de requester bloqueada;
- upload > 28 MB codificado bloqueado;
- `vtta-tokenizer.disable-player` reparado;
- diretórios do Tokenizer verificados/criados;
- Tokenizer standalone bridge;
- Apply do Tokenizer habilitado sem conceder FILES_UPLOAD;
- browse do Tokenizer continua false;
- FilePicker global não é monkeypatched;
- Discord signed URL preservada;
- Pinterest direct URL preservada;
- schema v4/migração;
- limite de galeria;
- 2.500 casos aleatórios de crop;
- 1.000 casos aleatórios de cor;
- tint preservando textura;
- clip circular real.

### Auditoria estática

PASS — Node `--check`.
PASS — `module.json` e `pt-BR.json`.
PASS — Handlebars blocks balanceados.
PASS — CSS braces balanceadas.
PASS — HoloSuite, Socketlib e Tokenizer como dependencies.
PASS — nenhum fluxo de aprovação humana.
PASS — nenhum raw `game.socket`.
PASS — sender autenticado por SocketlibContext.
PASS — nenhuma elevação de FILES_UPLOAD / FILES_BROWSE.
PASS — única alteração de setting do Tokenizer: `disable-player=false`.
PASS — nenhuma chamada `Actor.update()` pelo Wardrobe.
PASS — nenhuma chamada `prototypeToken.update()`.
PASS — nenhuma chamada `autoToken()`.
PASS — updates de cena limitados a `texture.src`.
