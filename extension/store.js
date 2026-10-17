import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/*
 * Async local persistence for clipboard history.
 * Single JSON file under the user cache dir, written with atomic
 * replace. Coalesced: at most one write in flight, trailing-edge
 * flush. Never logs entry content — errors carry counts only.
 */

export const REGISTRY_FILENAME = 'history.json';
export const BACKUP_FILENAME = 'history.json.bak';

export class HistoryStore {
    constructor({ dirPath, file, writeDelayMs = 400 } = {}) {
        this._dirPath = dirPath ?? `${GLib.get_user_cache_dir()}/clipboard-history@local`;
        this._file = file ?? Gio.File.new_for_path(`${this._dirPath}/${REGISTRY_FILENAME}`);
        this._backupFile = this._file.get_parent().get_child(BACKUP_FILENAME);
        this._writeDelayMs = writeDelayMs;
        this._pendingText = null;
        this._latestText = null;
        this._writeInFlight = false;
        this._writeCancellable = null;
        this._flushSourceId = 0;
        this._destroyed = false;
        try {
            this._ensureDir();
        } catch (e) {
            console.error('clipboard-history: failed to create history dir');
        }
    }

    get path() {
        return this._file.get_path();
    }

    scheduleSave(serializedEntries) {
        if (this._destroyed)
            return;
        let json;
        try {
            json = JSON.stringify(serializedEntries);
        } catch (e) {
            console.error('clipboard-history: failed to serialize history');
            return;
        }
        this._pendingText = json;
        if (this._writeInFlight || this._flushSourceId !== 0)
            return;
        this._flushSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, this._writeDelayMs, () => {
                this._flushSourceId = 0;
                this._flush();
                return GLib.SOURCE_REMOVE;
            });
    }

    // Best-effort synchronous flush for disable(): cancels any in-flight
    // async write first so it cannot finish last with stale content, then
    // performs one bounded atomic replace. Payload is already bounded
    // (<= totalBytesMax + JSON overhead), so this cannot stall the shell.
    flushSync() {
        if (this._flushSourceId !== 0) {
            GLib.source_remove(this._flushSourceId);
            this._flushSourceId = 0;
        }
        this._cancelInFlight();
        const text = this._pendingText ?? this._latestText;
        this._pendingText = null;
        if (text !== null)
            this._writeNow(text);
    }

    _cancelInFlight() {
        if (this._writeCancellable) {
            this._writeCancellable.cancel();
            this._writeCancellable = null;
        }
        this._writeInFlight = false;
    }

    _flush() {
        if (this._destroyed || this._pendingText === null)
            return;
        if (this._writeInFlight) {
            // Completion of the in-flight write re-flushes pending text.
            return;
        }
        const text = this._pendingText;
        this._pendingText = null;
        this._latestText = text;
        this._writeAsync(text);
    }

    _ensureDir() {
        try {
            Gio.File.new_for_path(this._dirPath).make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                throw e;
        }
    }

    _writeNow(text) {
        try {
            const tmp = this._file.get_parent().get_child(`${REGISTRY_FILENAME}.tmp`);
            tmp.replace_contents(text, null, false, Gio.FileCreateFlags.NONE, null);
            tmp.move(this._file, Gio.FileCopyFlags.OVERWRITE, null, null);
        } catch (e) {
            console.error('clipboard-history: failed to persist history');
        }
    }

    _writeAsync(text) {
        this._cancelInFlight();
        this._writeInFlight = true;
        const cancellable = new Gio.Cancellable();
        this._writeCancellable = cancellable;
        this._file.replace_async(null, false, Gio.FileCreateFlags.NONE,
            GLib.PRIORITY_DEFAULT, cancellable, (file, res) => {
                if (cancellable.is_cancelled()) {
                    this._finishAsyncWrite(cancellable, false);
                    return;
                }
                try {
                    const stream = file.replace_finish(res);
                    const bytes = new GLib.Bytes(text);
                    stream.write_bytes_async(bytes, GLib.PRIORITY_DEFAULT, cancellable, (s, wres) => {
                        let ok = true;
                        try {
                            s.write_bytes_finish(wres);
                            s.close(null);
                        } catch (e) {
                            ok = false;
                            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                                console.error('clipboard-history: failed to persist history');
                        } finally {
                            this._finishAsyncWrite(cancellable, ok);
                        }
                    });
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.error('clipboard-history: failed to persist history');
                    this._finishAsyncWrite(cancellable, false);
                }
            });
    }

    _finishAsyncWrite(cancellable, _ok) {
        if (this._writeCancellable !== cancellable)
            return;
        this._writeCancellable = null;
        this._writeInFlight = false;
        if (this._destroyed)
            return;
        // Newer text arrived while this write was in flight: flush it so
        // the file never ends up holding stale content.
        if (this._pendingText !== null)
            this._flush();
    }

    /*
     * Loads persisted entries. Resolves with {entries, recovered} where
     * recovered is true when a corrupt file was backed up and history
     * was reset. Rejects only on unexpected I/O failure.
     */
    async load() {
        const bytes = await this._readBytes(this._file);
        if (bytes === null)
            return { entries: [], recovered: false };
        let parsed;
        try {
            parsed = JSON.parse(new TextDecoder().decode(bytes));
        } catch (e) {
            await this._backupCorrupt();
            return { entries: [], recovered: true };
        }
        if (!Array.isArray(parsed)) {
            await this._backupCorrupt();
            return { entries: [], recovered: true };
        }
        return { entries: parsed, recovered: false };
    }

    _readBytes(file) {
        return new Promise(resolve => {
            file.load_contents_async(null, (f, res) => {
                try {
                    const [ok, contents] = f.load_contents_finish(res);
                    resolve(ok ? contents : null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
    }

    async _backupCorrupt() {
        try {
            if (this._file.query_exists(null))
                this._file.move(this._backupFile, Gio.FileCopyFlags.OVERWRITE, null, null);
        } catch (e) {
            console.error('clipboard-history: failed to back up corrupt history');
        }
    }

    async clearFile() {
        this._cancelInFlight();
        this._pendingText = null;
        this._latestText = null;
        try {
            if (this._file.query_exists(null))
                this._file.delete(null);
        } catch (e) {
            console.error('clipboard-history: failed to delete history file');
        }
    }

    destroy() {
        this._destroyed = true;
        this._cancelInFlight();
        if (this._flushSourceId !== 0) {
            GLib.source_remove(this._flushSourceId);
            this._flushSourceId = 0;
        }
        this._pendingText = null;
    }
}
