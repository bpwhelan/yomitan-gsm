/*
 * Copyright (C) 2023-2026  Yomitan Authors
 * Copyright (C) 2016-2022  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* eslint-disable no-underscore-dangle */
import {afterEach, expect, test, vi} from 'vitest';
import {deferPromise} from '../ext/js/core/utilities.js';
import {TextScanner} from '../ext/js/language/text-scanner.js';
import {ThemeController} from '../ext/js/app/theme-controller.js';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/**
 * @returns {{scanner: TextScanner, input: import('text-scanner').InputInfo,
 * dataset: {gsmGamepadNavigationActive: string}, empty: import('vitest').Mock,
 * activate: () => void}} The scanner, shared navigation state, and lookup observers.
 */
function setup() {
    const dataset = {gsmGamepadNavigationActive: 'false'};
    vi.stubGlobal('document', {documentElement: {dataset}});
    const scanner = new TextScanner(/** @type {import('text-scanner').ConstructorDetails} */ ({}));
    const input = /** @type {import('text-scanner').InputInfo} */ ({input: null, eventType: 'mouseMove', pointerType: 'mouse', passive: false});
    scanner._textSourceGenerator = /** @type {any} */ ({getRangeFromPoint: () => null});
    scanner._getMatchingInputGroupFromEvent = () => input;
    const empty = vi.fn();
    scanner.on('searchEmpty', empty);
    const activate = () => {
        dataset.gsmGamepadNavigationActive = 'true';
        scanner._onGsmGamepadNavigationMessage(/** @type {any} */ ({data: {type: 'gsm-gamepad-navigation-active', active: true}}));
    };
    return {scanner, input, dataset, empty, activate};
}

test('controller lookups are not dismissed by empty physical or forwarded mouse scans', async () => {
    const {scanner, dataset, empty, activate} = setup();
    const move = /** @type {PointerEvent} */ ({clientX: 10, clientY: 20});
    activate();
    scanner._onMousePointerMove(move);
    await Promise.resolve();
    expect(empty).not.toHaveBeenCalled();

    dataset.gsmGamepadNavigationActive = 'false';
    scanner._onGsmGamepadNavigationMessage(/** @type {any} */ ({data: {type: 'gsm-gamepad-navigation-active', active: false}}));
    scanner._onMousePointerMove(move);
    await Promise.resolve();
    expect(empty).toHaveBeenCalledOnce();
});

test('a hover dwell that finishes as navigation activates cannot dismiss its lookup', async () => {
    vi.useFakeTimers();
    const {scanner, input, empty, activate} = setup();
    scanner._delay = 50;
    const pending = scanner._searchAtFromMouseMove(10, 20, {...input, passive: true});
    // The dwell is resolved but its continuation has not run yet.
    vi.advanceTimersByTime(50);
    activate();
    await pending;
    expect(empty).not.toHaveBeenCalled();
});

test('mouse exits during controller navigation do not invalidate a pending direct lookup', async () => {
    const {scanner, activate} = setup();
    activate();
    vi.spyOn(ThemeController.prototype, 'computeSiteTheme').mockReturnValue('light');
    /** @type {import('core').DeferredPromiseDetails<import('text-scanner').SearchResults>} */
    const found = deferPromise();
    scanner._getSearchContext = () => ({optionsContext: {depth: 0, url: 'file:///test'}, detail: {documentTitle: 'test'}});
    scanner._findDictionaryEntries = () => found.promise;
    const success = vi.fn();
    const error = vi.fn();
    scanner.on('searchSuccess', success);
    scanner.on('searchError', error);
    const scan = scanner.searchAtTextSource(/** @type {any} */ ({}), {focus: false, restoreSelection: false});
    scanner._onMouseOut();
    found.resolve({dictionaryEntries: [], sentence: {text: '', offset: 0}, type: 'terms'});
    await scan;
    expect(error).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledOnce();
});
/* eslint-enable no-underscore-dangle */
