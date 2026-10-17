import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { HistoryModel } from './history.js';
import { HistoryStore } from './store.js';

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
// Mirror of Meta.SelectionType.SELECTION_CLIPBOARD (verified value 1 on
// Shell 51; compared symbolically, never assumed numerically).
const SELECTION_CLIPBOARD = Meta.SelectionType.SELECTION_CLIPBOARD;
const INDICATOR_ICON = 'edit-paste-symbolic';
const MAX_PREVIEW_CHARS = 120;

// Milliseconds to coalesce rapid clipboard bursts into one read.
const READ_DEBOUNCE_MS = 120;
// Cap concurrent clipboard reads: a new change while a read is in flight
// only marks dirty and re-reads once.
const SEARCH_DEBOUNCE_MS = 60;

function firstLine(text) {
    const line = text.split('\n', 1)[0];
    return line.length > MAX_PREVIEW_CHARS
        ? `${[...line].slice(0, MAX_PREVIEW_CHARS).join('')}…`
        : line;
}

const ClipboardHistoryIndicator = GObject.registerClass({
    GTypeName: 'ClipboardHistoryIndicator',
}, class ClipboardHistoryIndicator extends PanelMenu.Button {
    _init({ settings, clipboard, model, store, uuid }) {
        super._init(0.5, 'ClipboardHistory');
        this._settings = settings;
        this._clipboard = clipboard;
        this._model = model;
        this._store = store;
        this._destroyed = false;
        this._ownWriteGuard = false;
        this._readInFlight = false;
        this._readDirty = false;
        this._readSourceId = 0;
        this._searchSourceId = 0;
        this._rows = [];
        this._errorState = null;
        this._loading = true;
        this._unsupportedNotice = false;

        // Icon only: clipboard text never appears in the top panel.
        this._icon = new St.Icon({
            icon_name: INDICATOR_ICON,
            style_class: 'system-status-icon',
            accessible_name: 'Clipboard history',
        });
        this.add_child(this._icon);

        this._buildMenu();
        this._connectSelection();
        this._connectSettings();

        // Focus search whenever the popup opens.
        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen && !this._destroyed)
                this._searchEntry.grab_key_focus();
        });
        this._render();
    }

    _buildMenu() {
        const topBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clipboard-history-menu',
        });

        this._searchEntry = new St.Entry({
            hint_text: 'Search clipboard history',
            can_focus: true,
            style_class: 'clipboard-history-search',
            x_expand: true,
        });
        this._searchEntry.clutter_text.connect('text-changed', () => {
            if (this._searchSourceId !== 0)
                GLib.source_remove(this._searchSourceId);
            this._searchSourceId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, SEARCH_DEBOUNCE_MS, () => {
                    this._searchSourceId = 0;
                    this._render();
                    return GLib.SOURCE_REMOVE;
                });
        });
        topBox.add_child(this._searchEntry);

        this._noticeLabel = new St.Label({
            style_class: 'clipboard-history-notice',
            x_expand: true,
        });
        this._noticeLabel.hide();
        topBox.add_child(this._noticeLabel);

        this._scroll = new St.ScrollView({
            style_class: 'clipboard-history-scroll',
            x_expand: true,
            y_expand: true,
            overlay_scrollbars: true,
        });
        this._listBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this._scroll.set_child(this._listBox);
        topBox.add_child(this._scroll);

        const toolbar = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'clipboard-history-toolbar',
            x_expand: true,
        });
        this._pauseButton = this._makeToolbarButton(
            'Pause collection', 'media-playback-pause-symbolic', () => this._setPaused(true));
        this._resumeButton = this._makeToolbarButton(
            'Resume collection', 'media-playback-start-symbolic', () => this._setPaused(false));
        const clearButton = this._makeToolbarButton(
            'Clear history', 'edit-clear-all-symbolic', () => this._onClear());
        const settingsButton = this._makeToolbarButton(
            'Clipboard history settings', 'emblem-system-symbolic', () => {
                this.menu.close();
                this._openPreferences?.();
            });
        toolbar.add_child(this._pauseButton);
        toolbar.add_child(this._resumeButton);
        toolbar.add_child(clearButton);
        toolbar.add_child(settingsButton);
        topBox.add_child(toolbar);

        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        item.add_child(topBox);
        this.menu.addMenuItem(item);
    }

    _makeToolbarButton(accessibleName, iconName, onClicked) {
        const button = new St.Button({
            style_class: 'clipboard-history-toolbar-button button',
            accessible_name: accessibleName,
            can_focus: true,
        });
        button.set_child(new St.Icon({ icon_name: iconName, style_class: 'popup-menu-icon' }));
        button.connect('clicked', () => {
            if (!this._destroyed)
                onClicked();
        });
        return button;
    }

    _connectSelection() {
        const display = Shell.Global.get().get_display();
        this._selection = display.get_selection();
        this._selectionChangedId = this._selection.connect(
            'owner-changed', (_selection, selectionType) => {
                if (this._destroyed)
                    return;
                if (selectionType !== SELECTION_CLIPBOARD)
                    return;
                // Restores via set_text() emit owner-changed asynchronously,
                // so the guard is consumed here — not at the set_text() call
                // site — to reliably swallow exactly one own write.
                if (this._ownWriteGuard) {
                    this._ownWriteGuard = false;
                    return;
                }
                if (this._settings.get_boolean('paused'))
                    return;
                this._scheduleRead();
            });
    }
    _connectSettings() {
        this._settingsChangedIds = [
            this._settings.connect('changed::history-size', () => this._onLimitChanged()),
            this._settings.connect('changed::item-bytes-max', () => this._onLimitChanged()),
            this._settings.connect('changed::total-bytes-max', () => this._onLimitChanged()),
            this._settings.connect('changed::pinned-max', () => this._onLimitChanged()),
            this._settings.connect('changed::paused', () => this._render()),
        ];
    }
    // Called once when persisted history finishes loading.
    finishLoad(recovered) {
        if (this._destroyed)
            return;
        this._loading = false;
        if (recovered)
            this._pendingNotice = 'Stored history was corrupt, so it was reset.';
        this._render();
    }

    failLoad() {
        if (this._destroyed)
            return;
        this._loading = false;
        this._errorState = 'storage';
        this._render();
    }


    _onLimitChanged() {
        this._model.historySize = HistoryModel_clamp(this._settings, 'history-size', 1, 100, 30);
        this._model.itemBytesMax = HistoryModel_clamp(this._settings, 'item-bytes-max', 1024, 524288, 51200);
        this._model.totalBytesMax = HistoryModel_clamp(this._settings, 'total-bytes-max', 65536, 8388608, 1048576);
        this._model.pinnedMax = HistoryModel_clamp(this._settings, 'pinned-max', 1, 30, 10);
        this._model._enforceBounds();
        this._persist();
        this._render();
    }

    _scheduleRead() {
        if (this._readSourceId !== 0)
            return;
        this._readSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, READ_DEBOUNCE_MS, () => {
                this._readSourceId = 0;
                this._readClipboard();
                return GLib.SOURCE_REMOVE;
            });
    }

    get destroyed() {
        return this._destroyed;
    }

    _readClipboard() {
        if (this._destroyed)
            return;
        if (this._readInFlight) {
            this._readDirty = true;
            return;
        }
        this._readInFlight = true;
        let mimetypes = null;
        try {
            mimetypes = this._clipboard.get_mimetypes(CLIPBOARD_TYPE);
        } catch (e) {
            // Fall through to the error path below.
        }
        if (!mimetypes || mimetypes.length === 0) {
            this._finishRead(null, true);
            return;
        }
        try {
            this._clipboard.get_text(CLIPBOARD_TYPE, (_clipboard, text) => {
                if (this._destroyed)
                    return;
                this._finishRead(text, false);
            });
        } catch (e) {
            this._finishRead(null, true);
        }
    }

    _finishRead(text, failed) {
        this._readInFlight = false;
        if (this._readDirty) {
            this._readDirty = false;
            this._scheduleRead();
        }
        if (this._destroyed)
            return;
        this._loading = false;
        if (failed || text === null || text === undefined) {
            if (failed) {
                // Count-only diagnostics: never log clipboard content.
                console.error('clipboard-history: clipboard read failed');
                this._errorState = 'read';
            } else {
                // Unsupported (non-text) content: neutral notice, not an error.
                this._unsupportedNotice = true;
                this._errorState = null;
            }
            this._render();
            return;
        }
        this._errorState = null;
        this._unsupportedNotice = false;
        const entry = this._model.add(text);
        if (entry !== null)
            this._persist();
        this._render();
    }

    _persist() {
        this._store.scheduleSave(this._model.serialize());
    }

    _reloadFromStore() {
        this._store.load().then(({ entries, recovered }) => {
            if (this._destroyed)
                return;
            this._model.load(entries);
            this.finishLoad(recovered);
        }).catch(() => {
            if (!this._destroyed)
                this.failLoad();
        });
    }

    _setPaused(paused) {
        this._settings.set_boolean('paused', paused);
        this._render();
    }

    _onRestore(entry) {
        // Guard is consumed by the next owner-changed emission (see
        // _connectSelection): set_text() emits asynchronously. On failure
        // there is no emission, so release the guard immediately.
        this._ownWriteGuard = true;
        try {
            this._clipboard.set_text(CLIPBOARD_TYPE, entry.text);
        } catch (e) {
            this._ownWriteGuard = false;
            console.error('clipboard-history: clipboard restore failed');
        }
        this.menu.close();
    }

    _onPin(entry) {
        if (!this._model.pin(entry)) {
            this._notice('Pin limit reached — unpin something first.');
            return;
        }
        this._persist();
        this._render();
    }

    _onUnpin(entry) {
        this._model.unpin(entry);
        this._persist();
        this._render();
    }

    _onDelete(entry) {
        this._model.remove(entry);
        this._persist();
        this._render();
    }

    _onClear() {
        const removed = this._model.clear();
        if (removed > 0) {
            if (this._model.entries.length === 0)
                this._store.clearFile();
            else
                this._persist();
        }
        this._render();
    }

    _notice(text) {
        this._noticeLabel.text = text;
        this._noticeLabel.show();
    }

    _render() {
        if (this._destroyed)
            return;
        for (const row of this._rows)
            row.destroy();
        this._rows = [];
        this._noticeLabel.hide();

        const paused = this._settings.get_boolean('paused');
        this._pauseButton.visible = !paused;
        this._resumeButton.visible = paused;

        const query = this._searchEntry.text ?? '';
        if (this._loading) {
            this._renderStatus('Loading clipboard history…');
            this._showPendingNotice();
            return;
        }
        // Errors render as a banner above the kept history, never as a
        // replacement for it: old entries stay usable with a Retry action.
        if (this._errorState === 'read' || this._errorState === 'storage') {
            const wasStorage = this._errorState === 'storage';
            const message = wasStorage
                ? 'Couldn’t load stored history. Showing session history.'
                : 'Couldn’t read the clipboard. Showing kept history.';
            this._notice(message);
            this._renderRetryRow(() => {
                this._errorState = null;
                this._loading = true;
                this._render();
                this._reloadFromStore();
                if (!wasStorage)
                    this._scheduleRead();
            });
        }
        if (paused && this._model.entries.length === 0 && !this._errorState) {
            this._renderStatus('Collection is paused.', 'Resume', () => this._setPaused(false));
            return;
        }
        if (this._model.entries.length === 0 && !this._errorState) {
            this._renderStatus('Clipboard history is empty. Copy something to get started.');
            return;
        }
        const matches = this._model.search(query);
        if (matches.length === 0) {
            this._renderStatus('No matches. Try a different search.');
            return;
        }
        if (paused)
            this._notice('Collection is paused — new copies are ignored.');
        else if (this._unsupportedNotice)
            this._notice('Latest copy isn’t text, so it wasn’t stored.');
        this._showPendingNotice();
        for (const entry of matches)
            this._addRow(entry);
    }

    // Notices queued before _render() (e.g. corrupt-cache reset) would be
    // hidden by the render's notice reset; replay them last so they stay
    // visible.
    _showPendingNotice() {
        if (this._pendingNotice) {
            this._notice(this._pendingNotice);
            this._pendingNotice = null;
        }
    }

    _renderRetryRow(onRetry) {
        const button = new St.Button({
            label: 'Retry',
            style_class: 'button',
            can_focus: true,
            x_align: Clutter.ActorAlign.START,
        });
        button.connect('clicked', () => {
            if (!this._destroyed)
                onRetry();
        });
        this._listBox.add_child(button);
        this._rows.push(button);
    }

    _renderStatus(text, actionLabel, onAction) {
        const label = new St.Label({
            text,
            style_class: 'clipboard-history-status',
            x_expand: true,
        });
        this._listBox.add_child(label);
        this._rows.push(label);
        if (actionLabel) {
            const button = new St.Button({
                label: actionLabel,
                style_class: 'button',
                can_focus: true,
                x_align: Clutter.ActorAlign.START,
            });
            button.connect('clicked', () => {
                if (!this._destroyed)
                    onAction();
            });
            this._listBox.add_child(button);
            this._rows.push(button);
        }
    }

    _addRow(entry) {
        const item = new PopupMenu.PopupBaseMenuItem({ can_focus: true });
        item.accessible_name = entry.pinned ? `Pinned: ${firstLine(entry.text)}` : firstLine(entry.text);

        const textButton = new St.Button({
            style_class: 'clipboard-history-item-text',
            can_focus: false,
            x_expand: true,
        });
        const label = new St.Label({
            text: firstLine(entry.text) + (entry.truncated ? '  (truncated)' : ''),
            style_class: 'clipboard-history-item-label' + (entry.pinned ? ' clipboard-history-pinned' : ''),
            x_expand: true,
        });
        textButton.set_child(label);
        textButton.connect('clicked', () => this._onRestore(entry));
        item.add_child(textButton);

        const pinButton = new St.Button({
            style_class: 'clipboard-history-row-button button',
            accessible_name: entry.pinned ? 'Unpin item' : 'Pin item',
            can_focus: true,
        });
        pinButton.set_child(new St.Icon({
            icon_name: entry.pinned ? 'view-pin-symbolic' : 'view-pin-symbolic',
            style_class: 'popup-menu-icon',
        }));
        pinButton.connect('clicked', () => {
            if (entry.pinned)
                this._onUnpin(entry);
            else
                this._onPin(entry);
        });
        item.add_child(pinButton);

        const deleteButton = new St.Button({
            style_class: 'clipboard-history-row-button button',
            accessible_name: 'Delete item',
            can_focus: true,
        });
        deleteButton.set_child(new St.Icon({
            icon_name: 'edit-delete-symbolic',
            style_class: 'popup-menu-icon',
        }));
        deleteButton.connect('clicked', () => this._onDelete(entry));
        item.add_child(deleteButton);

        // Activating the row itself restores the entry.
        item.connect('activate', () => this._onRestore(entry));

        this._listBox.add_child(item);
        this._rows.push(item);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._selectionChangedId && this._selection) {
            this._selection.disconnect(this._selectionChangedId);
            this._selectionChangedId = 0;
        }
        for (const id of this._settingsChangedIds ?? [])
            this._settings.disconnect(id);
        this._settingsChangedIds = [];
        if (this._readSourceId !== 0) {
            GLib.source_remove(this._readSourceId);
            this._readSourceId = 0;
        }
        if (this._searchSourceId !== 0) {
            GLib.source_remove(this._searchSourceId);
            this._searchSourceId = 0;
        }
        for (const row of this._rows)
            row.destroy();
        this._rows = [];
        super.destroy();
    }
});

