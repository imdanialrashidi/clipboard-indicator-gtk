#!/usr/bin/env -S gjs -m
/*
 * Deterministic contract tests for history.js (pure logic, no Shell).
 * Run: gjs -m tests/test-history.js
 * Fails with a non-zero exit and a FAILED line on any violation.
 */
import { HistoryEntry, HistoryModel } from '../extension/history.js';

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

function texts(model) {
    return model.ordered().map(e => e.text);
}

// --- duplicates move to top, keep pin state, never duplicate rows ---
{
    const m = new HistoryModel();
    m.add('alpha');
    m.add('beta');
    const pinned = m.add('gamma');
    m.pin(pinned);
    m.add('alpha');
    check('dup moves to top', texts(m), ['alpha', 'gamma', 'beta']);
    check('dup keeps pin', m.ordered()[1].pinned, true);
    check('no duplicate rows', m.entries.length, 3);
}

// --- empty / non-string adds are ignored ---
{
    const m = new HistoryModel();
    check('empty add returns null', m.add(''), null);
    check('non-string add returns null', m.add(null), null);
    check('empty model stays empty', m.entries.length, 0);
}

// --- regression: over-cap duplicates dedupe on stored form ---
{
    const m = new HistoryModel({ itemBytesMax: 1024 });
    const big = 'x'.repeat(2000);
    m.add(big);
    m.add('other');
    const dup = m.add(big);
    check('over-cap dup single row', m.entries.length, 2);
    check('over-cap dup moves to top', m.ordered()[0].text, 'x'.repeat(1024));
    check('over-cap dup flagged truncated', dup.truncated, true);
}

// --- count bound evicts oldest unpinned first, pinned survive ---
{
    const m = new HistoryModel({ historySize: 3 });
    m.add('one');
    m.add('two');
    const p = m.add('three');
    m.pin(p);
    m.add('four');
    m.add('five');
    check('count bound keeps pinned', texts(m), ['five', 'four', 'three']);
    check('pinned survives eviction', m.ordered()[2].pinned, true);
}

// --- per-item byte cap: truncation flag, char-boundary safety ---
// (caps below schema minimum are clamped; tests use in-range values)
{
    const m = new HistoryModel({ itemBytesMax: 1024 });
    // 500 × 2-byte é = 1000 bytes, plus 20 more é = 1040 -> truncate to 1024 bytes = 512 chars.
    const e = m.add('é'.repeat(520));
    check('truncated flag set', e.truncated, true);
    check('truncated byte size fits', HistoryModel.sizeOf(e.text) <= 1024, true);
    check('truncated char boundary', e.text, 'é'.repeat(512));
    const short = m.add('abc');
    check('short entry not truncated', short.truncated, false);
    // 4-byte emoji must never split: 1025-byte cap holds 256 emoji (1024 bytes).
    const m2 = new HistoryModel({ itemBytesMax: 1025 });
    const emo = m2.add('😀'.repeat(257));
    check('emoji byte size fits', HistoryModel.sizeOf(emo.text) <= 1025, true);
    check('emoji not split', [...emo.text].length, 256);
}
// --- total byte budget evicts oldest unpinned ---
{
    const m = new HistoryModel({ historySize: 100, itemBytesMax: 40000, totalBytesMax: 65536 });
    m.add('a'.repeat(30000)); // 30000
    m.add('b'.repeat(30000)); // 60000
    m.add('c'.repeat(30000)); // would be 90000, evicts oldest
    check('total budget enforced', m.totalBytes() <= 65536, true);
    check('total budget evicts oldest', texts(m), ['c'.repeat(30000), 'b'.repeat(30000)]);
}

// --- pin cap refuses with state unchanged ---
{
    const m = new HistoryModel({ pinnedMax: 2 });
    const a = m.add('a');
    const b = m.add('b');
    const c = m.add('c');
    check('pin 1 ok', m.pin(a), true);
    check('pin 2 ok', m.pin(b), true);
    check('pin 3 refused', m.pin(c), false);
    check('refused pin unchanged', c.pinned, false);
    check('pinned count at cap', m.pinnedCount(), 2);
    // Re-pinning an already-pinned entry is a no-op success.
    check('repin ok', m.pin(a), true);
}

// --- clear keeps pinned ---
{
    const m = new HistoryModel();
    m.add('x');
    const p = m.add('y');
    m.pin(p);
    const removed = m.clear();
    check('clear removes only unpinned', removed, 1);
    check('clear keeps pinned', texts(m), ['y']);
}

// --- search: case-insensitive substring, empty restores order ---
{
    const m = new HistoryModel();
    m.add('git commit -m fix');
    m.add('Buy MILK');
    m.add('https://example.com');
    check('search case-insensitive', m.search('milk').map(e => e.text), ['Buy MILK']);
    check('search substring', m.search('commit').map(e => e.text), ['git commit -m fix']);
    check('search empty restores order', texts({ ordered: () => m.search('') }), ['https://example.com', 'Buy MILK', 'git commit -m fix']);
    check('search no match', m.search('zzz').length, 0);
}

// --- serialization round-trip preserves pin/truncated/order ---
{
    const m = new HistoryModel({ itemBytesMax: 4 });
    m.add('abcd');
    m.pin(m.ordered()[0]);
    const m2 = new HistoryModel();
    m2.load(m.serialize());
    check('round-trip order', texts(m2), texts(m));
    check('round-trip pin', m2.ordered()[0].pinned, true);
    // Corrupt rows are dropped, never crash.
    const m3 = new HistoryModel();
    m3.load([{ nope: 1 }, null, { text: 'fine' }]);
    check('corrupt rows dropped', texts(m3), ['fine']);
}

// --- boundary: exactly-at-cap entry is kept whole ---
{
    const m = new HistoryModel({ itemBytesMax: 4 });
    const e = m.add('abcd');
    check('at-cap not truncated', e.truncated, false);
    check('at-cap text intact', e.text, 'abcd');
}

if (failures > 0) {
    printerr(`${failures} FAILURE(S)`);
    throw new Error('test-history failed');
}
print('ALL HISTORY TESTS PASSED');
