#!/usr/bin/env -S gjs -m
/*
 * Deterministic contract tests for store.js (Gio persistence).
 * Uses an isolated tmp dir per run; no Shell, no user data touched.
 * Run: gjs -m tests/test-store.js
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { HistoryStore } from '../extension/store.js';

let failures = 0;

function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        print(`ok - ${name}`);
    } else {
        failures++;
        print(`FAILED - ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function makeDir() {
    const path = `${GLib.get_tmp_dir()}/cliphist-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    Gio.File.new_for_path(path).make_directory_with_parents(null);
    return path;
}

function readFile(path) {
    try {
        const [ok, contents] = Gio.File.new_for_path(path).load_contents(null);
        return ok ? new TextDecoder().decode(contents) : null;
    } catch (e) {
        return null;
    }
}

const loop = GLib.MainLoop.new(null, false);
function settle(ms = 900) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

async function main() {
    // --- save + load round-trip ---
    {
        const dir = makeDir();
        const store = new HistoryStore({ dirPath: dir, writeDelayMs: 50 });
        const rows = [
            { text: 'hello', pinned: false, truncated: false, addedAt: 1 },
            { text: 'wörld 😀', pinned: true, truncated: false, addedAt: 2 },
        ];
        store.scheduleSave(rows);
        await settle();
        const raw = readFile(`${dir}/history.json`);
        check('file written', raw !== null, true);
        check('file content round-trips', JSON.parse(raw), rows);
        const { entries, recovered } = await store.load();
        check('load returns rows', entries, rows);
        check('load not recovered', recovered, false);
        store.destroy();
    }

    // --- coalesced: rapid saves collapse to one final write ---
    {
        const dir = makeDir();
        const store = new HistoryStore({ dirPath: dir, writeDelayMs: 100 });
        store.scheduleSave([{ text: 'v1', pinned: false, truncated: false, addedAt: 1 }]);
        store.scheduleSave([{ text: 'v2', pinned: false, truncated: false, addedAt: 2 }]);
        store.scheduleSave([{ text: 'v3', pinned: false, truncated: false, addedAt: 3 }]);
        await settle();
        const raw = readFile(`${dir}/history.json`);
        check('coalesced to latest', JSON.parse(raw).map(r => r.text), ['v3']);
        store.destroy();
    }

    // --- missing file loads empty, not recovered ---
    {
        const dir = makeDir();
        const store = new HistoryStore({ dirPath: dir });
        const { entries, recovered } = await store.load();
        check('missing file empty', entries, []);
        check('missing file not recovered', recovered, false);
        store.destroy();
    }

    // --- corrupt file is backed up once, history resets ---
    {
        const dir = makeDir();
        Gio.File.new_for_path(`${dir}/history.json`)
            .replace_contents('{{{not-json', null, false, Gio.FileCreateFlags.NONE, null);
        const store = new HistoryStore({ dirPath: dir });
        const { entries, recovered } = await store.load();
        check('corrupt resets to empty', entries, []);
        check('corrupt flagged recovered', recovered, true);
        check('corrupt backed up', readFile(`${dir}/history.json.bak`), '{{{not-json');
        // Non-array JSON is equally corrupt.
        Gio.File.new_for_path(`${dir}/history.json`)
            .replace_contents('{"a":1}', null, false, Gio.FileCreateFlags.NONE, null);
        const second = await store.load();
        check('non-array resets', second.entries, []);
        check('non-array flagged recovered', second.recovered, true);
        store.destroy();
    }

    // --- clearFile deletes persisted history ---
    {
        const dir = makeDir();
        const store = new HistoryStore({ dirPath: dir, writeDelayMs: 50 });
        store.scheduleSave([{ text: 'gone', pinned: false, truncated: false, addedAt: 1 }]);
        await settle();
        check('pre-clear exists', readFile(`${dir}/history.json`) !== null, true);
        await store.clearFile();
        check('clear deletes file', readFile(`${dir}/history.json`), null);
        store.destroy();
    }

    // --- flushSync persists pending payload immediately ---
    {
        const dir = makeDir();
        const store = new HistoryStore({ dirPath: dir, writeDelayMs: 60000 });
        store.scheduleSave([{ text: 'sync-me', pinned: false, truncated: false, addedAt: 1 }]);
        store.flushSync();
        const raw = readFile(`${dir}/history.json`);
        check('flushSync writes now', raw !== null && JSON.parse(raw)[0].text === 'sync-me', true);
        store.destroy();
    }

    if (failures > 0) {
        printerr(`${failures} FAILURE(S)`);
        throw new Error('test-store failed');
    }
    print('ALL STORE TESTS PASSED');
    loop.quit();
}

main().catch(e => {
    printerr(`FATAL: ${e.message}`);
    loop.quit();
    throw e;
});
loop.run();
