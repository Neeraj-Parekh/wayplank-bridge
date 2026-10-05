/* Wayplank Bridge — GNOME 42 legacy entry point (pre-45 extension system).
 *
 * Same D-Bus contract as extension.js (modern entry point for GNOME 45+):
 *   bus:      org.wayplank.Bridge
 *   path:     /org/wayplank/Bridge
 *   iface:    org.wayplank.Bridge
 * install.sh copies THIS file over extension.js on Shell < 45.
 */
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;

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

function _runningApps() {
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
        log('[wayplank-bridge] GetRunningApps failed: ' + e);
        return [];
    }
}

function _lookup(id) {
    try {
        return Shell.AppSystem.get_default().lookup_app(id);
    } catch (e) {
        return null;
    }
}

function _allWindows() {
    const out = [];
    try {
        const actors = global.get_window_actors();
        for (let i = 0; i < actors.length; i++) {
            try {
                const w = actors[i].meta_window;
                if (w) out.push(w);
            } catch (e) {}
        }
    } catch (e) {}
    return out;
}

function _findWindow(id) {
    const wins = _allWindows();
    for (let i = 0; i < wins.length; i++) {
        try {
            if (String(wins[i].get_id()) === id) return wins[i];
        } catch (e) {}
    }
    return null;
}

function _appOfWindow(w) {
    try {
        const tracker = Shell.WindowTracker.get_default();
        if (tracker && tracker.get_window_app)
            return tracker.get_window_app(w);
    } catch (e) {}
    return null;
}

function _windowRow(w) {
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

var _exported = null;
var _nameId = 0;

function init() {
}

function enable() {
    const impl = {
        GetRunningApps: () => _runningApps(),
        GetWindows: (id) => {
            const app = _lookup(id);
            const out = [];
            if (!app) return out;
            const wins = _allWindows();
            for (let i = 0; i < wins.length; i++) {
                try {
                    if (_appOfWindow(wins[i]) === app)
                        out.push(_windowRow(wins[i]));
                } catch (e) {}
            }
            return out;
        },
        GetActiveWindow: () => {
            try {
                const w = global.display.focus_window;
                if (!w) return ['', '', false, false];
                const app = _appOfWindow(w);
                const row = _windowRow(w);
                let fs = false;
                try { fs = w.is_fullscreen(); } catch (e) { fs = false; }
                return [(app && app.get_id) ? app.get_id() : '', row[0], row[3], fs];
            } catch (e) {
                return ['', '', false, false];
            }
        },
        ActivateApp: (id) => {
            const app = _lookup(id);
            if (app) { try { app.activate(); } catch (e) {} }
        },
        LaunchApp: (id) => {
            const app = _lookup(id);
            if (app) { try { app.open_new_window(-1); } catch (e) {} }
        },
        ActivateWindow: (id) => {
            const w = _findWindow(id);
            if (w) { try { w.activate(global.get_current_time()); } catch (e) {} }
        },
        MinimizeWindow: (id) => {
            const w = _findWindow(id);
            if (w) { try { w.minimize(); } catch (e) {} }
        },
        CloseWindow: (id) => {
            const w = _findWindow(id);
            if (w) { try { w.delete(global.get_current_time()); } catch (e) {} }
        },
    };
    _exported = Gio.DBusExportedObject.wrapJSObject(IFACE_XML, impl);
    _nameId = Gio.bus_own_name(
        Gio.BusType.SESSION,
        'org.wayplank.Bridge',
        Gio.BusNameOwnerFlags.NONE,
        (connection) => {
            try {
                _exported.export(connection, '/org/wayplank/Bridge');
            } catch (e) {
                log('[wayplank-bridge] export failed: ' + e);
            }
        },
        null,
        null);
    log('[wayplank-bridge] enabled');
}

function disable() {
    try {
        if (_exported)
            _exported.unexport();
    } catch (e) {}
    _exported = null;
    try {
        if (_nameId)
            Gio.bus_unown_name(_nameId);
    } catch (e) {}
    _nameId = 0;
    log('[wayplank-bridge] disabled');
}
