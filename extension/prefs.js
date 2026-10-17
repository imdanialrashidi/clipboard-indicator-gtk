import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function spinRow(settings, key, title, subtitle, lower, upper) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: 1,
            page_increment: 10,
        }),
    });
    // GSettings int <-> SpinRow double need an explicit mapping; a plain
    // bind() silently never syncs across the type mismatch.
    row.adjustment.value = settings.get_int(key);
    let syncing = false;
    row.adjustment.connect('notify::value', () => {
        if (syncing)
            return;
        syncing = true;
        settings.set_int(key, Math.round(row.adjustment.value));
        syncing = false;
    });
    settings.connect(`changed::${key}`, () => {
        if (syncing)
            return;
        syncing = true;
        row.adjustment.value = settings.get_int(key);
        syncing = false;
    });
    return row;
}

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export default class ClipboardHistoryPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Clipboard History',
            icon_name: 'edit-paste-symbolic',
        });

        const limits = new Adw.PreferencesGroup({
            title: 'History limits',
            description: 'Bounds apply to new and stored entries; shrinking a limit evicts oldest unpinned entries first.',
        });
        limits.add(spinRow(settings, 'history-size', 'Maximum entries', 'Oldest unpinned entries are removed first.', 1, 100));
        limits.add(spinRow(settings, 'item-bytes-max', 'Maximum entry size (bytes)', 'Longer copies are truncated and marked.', 1024, 524288));
        limits.add(spinRow(settings, 'total-bytes-max', 'Maximum total size (bytes)', 'Eviction keeps storage under this budget.', 65536, 8388608));
        limits.add(spinRow(settings, 'pinned-max', 'Maximum pinned entries', 'Pinning beyond this is refused.', 1, 30));
        page.add(limits);

        const behavior = new Adw.PreferencesGroup({ title: 'Behavior' });
        behavior.add(switchRow(settings, 'paused', 'Pause collection', 'While paused, new copies are ignored.'));
        page.add(behavior);

        const shortcut = new Adw.PreferencesGroup({
            title: 'Keyboard shortcut',
            description: 'Rebind under Settings → Keyboard → Keyboard Shortcuts → Custom Shortcuts.',
        });
        const shortcutRow = new Adw.ActionRow({
            title: 'Toggle history popup',
            subtitle: settings.get_strv('toggle-menu')[0] ?? 'unset',
        });
        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: settings.get_strv('toggle-menu')[0] ?? '',
            valign: Gtk.Align.CENTER,
        });
        settings.connect('changed::toggle-menu', () => {
            const accel = settings.get_strv('toggle-menu')[0] ?? '';
            shortcutLabel.accelerator = accel;
            shortcutRow.subtitle = accel === '' ? 'unset' : accel;
        });
        shortcutRow.add_suffix(shortcutLabel);
        shortcut.add(shortcutRow);
        page.add(shortcut);

        window.add(page);
    }
}
