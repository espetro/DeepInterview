# Screen: Navbar (shared AppHeader)

Mounted in `__root` for every route: logo, optional centered page title,
LocaleSwitcher, GitHub link, and the account dropdown (B3).

## ASCII mockup

```
+------------------------------------------------------------------+
|  [logo di]        page title          [language v] [gh] (G) v     |
+------------------------------------------------------------------+
                                                        +----------------+
                                                        | (G) Guest      |
                                                        |     local ...  |
                                                        | language [en v]|
                                                        | [history]      |
                                                        | [settings]     |
                                                        +----------------+
```

## Behavior

- Account trigger: ghost icon Button wrapping an Avatar with fallback "G" (no auth; guest).
- Glass dropdown (align end, backdrop blur): header block (avatar + guest name/email line),
  a Language row reusing the LocaleSwitcher pill, then History and Settings items.
- History / Settings items open the centered settings dialog at the matching pane
  (onSelect preventDefault so the menu state survives the dialog opening).
