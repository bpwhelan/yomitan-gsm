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
import {afterEach, expect, test, vi} from 'vitest';
import {Frontend} from '../ext/js/app/frontend.js';
import {Popup} from '../ext/js/app/popup.js';
import {deferPromise} from '../ext/js/core/utilities.js';

afterEach(() => vi.useRealTimers());

const outside = {active: true, x: -1, y: -1, overText: false, overPopup: false};
const text = {...outside, x: 50, y: 50, overText: true};
const popup = {...outside, x: 100, y: 100, overPopup: true};
const setup = () => ({
    _gsmOverlayHoverState: outside,
    _isPointerOverPopup: true,
    _popup: {containsPoint: vi.fn(async () => false)},
    _textScanner: {hasSelection: () => true},
    _options: {scanning: {autoHideResults: true, hideDelay: 100}},
    _isGsmGamepadNavigationActive: () => false,
    _isCurrentGsmLookup: () => true,
    _isPointerOverAnyPopup: Frontend.prototype._isPointerOverAnyPopup,
    _clearSelectionDelayed: Frontend.prototype._clearSelectionDelayed,
    _stopClearSelectionDelayed: Frontend.prototype._stopClearSelectionDelayed,
    _clearSelectionDelayToken: 0,
    _clearSelectionTimer: null,
    _clearSelection: vi.fn(),
    _showContent: vi.fn(),
});

test('the current overlay point overrides a stale popup mouse-over flag', async () => {
    const frontend = setup();
    expect(await frontend._isPointerOverAnyPopup()).toBe(false);
    frontend._gsmOverlayHoverState = popup;
    frontend._isPointerOverPopup = false;
    expect(await frontend._isPointerOverAnyPopup()).toBe(true);
});

test('popup geometry protects nested or shadow-hosted popups even when DOM hit testing cannot identify them', async () => {
    const frontend = setup();
    frontend._popup.containsPoint.mockResolvedValue(true);
    frontend._gsmOverlayHoverState = {...outside, x: 100, y: 100};
    expect(await frontend._isPointerOverAnyPopup()).toBe(true);
    expect(frontend._popup.containsPoint).toHaveBeenCalledWith(100, 100);
});

test('leaving the overlay hides after the configured delay without needing another scan', async () => {
    vi.useFakeTimers();
    const frontend = setup();
    Frontend.prototype._onGsmOverlayHover.call(frontend, new CustomEvent('gsm-overlay-hover', {detail: outside}));
    await vi.advanceTimersByTimeAsync(149);
    expect(frontend._clearSelection).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(frontend._clearSelection).toHaveBeenCalledExactlyOnceWith(false);
});

test.each([text, popup])('returning to text or a popup cancels a pending hide: %j', async (target) => {
    vi.useFakeTimers();
    const frontend = setup();
    Frontend.prototype._onGsmOverlayHover.call(frontend, new CustomEvent('gsm-overlay-hover', {detail: outside}));
    await vi.advanceTimersByTimeAsync(60);
    Frontend.prototype._onGsmOverlayHover.call(frontend, new CustomEvent('gsm-overlay-hover', {detail: target}));
    await vi.advanceTimersByTimeAsync(500);
    expect(frontend._clearSelection).not.toHaveBeenCalled();
});

test('late mouse results cannot reopen a popup after the pointer moved away', () => {
    const frontend = setup();
    frontend._clearSelectionDelayed = vi.fn();
    Frontend.prototype._onSearchSuccess.call(frontend, {detail: null, inputInfo: {eventType: 'mouseMove', detail: null}});
    expect(frontend._showContent).not.toHaveBeenCalled();
    expect(frontend._clearSelectionDelayed).toHaveBeenCalledWith(100, false, false);
});

