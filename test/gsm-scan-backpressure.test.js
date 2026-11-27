/* eslint-disable no-underscore-dangle */
import {afterEach, expect, test, vi} from 'vitest';
import {deferPromise} from '../ext/js/core/utilities.js';
import {TextScanner} from '../ext/js/language/text-scanner.js';

afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});
const cancelMethods = /** @type {const} */ (['clearMousePosition', 'clearSelection']);

function setup() {
    const scanner = new TextScanner(/** @type {import('text-scanner').ConstructorDetails} */ ({}));
    /** @type {number[]} */
    const positions = [];
    /** @type {(() => void)[]} */
    const pending = [];
    scanner._textSourceGenerator = /** @type {any} */ ({getRangeFromPoint: (/** @type {number} */ x) => ({x, cleanup() {}})});
    scanner._search = vi.fn(async (source) => {
        positions.push(source.x);
        await new Promise((resolve) => pending.push(() => resolve(void 0)));
    });
    scanner._isGsmMagpiePopupMouseSuppressed = () => false;
    const input = /** @type {import('text-scanner').InputInfo} */ ({input: null, eventType: 'mouseMove', pointerType: 'mouse', passive: false});
    return {scanner, positions, pending, input};
}

test('finishes the current scan then looks up only the latest pointer position', async () => {
    const {scanner, positions, pending, input} = setup();
    const first = scanner._searchAtFromMouseMove(1, 0, input);
    await scanner._searchAtFromMouseMove(2, 0, input);
    await scanner._searchAtFromMouseMove(3, 0, input);
    expect(positions).toEqual([1]);
    pending.shift()?.(); await first;
    expect(positions).toEqual([1, 3]);
    pending.shift()?.();
});

test.each(cancelMethods)('%s cancels a queued pointer scan', async (method) => {
    const {scanner, positions, pending, input} = setup();
    const first = scanner._searchAtFromMouseMove(1, 0, input);
    await scanner._searchAtFromMouseMove(2, 0, input);
    scanner[method](); pending.shift()?.(); await first;
    expect(positions).toEqual([1]);
});

test('zero hover delay does not wait for a clamped browser timer', async () => {
    vi.useFakeTimers();
    const {scanner, positions, pending, input} = setup();
    const first = scanner._searchAtFromMouseMove(1, 0, {...input, passive: true});
    expect(positions).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
    pending.shift()?.(); await first;
});

test('configured hover dwell still cancels when the pointer leaves', async () => {
    vi.useFakeTimers();
    const {scanner, positions, input} = setup(); scanner._delay = 100;
    const scan = scanner._searchAtFromMouseMove(1, 0, {...input, passive: true});
    expect(positions).toEqual([]);
    scanner._onMouseOut(); await scan;
    await vi.advanceTimersByTimeAsync(100);
    expect(positions).toEqual([]);
});

test('leaving during the asynchronous popup hit test never starts a stale engine lookup', async () => {
    const {scanner, positions, input} = setup();
    /** @type {import('core').DeferredPromiseDetails<boolean>} */
    const ignored = deferPromise();
    scanner._ignorePoint = () => ignored.promise;
    const scan = scanner._searchAtFromMouseMove(1, 0, input);
    scanner._onMouseOut(); ignored.resolve(false); await scan;
    expect(positions).toEqual([]);
});

test('Magpie capture cancels queued popup coordinates', async () => {
    const {scanner, positions, pending, input} = setup();
    const top = {}; vi.stubGlobal('window', {top});
    const first = scanner._searchAtFromMouseMove(1, 0, input);
    await scanner._searchAtFromMouseMove(2, 0, input);
    scanner._onGsmMagpiePointerState(/** @type {any} */ ({source: top, data: {type: 'gsm-magpie-pointer-state', captured: true}}));
    pending.shift()?.(); await first;
    expect(positions).toEqual([1]);
});

test('disabling scanning cancels a pending dwell timer', async () => {
    vi.useFakeTimers();
    const {scanner, positions, input} = setup(); scanner._delay = 100;
    const scan = scanner._searchAtFromMouseMove(1, 0, {...input, passive: true});
    scanner.setEnabled(false); await scan;
    await vi.advanceTimersByTimeAsync(100);
    expect(positions).toEqual([]);
});

test.each(cancelMethods)('%s prevents an unfinished lookup from repainting', async (method) => {
    const scanner = new TextScanner(/** @type {import('text-scanner').ConstructorDetails} */ ({}));
    /** @type {import('core').DeferredPromiseDetails<import('text-scanner').SearchResults>} */
    const found = deferPromise();
    scanner._getSearchContext = () => ({optionsContext: {depth: 0, url: 'file:///test'}, detail: {documentTitle: 'test'}});
    scanner._findDictionaryEntries = () => found.promise;
    const success = vi.fn(); scanner.on('searchSuccess', success);
    const scan = scanner._search(/** @type {any} */ ({}), true, false,
        /** @type {any} */ ({eventType: 'mouseMove', pointerType: 'mouse', modifierKeys: []}));
    scanner[method]();
    found.resolve({dictionaryEntries: [], sentence: {text: '', offset: 0}, type: 'terms'});
    await scan;
    expect(success).not.toHaveBeenCalled();
    expect(scanner.getCurrentTextSource()).toBeNull();
});
/* eslint-enable no-underscore-dangle */
