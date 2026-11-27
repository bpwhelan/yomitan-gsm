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

import {JSDOM} from 'jsdom';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {prepareGsmPopupTooltips} from '../ext/js/display/gsm-popup-tooltips.js';

/** @type {JSDOM} */
let dom;

/**
 * @param {unknown} captured
 * @param {MessageEventSource|null} [source]
 */
function sendState(captured, source = window.top) {
    window.dispatchEvent(new dom.window.MessageEvent('message', {
        source, data: {type: 'gsm-magpie-pointer-state', captured},
    }));
}

beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM('<!DOCTYPE html><iframe></iframe>');
    const popup = dom.window.document.querySelector('iframe')?.contentWindow;
    if (!popup) { throw new Error('Missing popup fixture'); }
    vi.stubGlobal('window', popup);
    vi.stubGlobal('document', popup.document);
    vi.stubGlobal('navigator', {userAgent: 'Electron/43.8.1'});
    vi.spyOn(dom.window, 'postMessage').mockImplementation(() => {});
    document.body.innerHTML = '<span title="Dictionary details"><span>Dictionary</span></span>';
});

afterEach(() => {
    dom.window.close();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test('an Electron popup suppresses tooltip hits until the overlay replies, without changing titles', () => {
    prepareGsmPopupTooltips();
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBe('');
    expect(dom.window.postMessage).toHaveBeenCalledExactlyOnceWith({type: 'gsm-magpie-pointer-state-request'}, '*');
    sendState(false);
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBeUndefined();
    sendState(true);
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBe('');
    expect(document.querySelector('[title]')?.getAttribute('title')).toBe('Dictionary details');
});

test('unrelated frames and malformed states cannot re-enable native tooltips', () => {
    prepareGsmPopupTooltips();
    sendState(false, window);
    sendState('false');
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBe('');
    sendState(false);
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBeUndefined();
});

test('capture remains suppressed after the fallback deadline when GSM has replied', () => {
    prepareGsmPopupTooltips();
    sendState(true);
    vi.advanceTimersByTime(2000);
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBe('');
});

test('Electron without an overlay recovers normal tooltips and still accepts a late GSM reply', () => {
    prepareGsmPopupTooltips();
    vi.advanceTimersByTime(1000);
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBeUndefined();
    sendState(true);
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBe('');
    sendState(false);
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBeUndefined();
});

test.each(['browser frame', 'top-level Electron'])('%s retains its normal tooltips', (context) => {
    if (context === 'browser frame') {
        vi.stubGlobal('navigator', {userAgent: 'Chrome/143'});
    } else {
        vi.stubGlobal('window', dom.window);
    }
    prepareGsmPopupTooltips();
    sendState(true);
    expect(document.documentElement.dataset.gsmMagpieCaptured).toBeUndefined();
    expect(dom.window.postMessage).not.toHaveBeenCalled();
});