test.each(['disabled', 'controller'])('mouse auto-hide respects %s mode', async (mode) => {
    vi.useFakeTimers();
    const frontend = setup();
    if (mode === 'disabled') { frontend._options.scanning.autoHideResults = false; }
    if (mode === 'controller') { frontend._isGsmGamepadNavigationActive = () => true; }
    Frontend.prototype._onGsmOverlayHover.call(frontend, new CustomEvent('gsm-overlay-hover', {detail: outside}));
    await vi.advanceTimersByTimeAsync(500);
    expect(frontend._clearSelection).not.toHaveBeenCalled();
    Frontend.prototype._onSearchSuccess.call(frontend, {
        detail: null, inputInfo: {eventType: mode === 'disabled' ? 'mouseMove' : 'click', detail: null},
    });
    expect(frontend._showContent).toHaveBeenCalledOnce();
});

test('explicit interaction resets overlay hover and cancels its pending auto-hide', async () => {
    vi.useFakeTimers();
    const frontend = setup();
    Frontend.prototype._onGsmOverlayHover.call(frontend, new CustomEvent('gsm-overlay-hover', {detail: outside}));
    await vi.advanceTimersByTimeAsync(60);
    Frontend.prototype._onGsmOverlayHover.call(frontend, new CustomEvent('gsm-overlay-hover', {detail: {active: false}}));
    await vi.advanceTimersByTimeAsync(500);
    expect(frontend._clearSelection).not.toHaveBeenCalled();
    expect(frontend._gsmOverlayHoverState).toBeNull();
    expect(await frontend._isPointerOverAnyPopup()).toBe(true, 'native hover takes over again');
});

const setupPopup = () => ({
    _showContentToken: 0,
    _optionsContext: {},
    _setOptionsContextIfDifferent: vi.fn(async () => {}),
    stopHideDelayed: vi.fn(),
    isVisibleSync: () => false,
    _show: Popup.prototype._show,
    _inject: vi.fn(async () => true),
    _getViewport: () => ({}),
    _getPosition: () => ({left: 0, top: 0, width: 400, height: 250, after: false, below: true}),
    _frame: {dataset: {}, style: {}},
    _setFrameSize: vi.fn(),
    _setVisible: vi.fn(),
    _child: null,
    _invokeSafe: vi.fn(),
});
const contentDetails = {optionsContext: {}, sourceRects: [], writingMode: 'horizontal-tb'};

test.each(['settings', 'frame'])('hiding during popup %s startup cancels the pending show', async (stage) => {
    const popupFixture = setupPopup();
    const pending = deferPromise();
    if (stage === 'settings') {
        popupFixture._setOptionsContextIfDifferent.mockImplementation(async () => { await pending.promise; });
    } else {
        popupFixture._inject.mockImplementation(async () => {
            await pending.promise;
            return true;
        });
    }
    const showing = Popup.prototype.showContent.call(popupFixture, contentDetails, {});
    await Promise.resolve();
    Popup.prototype.hide.call(popupFixture, false);
    pending.resolve();
    await showing;
    expect(popupFixture._setVisible).not.toHaveBeenCalled();
    expect(popupFixture._invokeSafe).not.toHaveBeenCalled();

    await Popup.prototype.showContent.call(popupFixture, contentDetails, {});
    expect(popupFixture._setVisible).toHaveBeenCalledExactlyOnceWith(true);
    expect(popupFixture._invokeSafe).toHaveBeenCalledOnce();
});

test('only the newest lookup is displayed when requests share a pending popup frame', async () => {
    const popupFixture = setupPopup();
    const pending = deferPromise();
    popupFixture._inject.mockImplementation(async () => {
        await pending.promise;
        return true;
    });
    const oldContent = {query: 'old'};
    const currentContent = {query: 'current'};
    const oldShow = Popup.prototype.showContent.call(popupFixture, contentDetails, oldContent);
    await Promise.resolve();
    const currentShow = Popup.prototype.showContent.call(popupFixture, contentDetails, currentContent);
    pending.resolve();
    await Promise.all([oldShow, currentShow]);
    expect(popupFixture._setVisible).toHaveBeenCalledExactlyOnceWith(true);
    expect(popupFixture._invokeSafe).toHaveBeenCalledExactlyOnceWith('displaySetContent', {details: currentContent});
});

/* eslint-enable no-underscore-dangle, @typescript-eslint/unbound-method */
