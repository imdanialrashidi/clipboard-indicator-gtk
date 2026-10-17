
/*
 * Pure clipboard-history model: no Shell imports, no I/O.
 * All size limits are enforced in UTF-8 bytes (TextEncoder), so caps
 * behave identically regardless of locale or script. Truncation always
 * lands on a character boundary — never splits a code point or an
 * encoded byte sequence.
 */

export const TEXT_MIMETYPE = 'text/plain;charset=utf-8';

export class HistoryEntry {
    constructor(text, { pinned = false, truncated = false } = {}) {
        this.text = text;
        this.pinned = pinned;
        this.truncated = truncated;
        this.addedAt = Date.now();
    }

    bytes() {
        return HistoryModel.sizeOf(this.text);
    }

    toJSON() {
        return {
            text: this.text,
            pinned: this.pinned,
            truncated: this.truncated,
            addedAt: this.addedAt,
        };
    }

    static fromJSON(raw) {
        if (!raw || typeof raw.text !== 'string')
            return null;
        const entry = new HistoryEntry(raw.text, {
            pinned: raw.pinned === true,
            truncated: raw.truncated === true,
        });
        if (Number.isFinite(raw.addedAt))
            entry.addedAt = raw.addedAt;
        return entry;
    }
}

export class HistoryModel {
    constructor({ historySize = 30, itemBytesMax = 51200, totalBytesMax = 1048576, pinnedMax = 10 } = {}) {
        this.historySize = HistoryModel.clampInt(historySize, 1, 100, 30);
        this.itemBytesMax = HistoryModel.clampInt(itemBytesMax, 1024, 524288, 51200);
        this.totalBytesMax = HistoryModel.clampInt(totalBytesMax, 65536, 8388608, 1048576);
        this.pinnedMax = HistoryModel.clampInt(pinnedMax, 1, 30, 10);
        this.entries = [];
    }

    static sizeOf(text) {
        return new TextEncoder().encode(text).length;
    }

    static clampInt(value, min, max, fallback) {
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n))
            return fallback;
        return Math.min(max, Math.max(min, n));
    }

    // Truncate to maxBytes UTF-8 bytes on a code-point boundary.
    // Returns {text, truncated}. Empty maxBytes never happens (clamped >= 1).
    static truncateToBytes(text, maxBytes) {
        const bytes = new TextEncoder().encode(text);
        if (bytes.length <= maxBytes)
            return { text, truncated: false };
        // Binary-search the longest code-point prefix that fits.
        const points = [...text];
        let lo = 0, hi = points.length;
        const encoder = new TextEncoder();
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (encoder.encode(points.slice(0, mid).join('')).length <= maxBytes)
                lo = mid;
            else
                hi = mid - 1;
        }
        return { text: points.slice(0, lo).join(''), truncated: true };
    }

    pinnedCount() {
        return this.entries.filter(e => e.pinned).length;
    }

    totalBytes() {
        return this.entries.reduce((sum, e) => sum + e.bytes(), 0);
    }

    /*
     * Record a clipboard copy. Duplicates are detected on the stored
     * (possibly truncated) form and move to the top keeping their pin
     * state — never two identical rows, even for over-cap copies.
     * Returns the entry, or null when the text is empty.
     */
    add(text) {
        if (typeof text !== 'string' || text.length === 0)
            return null;
        const { text: stored, truncated } = HistoryModel.truncateToBytes(text, this.itemBytesMax);
        const existing = this.entries.findIndex(e => e.text === stored);
        if (existing !== -1) {
            const [entry] = this.entries.splice(existing, 1);
            this.entries.unshift(entry);
            return entry;
        }
        const entry = new HistoryEntry(stored, { truncated });
        this.entries.unshift(entry);
        this._enforceBounds();
        return entry;
    }

    _enforceBounds() {
        // Newest-first list; evict oldest unpinned entries first.
        while (this.entries.length > this.historySize) {
            const idx = this._findEvictableFromEnd();
            if (idx === -1)
                break;
            this.entries.splice(idx, 1);
        }
        while (this.totalBytes() > this.totalBytesMax) {
            const idx = this._findEvictableFromEnd();
            if (idx === -1)
                break;
            this.entries.splice(idx, 1);
        }
    }

    _findEvictableFromEnd() {
        for (let i = this.entries.length - 1; i >= 0; i--) {
            if (!this.entries[i].pinned)
                return i;
        }
        return -1;
    }

    // Returns false when the pin cap is reached (state unchanged).
    pin(entry) {
        if (entry.pinned)
            return true;
        if (this.pinnedCount() >= this.pinnedMax)
            return false;
        entry.pinned = true;
        this._resort();
        return true;
    }

    unpin(entry) {
        entry.pinned = false;
        this._resort();
    }

    // Pinned entries stay grouped at the top, each group newest-first.
    _resort() {
        const pinned = this.entries.filter(e => e.pinned);
        const rest = this.entries.filter(e => !e.pinned);
        this.entries = [...pinned, ...rest];
    }

    remove(entry) {
        const idx = this.entries.indexOf(entry);
        if (idx !== -1)
            this.entries.splice(idx, 1);
    }

    // Clears unpinned entries; pinned entries survive. Returns removed count.
    clear() {
        const before = this.entries.length;
        this.entries = this.entries.filter(e => e.pinned);
        return before - this.entries.length;
    }

    ordered() {
        return [...this.entries];
    }

    // Case-insensitive substring filter; empty query restores full order.
    search(query) {
        if (!query)
            return this.ordered();
        const needle = query.toLocaleLowerCase();
        return this.entries.filter(e => e.text.toLocaleLowerCase().includes(needle));
    }

    load(entries) {
        this.entries = [];
        for (const raw of entries ?? []) {
            const entry = HistoryEntry.fromJSON(raw);
            if (entry !== null)
                this.entries.push(entry);
        }
        this._resort();
        this._enforceBounds();
    }

    serialize() {
        return this.entries.map(e => e.toJSON());
    }
}
