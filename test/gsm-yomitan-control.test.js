/*
 * Copyright (C) 2023-2025  Yomitan Authors
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

import {describe, expect, test, vi} from 'vitest';
import {Frontend} from '../ext/js/app/frontend.js';
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

    test('Frontend routes lookup-point control messages to TextScanner', () => {
        const triggerLookup = vi.fn();
        const clearSelection = vi.fn();
        const frontend = {
            _triggerGsmLookupAtPoint: triggerLookup,
            _clearSelection: clearSelection,
        };

        Frontend.prototype._onGsmPostMessage.call(frontend, {
            data: {
                type: 'gsm-yomitan-control',
                action: 'lookup-point',
                x: 25,
                y: 50,
            },
        });

        expect(triggerLookup).toHaveBeenCalledWith(25, 50);
        expect(clearSelection).not.toHaveBeenCalled();
    });

    test('Frontend ignores invalid lookup-point coordinates', async () => {
        const searchAtPoint = vi.fn(async () => {});
        const frontend = {
            _textScanner: {searchAtPoint},
        };

        await Frontend.prototype._triggerGsmLookupAtPoint.call(frontend, '25', 50);
        await Frontend.prototype._triggerGsmLookupAtPoint.call(frontend, 25, Number.NaN);

        expect(searchAtPoint).not.toHaveBeenCalled();
    });
});
