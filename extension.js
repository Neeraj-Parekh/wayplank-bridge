/* Wayplank Bridge — poll-only v1.
 *
 * Exposes GNOME Shell's own app tracker over D-Bus so an out-of-process
 * Plank build can track native Wayland apps without Wnck/Bamf:
 *
 *   bus:      org.wayplank.Bridge
 *   path:     /org/wayplank/Bridge
 *   iface:    org.wayplank.Bridge
 *   methods:  GetRunningApps() -> a(ssib)   # (desktop-id, name, n_windows, is_active)
 *             GetWindows(s app_id) -> a(ssbb) # (win-id, title, active, maximized)
 *             GetActiveWindow() -> (ssbb)     # (app-id, win-id, maximized, fullscreen)
 *             ActivateApp(s app_id)
 *             LaunchApp(s app_id)           # open a new window
 *             ActivateWindow(s win_id)
 *             MinimizeWindow(s win_id)
 *             CloseWindow(s win_id)
 */
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE_XML = `
<node>
  <interface name="org.wayplank.Bridge">
    <method name="GetRunningApps">
      <arg type="a(ssib)" name="apps" direction="out"/>
    </method>
    <method name="GetWindows">
      <arg type="s" name="app_id" direction="in"/>
      <arg type="a(ssbb)" name="windows" direction="out"/>
    </method>
    <method name="GetActiveWindow">
      <arg type="(ssbb)" name="window" direction="out"/>
    </method>
    <method name="ActivateApp">
      <arg type="s" name="app_id" direction="in"/>
    </method>
    <method name="LaunchApp">
      <arg type="s" name="app_id" direction="in"/>
    </method>
    <method name="ActivateWindow">
      <arg type="s" name="win_id" direction="in"/>
    </method>
    <method name="MinimizeWindow">
      <arg type="s" name="win_id" direction="in"/>
    </method>
    <method name="CloseWindow">
      <arg type="s" name="win_id" direction="in"/>
    </method>
  </interface>
</node>`;

function runningApps() {
    try {
        const apps = Shell.AppSystem.get_default().get_running();
        return apps.map(a => {
            let n = 0;
            try { n = a.get_n_windows(); } catch (e) { n = 0; }
            let active = false;
            try { active = a.is_active(); } catch (e) { active = false; }
            return [a.get_id() || '', a.get_name() || '', n, active];
        });
    } catch (e) {
        log(`[plankbridge] GetRunningApps failed: ${e}`);
        return [];
    }
}

function lookup(id) {
    try {
        return Shell.AppSystem.get_default().lookup_app(id);
    } catch (e) {
        return null;
    }
}

function allWindows() {
    const out = [];
    try {
        for (const actor of global.get_window_actors()) {
            try {
                const w = actor.meta_window;
                if (w) out.push(w);
            } catch (e) {}
        }
    } catch (e) {}
    return out;
}

function findWindow(id) {
    for (const w of allWindows()) {
        try {
            if (String(w.get_id()) === id) return w;
        } catch (e) {}
    }
    return null;
}

function appOfWindow(w) {
    try {
        const tracker = Shell.WindowTracker.get_default();
        if (tracker && tracker.get_window_app)
            return tracker.get_window_app(w);
    } catch (e) {}
    return null;
}

function windowRow(w) {
    let active = false, maximized = false, title = '';
    try { active = !!w.has_focus(); } catch (e) { active = false; }
    try {
        maximized = (w.get_maximized() !== 0);
    } catch (e) { maximized = false; }
    try { title = String(w.get_title() || ''); } catch (e) { title = ''; }
    let id = '';
    try { id = String(w.get_id()); } catch (e) { id = ''; }
    return [id, title, !!active, !!maximized];
}

export default class PlankBridgeExtension extends Extension {
    enable() {
        this._impl = {
            GetRunningApps: () => runningApps(),
            GetWindows: (id) => {
                const app = lookup(id);
                const out = [];
                if (!app) return out;
                for (const w of allWindows()) {
                    try {
                        if (appOfWindow(w) === app)
                            out.push(windowRow(w));
                    } catch (e) {}
                }
                return out;
            },
            GetActiveWindow: () => {
                try {
                    const w = global.display.focus_window;
                    if (!w) return ['', '', false, false];
                    const app = appOfWindow(w);
                    const row = windowRow(w);
                    return [(app && app.get_id) ? app.get_id() : '', row[0], row[3],
                        (() => { try { return w.is_fullscreen(); } catch (e) { return false; } })()];
                } catch (e) {
                    return ['', '', false, false];
                }
            },
            ActivateApp: (id) => {
                const app = lookup(id);
                if (app) { try { app.activate(); } catch (e) {} }
            },
            LaunchApp: (id) => {
                const app = lookup(id);
                if (app) { try { app.open_new_window(-1); } catch (e) {} }
            },
            ActivateWindow: (id) => {
                const w = findWindow(id);
                if (w) { try { w.activate(global.get_current_time()); } catch (e) {} }
            },
            MinimizeWindow: (id) => {
                const w = findWindow(id);
                if (w) { try { w.minimize(); } catch (e) {} }
            },
            CloseWindow: (id) => {
                const w = findWindow(id);
                if (w) { try { w.delete(global.get_current_time()); } catch (e) {} }
            },
        };
        this._exported = Gio.DBusExportedObject.wrapJSObject(IFACE_XML, this._impl);
        this._nameId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            'org.wayplank.Bridge',
            Gio.BusNameOwnerFlags.NONE,
            (connection) => {
                try {
                    this._exported.export(connection, '/org/wayplank/Bridge');
                } catch (e) {
                    log(`[plankbridge] export failed: ${e}`);
                }
            },
            null,
            null);
        log('[plankbridge] enabled');
    }

    disable() {
        try {
            if (this._exported)
                this._exported.unexport();
        } catch (e) {}
        this._exported = null;
        try {
            if (this._nameId)
                Gio.bus_unown_name(this._nameId);
        } catch (e) {}
        this._nameId = 0;
        this._impl = null;
        log('[plankbridge] disabled');
    }
}
