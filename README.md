# wayplank-bridge

GNOME Shell side of [Wayplank](https://github.com/Neeraj-Parekh/wayplank):
publishes running apps, window lists, and window actions over D-Bus so an
out-of-process dock can track native Wayland apps without Wnck/Bamf.

- bus: `org.wayplank.Bridge`, path `/org/wayplank/Bridge`
- `GetRunningApps() → a(ssib)` — (desktop-id, name, n-windows, is-active)
- `GetWindows(app_id) → a(ssbb)` — (win-id, title, active, maximized)
- `GetActiveWindow() → (ssbb)` — (app-id, win-id, maximized, fullscreen)
- `ActivateApp / LaunchApp / ActivateWindow / MinimizeWindow / CloseWindow`

## Install

```bash
cp -r wayplank-bridge ~/.local/share/gnome-shell/extensions/
gnome-extensions enable wayplank-bridge@local
```

Takes effect on next login (GNOME Shell scans extensions at startup).
Poll-only v1: the dock polls once a second; no signals yet.

`extension-legacy.js` is the same contract ported to the pre-45 extension
system (`imports` instead of ES modules) for GNOME 42–44. Installers copy it
over `extension.js` on those Shells.

## License

MIT — see LICENSE.
