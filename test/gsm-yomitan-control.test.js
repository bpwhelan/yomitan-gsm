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

import {describe, expect, test, vi} from 'vitest';
import {Frontend} from '../ext/js/app/frontend.js';
import {TextSourceRange} from '../ext/js/dom/text-source-range.js';
import {TextScanner} from '../ext/js/language/text-scanner.js';

describe('GSM Yomitan control hooks', () => {
    test('TextScanner.searchAtPoint uses the mouse click lookup path', async () => {
        const inputDetail = {restoreSelection: true};
        const inputInfo = {pointerType: 'mouse', eventType: 'click'};
        const createInputInfo = vi.fn(() => inputInfo);
        const searchAt = vi.fn(async () => {});
        const scanner = {
            _createInputInfo: createInputInfo,
            _searchAt: searchAt,
        };

        await TextScanner.prototype.searchAtPoint.call(scanner, 123, 456, inputDetail);

        expect(createInputInfo).toHaveBeenCalledWith(null, 'mouse', 'click', false, [], [], inputDetail);
        expect(searchAt).toHaveBeenCalledWith(123, 456, inputInfo);
    });

    test('TextScanner.searchAtTextSource bypasses coordinate hit testing', async () => {
        const textSource = {};
        const inputDetail = {restoreSelection: true};
        const inputInfo = {pointerType: 'mouse', eventType: 'click'};
        const createInputInfo = vi.fn(() => inputInfo);
        const search = vi.fn(async () => {});
        const scanner = {
            _createInputInfo: createInputInfo,
            _searchTerms: true,
            _searchKanji: true,
            _search: search,
            _scanTimerClear: vi.fn(),
        };

        await TextScanner.prototype.searchAtTextSource.call(scanner, textSource, inputDetail);

        expect(createInputInfo).toHaveBeenCalledWith(null, 'mouse', 'click', false, [], [], inputDetail);
        expect(search).toHaveBeenCalledWith(textSource, true, true, inputInfo);
    });

    test('Frontend routes lookup-point control messages to TextScanner', () => {
        const triggerLookup = vi.fn();
        const clearSelection = vi.fn();
        const frontend = {
            _triggerGsmLookup: triggerLookup,
            _clearSelection: clearSelection,
        };

        Frontend.prototype._onGsmPostMessage.call(frontend, {
            data: {
                type: 'gsm-yomitan-control',
                action: 'lookup-point',
                targetId: 'lookup-7',
                x: 25,
                y: 50,
            },
        });

        expect(triggerLookup).toHaveBeenCalledWith('lookup-7', 25, 50);
        expect(clearSelection).not.toHaveBeenCalled();
    });

    test('Frontend honors GSM scan-disabled regions on web pages', async () => {
        const textScanner = {
            searchLast: vi.fn(async () => {}),
            setOptions: vi.fn(),
        };
        const frontend = {
            _application: {
                api: {
                    optionsGet: vi.fn(async () => ({
                        general: {language: 'ja'},
                        inputs: {hotkeys: []},
                        scanning: {
                            inputs: [],
                            deepDomScan: false,
                            normalizeCssZoom: false,
                            selectText: false,
                            delay: 0,
                            length: 10,
                            layoutAwareScan: false,
                            preventMiddleMouse: {onTextHover: false},
                            preventBackForward: {onTextHover: false},
                            scanWithoutMousemove: false,
                            scanResolution: 0,
                        },
                        sentenceParsing: {},
                    })),
                },
            },
            _getOptionsContext: vi.fn(async () => ({})),
            _getPreventSecondaryMouseValueForPageType: vi.fn(() => false),
            _hotkeyHandler: {setHotkeys: vi.fn()},
            _pageType: 'web',
            _textScanner: textScanner,
            _updateContentScale: vi.fn(),
            _updatePopup: vi.fn(async () => {}),
            _updateTextScannerEnabled: vi.fn(),
        };

        await Frontend.prototype._updateOptionsInternal.call(frontend);

        expect(textScanner.excludeSelector).toBe(
            '[data-gsm-yomitan-scan-disable],[data-gsm-yomitan-scan-disable] *',
        );
    });

    test('Frontend creates a text source from the marked lookup target', () => {
        const textNode = {nodeType: 3, nodeValue: '猫', childNodes: []};
        const targetElement = {
            nodeType: 1,
            childNodes: [textNode],
            getAttribute: vi.fn(() => 'lookup-7'),
            removeAttribute: vi.fn(),
        };
        const range = {setStart: vi.fn(), collapse: vi.fn()};
        const textSource = {};
        const createRange = vi.spyOn(TextSourceRange, 'create').mockReturnValue(textSource);
        vi.stubGlobal('document', {
            querySelectorAll: vi.fn(() => [targetElement]),
            createRange: vi.fn(() => range),
        });
        vi.stubGlobal('Node', {TEXT_NODE: 3});

        const frontend = {
            _findFirstGsmLookupTextNode: Frontend.prototype._findFirstGsmLookupTextNode,
        };
        const result = Frontend.prototype._createGsmLookupTextSource.call(frontend, 'lookup-7');

        expect(range.setStart).toHaveBeenCalledWith(textNode, 0);
        expect(range.collapse).toHaveBeenCalledWith(true);
        expect(createRange).toHaveBeenCalledWith(range);
        expect(targetElement.removeAttribute).toHaveBeenCalledWith('data-gsm-yomitan-lookup-target');
        expect(result).toBe(textSource);
        vi.unstubAllGlobals();
    });

    test('Frontend prefers the marked target over coordinate lookup', async () => {
        const textSource = {};
        const searchAtTextSource = vi.fn(async () => {});
        const searchAtPoint = vi.fn(async () => {});
        const frontend = {
            _gsmLookupSequence: 0,
            _stopClearSelectionDelayed: vi.fn(),
            _createGsmLookupTextSource: vi.fn(() => textSource),
            _textScanner: {searchAtTextSource, searchAtPoint},
        };

        await Frontend.prototype._triggerGsmLookup.call(frontend, 'lookup-7', 25, 50);

        expect(searchAtTextSource).toHaveBeenCalledWith(textSource, {gsmLookupId: 1});
        expect(searchAtPoint).not.toHaveBeenCalled();
    });

    test('Frontend falls back to coordinates when no marked target exists', async () => {
        const searchAtTextSource = vi.fn(async () => {});
        const searchAtPoint = vi.fn(async () => {});
        const frontend = {
            _gsmLookupSequence: 0,
            _stopClearSelectionDelayed: vi.fn(),
            _createGsmLookupTextSource: vi.fn(() => null),
            _textScanner: {searchAtTextSource, searchAtPoint},
        };

        await Frontend.prototype._triggerGsmLookup.call(frontend, 'missing', 25, 50);

        expect(searchAtTextSource).not.toHaveBeenCalled();
        expect(searchAtPoint).toHaveBeenCalledWith(25, 50, {gsmLookupId: 1});
    });

    test('Frontend ignores stale empty results from an older lookup', () => {
        const clearSelectionDelayed = vi.fn();
        const frontend = {
            _gsmLookupSequence: 2,
            _isCurrentGsmLookup: Frontend.prototype._isCurrentGsmLookup,
            _options: {scanning: {autoHideResults: true, hideDelay: 100}},
            _clearSelectionDelayed: clearSelectionDelayed,
        };

        Frontend.prototype._onSearchEmpty.call(frontend, {
            inputInfo: {detail: {gsmLookupId: 1}},
        });
        expect(clearSelectionDelayed).not.toHaveBeenCalled();

        Frontend.prototype._onSearchEmpty.call(frontend, {
            inputInfo: {detail: {gsmLookupId: 2}},
        });
        expect(clearSelectionDelayed).toHaveBeenCalledWith(100, false, false);
    });

    test('Frontend does not auto-hide on popup pointer-out during gamepad navigation', () => {
        vi.stubGlobal('window', {gsmGamepadNavigationActive: true});
        const clearSelectionDelayed = vi.fn();
        const frontend = {
            _isPointerOverPopup: true,
            _isGsmGamepadNavigationActive: Frontend.prototype._isGsmGamepadNavigationActive,
            _options: {scanning: {hidePopupOnCursorExit: true, hidePopupOnCursorExitDelay: 100}},
            _clearSelectionDelayed: clearSelectionDelayed,
        };

        try {
            Frontend.prototype._onPopupFramePointerOut.call(frontend);
        } finally {
            vi.unstubAllGlobals();
        }

        expect(frontend._isPointerOverPopup).toBe(false);
        expect(clearSelectionDelayed).not.toHaveBeenCalled();
    });

    test('Frontend forwards gamepad navigation state to popup contexts', () => {
        const clearSelection = vi.fn();
        const frontend = {
            _gsmGamepadNavigationActive: false,
            _clearSelection: clearSelection,
        };

        Frontend.prototype._onGsmPostMessage.call(frontend, {
            data: {type: 'gsm-gamepad-navigation-active', active: true},
        });
        expect(Frontend.prototype._isGsmGamepadNavigationActive.call(frontend)).toBe(true);
        expect(clearSelection).not.toHaveBeenCalled();

        Frontend.prototype._onGsmPostMessage.call(frontend, {
            data: {type: 'gsm-gamepad-navigation-active', active: false},
        });
        expect(Frontend.prototype._isGsmGamepadNavigationActive.call(frontend)).toBe(false);
        expect(clearSelection).toHaveBeenCalledWith(false);
    });

    test('Frontend cancels a delayed clear while it is waiting to schedule', async () => {
        vi.useFakeTimers();
        const clearSelection = vi.fn();
        const frontend = {
            _textScanner: {hasSelection: () => true},
            _clearSelectionTimer: null,
            _clearSelectionDelayToken: 0,
            _clearSelection: clearSelection,
            _isPointerOverAnyPopup: vi.fn(async () => false),
        };

        try {
            const pendingClear = Frontend.prototype._clearSelectionDelayed.call(frontend, 0, false, false);
            Frontend.prototype._stopClearSelectionDelayed.call(frontend);
            await vi.advanceTimersByTimeAsync(50);
            await pendingClear;
        } finally {
            vi.useRealTimers();
        }

        expect(clearSelection).not.toHaveBeenCalled();
    });

    test('Frontend ignores invalid lookup-point coordinates', async () => {
        const searchAtPoint = vi.fn(async () => {});
        const frontend = {
            _createGsmLookupTextSource: vi.fn(() => null),
            _stopClearSelectionDelayed: vi.fn(),
            _textScanner: {searchAtPoint},
        };

        await Frontend.prototype._triggerGsmLookup.call(frontend, null, '25', 50);
        await Frontend.prototype._triggerGsmLookup.call(frontend, null, 25, Number.NaN);

        expect(searchAtPoint).not.toHaveBeenCalled();
    });
});

/* eslint-enable no-underscore-dangle, @typescript-eslint/unbound-method */