function HistoryModel_clamp(settings, key, min, max, fallback) {
    try {
        const n = Math.floor(settings.get_int(key));
        if (!Number.isFinite(n))
            return fallback;
        return Math.min(max, Math.max(min, n));
    } catch (e) {
        return fallback;
    }
}

export default class ClipboardHistoryExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._clipboard = St.Clipboard.get_default();
        this._model = new HistoryModel({
            historySize: HistoryModel_clamp(this._settings, 'history-size', 1, 100, 30),
            itemBytesMax: HistoryModel_clamp(this._settings, 'item-bytes-max', 1024, 524288, 51200),
            totalBytesMax: HistoryModel_clamp(this._settings, 'total-bytes-max', 65536, 8388608, 1048576),
            pinnedMax: HistoryModel_clamp(this._settings, 'pinned-max', 1, 30, 10),
        });
        this._store = new HistoryStore({ dirPath: `${GLib.get_user_cache_dir()}/${this.uuid}` });
        this._indicator = new ClipboardHistoryIndicator({
            settings: this._settings,
            clipboard: this._clipboard,
            model: this._model,
            store: this._store,
            uuid: this.uuid,
        });
        this._indicator._openPreferences = () => this.openPreferences();
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Capture generation locals: a rapid disable() nulls the fields
        // below, so late load callbacks must not dereference them.
        const generationStore = this._store;
        const generationModel = this._model;
        const generationIndicator = this._indicator;
        generationStore.load().then(({ entries, recovered }) => {
            if (this._store !== generationStore || generationIndicator.destroyed)
                return;
            generationModel.load(entries);
            generationIndicator.finishLoad(recovered);
            // Enforce caps on load (settings may have shrunk since last run).
            generationStore.scheduleSave(generationModel.serialize());
        }).catch(() => {
            if (this._store === generationStore && !generationIndicator.destroyed)
                generationIndicator.failLoad();
        });

        this._toggleId = 'toggle-menu';
        Main.wm.addKeybinding(
            this._toggleId,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._indicator.menu.toggle());
    }

    // Synchronous by Shell 51 requirement: no async work, no pending
    // callbacks left behind. Final persist is one bounded atomic replace.
    disable() {
        Main.wm.removeKeybinding(this._toggleId);
        this._toggleId = null;
        if (this._store) {
            this._store.flushSync();
            this._store.destroy();
            this._store = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._model = null;
        this._clipboard = null;
        this._settings = null;
    }
}
