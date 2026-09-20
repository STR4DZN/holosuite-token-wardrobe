# STATIC + MOCK AUDIT — v0.2.1

PASS — Node `--check`.
PASS — module.json parse.
PASS — HoloSuite registerApp mocked successfully.
PASS — playerVisible=true.
PASS — authorized gallery available.
PASS — unauthorized gallery hidden.
PASS — valid switch changes token art.
PASS — exactly one TokenDocument.update call exists in source.
PASS — TokenDocument.update payload is exactly `{"texture.src": cleanSrc}`.
PASS — repeated current-image selection produces no extra update.
PASS — missing image fails before update.
PASS — remote URL fails before update.
PASS — unregistered image fails before update.
PASS — unauthorized token fails.
PASS — concurrent switches serialize.
PASS — every concurrent update payload contains only texture.src.
PASS — target image is sanitized before canUserModify check.
PASS — DialogV2.input used.
PASS — ApplicationV2 used.
PASS — FilePicker image/folder patterns use v13 public API shapes.
PASS — search is DOM-side and does not re-render each keystroke.
PASS — Dynamic Token Ring fixed-subject warning retained.

Remaining real-environment validation:
- Foundry VTT 13.351 actual UI render;
- LANCER ownership behavior;
- actual HoloSuite launcher click;
- hosting-specific FilePicker permissions;
- Lancer Automations regression.

PASS — external paths filtered before UI.
PASS — encoded/literal parent traversal rejected.
PASS — legacy v0.1/v0.2 gallery migration mocked.
PASS — gallery limit clamped to max 100.
PASS — HoloSuite registration idempotent.
