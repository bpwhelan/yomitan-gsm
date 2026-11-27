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
import {TextScanner} from '../ext/js/language/text-scanner.js';

afterEach(() => vi.unstubAllGlobals());

/**
 * @param {boolean} home
 * @returns {TextScanner}
 */
function setup(home = true) {
    vi.stubGlobal('document', {elementFromPoint: () => ({closest: () => (home ? {} : null)})});
    const scanner = new TextScanner(/** @type {import('text-scanner').ConstructorDetails} */ ({}));
    scanner._lastMouseMove = {clientX: 10, clientY: 20};
    scanner._inputs = [{include: ['alt'], exclude: [], types: new Set(['mouse']), searchTerms: true}];
    scanner._areGsmScanModifiersDisabled = () => false;
    scanner._getEffectiveInputModifiers = (event) => ({modifiers: event.shiftKey ? ['shift'] : [], modifierKeys: event.shiftKey ? ['shift'] : []});
    return scanner;
}

test('Home requires Shift even when ordinary hover is configured', () => {
    const scanner = setup();
    scanner._inputs[0].include = [];
    expect(scanner._getMatchingInputGroupFromEvent('mouse', 'mouseMove', {clientX: 10, clientY: 20, buttons: 0})).toBeNull();
});

test('Home Shift overrides a different configured modifier without changing settings', () => {
    const scanner = setup();
    const input = scanner._getMatchingInputGroupFromEvent('mouse', 'mouseMove', {clientX: 10, clientY: 20, buttons: 0, shiftKey: true});
    expect(input).toMatchObject({input: null, passive: false, modifierKeys: ['shift']});
    expect(scanner._inputs[0].include).toEqual(['alt']);
    expect(scanner._modifierKeySet(['shift'])).toBe(true);
    expect(scanner._modifierKeySet(['alt'])).toBe(false);
});

test('Home text selection does not trigger a lookup while dragging', () => {
    const scanner = setup();
    expect(scanner._getMatchingInputGroupFromEvent('mouse', 'mouseMove', {clientX: 10, clientY: 20, buttons: 1, shiftKey: true})).toBeNull();
});

test('stationary Shift works on Home even when keyboard scanning is off elsewhere', () => {
    vi.stubGlobal('PointerEvent', class {});
    const scanner = setup();
    scanner._scanWithoutMousemove = false;
    scanner._inputtingText = () => false;
    scanner._onMousePointerMove = vi.fn();
    scanner._onKeyDown(/** @type {KeyboardEvent} */ ({shiftKey: true}));
    expect(scanner._onMousePointerMove).toHaveBeenCalledOnce();
    const ordinary = setup(false);
    ordinary._scanWithoutMousemove = false;
    ordinary._onMousePointerMove = vi.fn();
    ordinary._onKeyDown(/** @type {KeyboardEvent} */ ({shiftKey: true}));
    expect(ordinary._onMousePointerMove).not.toHaveBeenCalled();
});

test('overlay and other pages retain their configured modifier', () => {
    const scanner = setup(false);
    expect(scanner._getMatchingInputGroupFromEvent('mouse', 'mouseMove', {clientX: 10, clientY: 20, buttons: 0, shiftKey: true})).toBeNull();
    expect(scanner._modifierKeySet(['shift'])).toBe(false);
    expect(scanner._modifierKeySet(['alt'])).toBe(true);
});

test('a configured hover or modifier never scans desktop chrome or an embedded page', () => {
    const scanner = setup(false);
    for (const scope of ['feed', 'disabled']) {
        vi.stubGlobal('document', {documentElement: {dataset: {gsmReaderScope: scope}}, elementFromPoint: () => ({closest: () => null})});
        for (const include of [[], ['shift']]) {
            scanner._inputs[0].include = include;
            expect(scanner._getMatchingInputGroupFromEvent('mouse', 'mouseMove', {clientX: 10, clientY: 20, buttons: 0, shiftKey: true})).toBeNull();
        }
    }
});

/* eslint-enable no-underscore-dangle */
