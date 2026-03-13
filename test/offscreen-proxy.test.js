/*
 * Copyright (C) 2023-2025  Yomitan Authors
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

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Offscreen} from '../ext/js/background/offscreen.js';
import {OffscreenProxy} from '../ext/js/background/offscreen-proxy.js';

describe('OffscreenProxy', () => {
    /** @type {{runtime: {getURL: ReturnType<typeof vi.fn>, getContexts: ReturnType<typeof vi.fn>, lastError: undefined}, offscreen: {createDocument: ReturnType<typeof vi.fn>}}} */
    let chromeMock;

    beforeEach(() => {
        chromeMock = {
            runtime: {
                getURL: vi.fn((path) => `chrome-extension://test/${path}`),
                getContexts: vi.fn(async () => []),
                lastError: void 0,
            },
            offscreen: {
                createDocument: vi.fn(async () => {}),
            },
        };
        vi.stubGlobal('chrome', chromeMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('prepare creates the offscreen document once and warms lookup state', async () => {
        const sendMessagePromise = vi.fn(async () => ({result: null}));
        const proxy = new OffscreenProxy({sendMessagePromise});

        await Promise.all([proxy.prepare(), proxy.prepare()]);

        expect(chromeMock.offscreen.createDocument).toHaveBeenCalledTimes(1);
        expect(sendMessagePromise.mock.calls.map(([message]) => message.action)).toStrictEqual([
            'createAndRegisterPortOffscreen',
            'databasePrepareOffscreen',
            'translatorPrepareOffscreen',
        ]);
    });

    test('prepare reuses an existing offscreen document and only rewarms it', async () => {
        chromeMock.runtime.getContexts.mockResolvedValue([{}]);
        const sendMessagePromise = vi.fn(async () => ({result: null}));
        const proxy = new OffscreenProxy({sendMessagePromise});

        await proxy.prepare();

        expect(chromeMock.offscreen.createDocument).not.toHaveBeenCalled();
        expect(sendMessagePromise.mock.calls.map(([message]) => message.action)).toStrictEqual([
            'createAndRegisterPortOffscreen',
            'databasePrepareOffscreen',
            'translatorPrepareOffscreen',
        ]);
    });
});

describe('Offscreen', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('prepare registers listeners, ports, and starts warming lookup state', () => {
        const addMessageListener = vi.fn();
        const addControllerChangeListener = vi.fn();
        vi.stubGlobal('chrome', {
            runtime: {
                onMessage: {
                    addListener: addMessageListener,
                },
            },
        });
        vi.stubGlobal('navigator', {
            serviceWorker: {
                addEventListener: addControllerChangeListener,
            },
        });

        const context = {
            _onMessage() {},
            _createAndRegisterPort: vi.fn(),
            _prepareLookupState: vi.fn(async () => {}),
        };

        Offscreen.prototype.prepare.call(context);

        expect(addMessageListener).toHaveBeenCalledTimes(1);
        expect(addControllerChangeListener).toHaveBeenCalledTimes(1);
        expect(context._createAndRegisterPort).toHaveBeenCalledTimes(1);
        expect(context._prepareLookupState).toHaveBeenCalledTimes(1);
    });
});
