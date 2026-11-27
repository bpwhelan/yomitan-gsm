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

/* eslint-disable no-underscore-dangle, @typescript-eslint/unbound-method */
import {afterEach, describe, expect, test, vi} from 'vitest';
import {TextScanner} from '../ext/js/language/text-scanner.js';

afterEach(() => vi.unstubAllGlobals());

const setup = (captured = true, popup = true) => {
    const top = {};
    vi.stubGlobal('window', popup ? {top} : top);
    if (!popup) {
        vi.stubGlobal('window', {get top() { return this; }});
    }
    vi.stubGlobal('navigator', {userAgent: 'Electron/43.8.1'});
    const scanner = {
        _gsmMagpiePopupMouseCaptured: captured,
        _searchRevision: 0,
        _delay: 20,
        clearMousePosition: TextScanner.prototype.clearMousePosition,
        _isGsmGamepadNavigationActive: TextScanner.prototype._isGsmGamepadNavigationActive,
        _isGsmMagpiePopupMouseSuppressed: TextScanner.prototype._isGsmMagpiePopupMouseSuppressed,
        _onMousePointerMove: TextScanner.prototype._onMousePointerMove,
        _scanTimerClear: vi.fn(),
        _getMatchingInputGroupFromEvent: vi.fn(() => ({})),
        _searchAtFromMouseMove: vi.fn(),
        _searchAt: vi.fn(),
        _scanTimerWait: async () => true,
    };
    const setCaptured = (value = false) => TextScanner.prototype._onGsmMagpiePointerState.call(
        scanner,
        {source: window.top, data: {type: 'gsm-magpie-pointer-state', captured: value}},
    );
    return {scanner, setCaptured};
};

describe('Magpie popup mouse coordinates', () => {
    test('a raw source-space move inside a popup cannot start a second lookup', () => {
        const {scanner} = setup();
        scanner._onMousePointerMove({clientX: 10, clientY: 20});
        expect(scanner._searchAtFromMouseMove).not.toHaveBeenCalled();
    });

    test('popup scanning resumes as soon as Magpie hands off the real cursor', () => {
        const {scanner, setCaptured} = setup();
        scanner._onMousePointerMove({clientX: 10, clientY: 20});
        setCaptured(false);
        scanner._onMousePointerMove({clientX: 100, clientY: 200});
        expect(scanner._searchAtFromMouseMove).toHaveBeenCalledExactlyOnceWith(100, 200, {});
    });

    test('the root scanner still accepts the projected stream', () => {
        const {scanner} = setup(true, false);
        scanner._onMousePointerMove({clientX: 100, clientY: 200});
        expect(scanner._searchAtFromMouseMove).toHaveBeenCalledExactlyOnceWith(100, 200, {});
    });

    test('a delayed popup scan rechecks capture before looking up text', async () => {
        const {scanner, setCaptured} = setup(false);
        scanner._searchAt = vi.fn();
        scanner._scanTimerWait = async () => {
            setCaptured(true);
            return true;
        };
        await TextScanner.prototype._searchAtFromMouseMove.call(scanner, 10, 20, {passive: true});
        expect(scanner._searchAt).not.toHaveBeenCalled();
    });

    test('ordinary browser frames without GSM retain mouse scanning', () => {
        const {scanner} = setup();
        scanner._gsmMagpiePopupMouseCaptured = null;
        vi.stubGlobal('navigator', {userAgent: 'Chrome/143'});
        scanner._onMousePointerMove({clientX: 10, clientY: 20});
        expect(scanner._searchAtFromMouseMove).toHaveBeenCalledExactlyOnceWith(10, 20, {});
    });

    test('a new Electron popup waits for the root handshake and ignores unrelated frames', () => {
        const {scanner, setCaptured} = setup();
        scanner._gsmMagpiePopupMouseCaptured = null;
        scanner._onMousePointerMove({clientX: 10, clientY: 20});
        TextScanner.prototype._onGsmMagpiePointerState.call(
            scanner,
            {source: {}, data: {type: 'gsm-magpie-pointer-state', captured: false}},
        );
        scanner._onMousePointerMove({clientX: 10, clientY: 20});
        expect(scanner._searchAtFromMouseMove).not.toHaveBeenCalled();
        setCaptured(false);
        scanner._onMousePointerMove({clientX: 10, clientY: 20});
        expect(scanner._searchAtFromMouseMove).toHaveBeenCalledExactlyOnceWith(10, 20, {});
    });
});

/* eslint-enable no-underscore-dangle, @typescript-eslint/unbound-method */
