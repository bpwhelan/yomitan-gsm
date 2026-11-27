/*
 * Copyright (C) 2023-2026  Yomitan Authors
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
import {Backend} from '../ext/js/background/backend.js';
import {DisplayAnki} from '../ext/js/display/display-anki.js';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

test('unsupported browser screenshots never hide the popup while adding a note', async () => {
    vi.stubGlobal('chrome', {tabs: {}});
    vi.stubGlobal('browser', {tabs: {}});
    const backend = {
        _getTabById: async () => ({windowId: 1}),
        _sendMessageTabPromise: vi.fn(async () => 'visibility-token'),
    };
    await expect(Backend.prototype._getScreenshot.call(backend, 1, 0, 'png', 100)).rejects.toThrow();
    expect(backend._sendMessageTabPromise).not.toHaveBeenCalled();
});

test('supported browser screenshots still restore popup visibility', async () => {
    vi.stubGlobal('chrome', {
        runtime: {},
        tabs: {captureVisibleTab: (_windowId, _options, callback) => callback('data:image/png;base64,fixture')},
    });
    const backend = {
        _getTabById: async () => ({windowId: 1}),
        _sendMessageTabPromise: vi.fn(async () => 'visibility-token'),
    };
    expect(await Backend.prototype._getScreenshot.call(backend, 1, 0, 'png', 100)).toBe('data:image/png;base64,fixture');
    expect(backend._sendMessageTabPromise).toHaveBeenCalledTimes(2);
    expect(backend._sendMessageTabPromise).toHaveBeenLastCalledWith(1, {
        action: 'frontendClearAllVisibleOverride', params: {token: 'visibility-token'},
    }, {frameId: 0});
});

test.each([false, true])('mining forwards only a successful save to the overlay: failure=%s', async (failed) => {
    vi.useFakeTimers();
    const dispatchEvent = vi.fn();
    const postMessage = vi.fn();
    vi.stubGlobal('window', {dispatchEvent, top: {postMessage}});
    const button = {disabled: false, dataset: {}};
    const entry = {};
    const displayAnki = {
        _display: {
            dictionaryEntries: [entry],
            progressIndicatorVisible: {setOverride: () => 'progress', clearOverride: vi.fn()},
        },
        _dictionaryEntryDetails: [{noteMap: new Map([[0, {requirements: []}]])}],
        _saveButtonFind: () => button,
        _hideErrorNotification: vi.fn(),
        _showErrorNotification: vi.fn(),
        _createNote: async () => ({note: {}, errors: [], requirements: []}),
        _getAddNoteRequirementsError: () => null,
        _addNewAnkiNote: vi.fn(async () => {
            if (failed) { throw new Error('Anki unavailable'); }
        }),
    };
    await DisplayAnki.prototype._saveAnkiNote.call(displayAnki, 0, 0);
    if (failed) {
        expect(dispatchEvent).not.toHaveBeenCalled();
        expect(postMessage).not.toHaveBeenCalled();
        expect(displayAnki._showErrorNotification).toHaveBeenCalledOnce();
    } else {
        expect(dispatchEvent).toHaveBeenCalledOnce();
        expect(postMessage).toHaveBeenCalledExactlyOnceWith({type: 'gsm-anki-note-added'}, '*');
    }
});

/* eslint-enable no-underscore-dangle */
