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

/* eslint-disable no-underscore-dangle, @typescript-eslint/unbound-method */

import {JSDOM} from 'jsdom';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {DisplayAnki} from '../ext/js/display/display-anki.js';
import {GsmJitenGrading} from '../ext/js/display/gsm-jiten-grading.js';
import {querySelectorNotNull} from '../ext/js/dom/query-selector.js';

/** @type {JSDOM} */
let dom;

/** @returns {HTMLElement|null} */
function selectedButton() {
    return document.querySelector('.gsm-controller-selected-action');
}

// The return type is inferred from this fixture's mocks.
// eslint-disable-next-line jsdoc/require-returns
/** */
function setupPopup() {
    document.body.innerHTML = `
        <div id="content-scroll"><div id="dictionary-entries">
            <div class="entry entry-current">
                <button class="action-button" data-action="play-audio">Audio</button>
                <button class="action-button" data-action="save-note" data-card-format-index="0">Mine</button>
            </div>
            <div class="entry">
                <button class="action-button" data-action="save-note" data-card-format-index="0">Mine second</button>
            </div>
        </div></div><div id="popup-menus"></div>`;
    const display = {
        application: {api: {}},
        selectedIndex: 0,
        dictionaryEntries: [
            {type: 'term', headwords: [{term: '猫', reading: 'ねこ'}]},
            {type: 'term', headwords: [{term: '犬', reading: 'いぬ'}]},
        ],
        _focusEntry: vi.fn((/** @type {number} */ index) => {
            display.selectedIndex = Math.max(0, Math.min(index, display.dictionaryEntries.length - 1));
            for (const [i, entry] of [...document.querySelectorAll('.entry')].entries()) {
                entry.classList.toggle('entry-current', i === display.selectedIndex);
            }
        }),
    };
    const typedDisplay = /** @type {import('../ext/js/display/display.js').Display} */ (/** @type {unknown} */ (display));
    const controller = new DisplayAnki(typedDisplay, /** @type {import('../ext/js/display/display-audio.js').DisplayAudio} */ ({}));
    const grader = new GsmJitenGrading(typedDisplay);
    const grade = vi.spyOn(grader, '_sendGrade').mockResolvedValue({ok: true});
    grader._applyConfig({enabled: true});
    const mine = vi.fn();
    for (const button of document.querySelectorAll('.action-button')) {
        button.addEventListener('click', mine);
    }
    const scroll = /** @type {HTMLElement} */ (querySelectorNotNull(document, '#content-scroll'));
    scroll.scrollBy = vi.fn();
    /**
     * @param {string} action
     * @param {number} [direction]
     * @returns {void}
     */
    const control = (action, direction) => controller._onGsmPostMessage(new MessageEvent('message', {data: {type: 'gsm-yomitan-control', action, direction}}));
    control('reset-action-selection');
    return {controller, grader, grade, mine, display, scroll, control};
}

beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM('<!DOCTYPE html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    for (const name of ['HTMLElement', 'HTMLButtonElement', 'MouseEvent', 'MessageEvent', 'DOMRect']) {
        vi.stubGlobal(name, dom.window[name]);
    }
    vi.spyOn(dom.window, 'setTimeout').mockImplementation((callback, delay) => Number(setTimeout(() => {
        if (typeof callback === 'function') { callback(); }
    }, delay)));
    vi.spyOn(dom.window, 'clearTimeout').mockImplementation((id) => { clearTimeout(id); });
    vi.stubGlobal('chrome', {runtime: {getURL: (path) => `chrome-extension://test${path}`}});
    // jsdom has no layout. Keep visibility dependent on the actual DOM and CSS.
    /**
     * @this {HTMLElement}
     * @returns {DOMRectList}
     */
    function getClientRects() {
        if (!this.isConnected || this.closest('[hidden]') !== null || getComputedStyle(this).display === 'none') {
            return /** @type {DOMRectList} */ ([]);
        }
        return /** @type {DOMRectList} */ ([new DOMRect(0, 0, 80, 24)]);
    }
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(getClientRects);
    HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
    dom.window.close();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('GSM popup grading navigation', () => {
    test('previous entry reaches grading, left/right selects a grade, and confirm submits the highlighted grade', async () => {
        const {control, grade, mine, display} = setupPopup();
        expect(selectedButton()?.textContent).toBe('Mine');
        control('previous-entry');
        expect(selectedButton()?.textContent).toBe('Good');
        expect(display.selectedIndex).toBe(0);
        expect(selectedButton()?.scrollIntoView).toHaveBeenCalled();
        control('select-action', -1);
        expect(selectedButton()?.textContent).toBe('Hard');
        control('confirm-action');
        await Promise.resolve();
        expect(grade).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({kind: 'review', rating: 2, term: '猫', reading: 'ねこ'}));
        expect(mine).not.toHaveBeenCalled();
    });

    test.each([
        {config: {}, labels: ['Good', 'Easy', 'Blacklist', 'Never Forget', 'Again', 'Hard']},
        {config: {twoGrades: true}, labels: ['Good', 'Blacklist', 'Never Forget', 'Again']},
        {config: {showGrading: false}, labels: ['Blacklist', 'Never Forget']},
    ])('cycles only through the available Jiten controls: $labels', ({config, labels}) => {
        const {control, grader} = setupPopup();
        grader._applyConfig({enabled: true, ...config});
        control('previous-entry');
        for (const label of labels) {
            expect(selectedButton()?.textContent).toBe(label);
            control('select-action', 1);
        }
        expect(selectedButton()?.textContent).toBe(labels[0]);
        control('select-action', -1);
        expect(selectedButton()?.textContent).toBe(labels.at(-1));
    });

    test('confirm also activates the state buttons', async () => {
        const {control, grade, grader} = setupPopup();
        grader._applyConfig({enabled: true, showGrading: false});
        control('previous-entry');
        control('confirm-action');
        await Promise.resolve();
        expect(grade).toHaveBeenCalledWith(expect.objectContaining({kind: 'state', deck: 'blacklist', action: 'add'}));
        control('select-action', 1);
        control('confirm-action');
        await Promise.resolve();
        expect(grade).toHaveBeenLastCalledWith(expect.objectContaining({kind: 'state', deck: 'neverForget', action: 'add'}));
    });

    test.each([{}, {twoGrades: true}, {showGrading: false}])('another previous-entry press selects Never Forget for %j', (config) => {
        const {control, grader, grade, mine} = setupPopup();
        grader._applyConfig({enabled: true, ...config});
        control('previous-entry');
        expect(selectedButton()?.textContent).not.toBe('Never Forget');
        control('previous-entry');
        expect(selectedButton()?.textContent).toBe('Never Forget');
        control('previous-entry');
        expect(selectedButton()?.textContent).toBe('Never Forget');
        expect(grade).not.toHaveBeenCalled();
        expect(mine).not.toHaveBeenCalled();
        control('confirm-action');
        expect(grade).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({kind: 'state', deck: 'neverForget', action: 'add'}));
    });

    test('entry navigation updates the highlight and next from grading returns to the first entry', () => {
        const {control, display} = setupPopup();
        control('next-entry');
        expect(selectedButton()?.textContent).toBe('Mine second');
        control('previous-entry');
        expect(selectedButton()?.textContent).toBe('Mine');
        control('previous-entry');
        control('previous-entry');
        expect(selectedButton()?.textContent).toBe('Never Forget');
        control('next-entry');
        expect(display.selectedIndex).toBe(0);
        expect(selectedButton()?.textContent).toBe('Mine');
        control('next-entry');
        expect(display.selectedIndex).toBe(1);
        expect(selectedButton()?.textContent).toBe('Mine second');
    });

    test('hidden grading is skipped and ordinary actions still work', () => {
        const {control, grader, mine} = setupPopup();
        grader._applyConfig({enabled: false});
        control('previous-entry');
        expect(selectedButton()?.textContent).toBe('Mine');
        control('confirm-action');
        expect(mine).toHaveBeenCalledOnce();
        control('select-action', -1);
        expect(selectedButton()?.textContent).toBe('Audio');
    });

    test('repeated confirm while a grade is pending neither grades twice nor mines', async () => {
        const {control, grade, mine} = setupPopup();
        /** @type {(value: object) => void} */
        let finish = () => {};
        grade.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
        control('previous-entry');
        control('confirm-action');
        control('confirm-action');
        control('previous-entry');
        control('select-action', 1);
        control('confirm-action');
        expect(grade).toHaveBeenCalledOnce();
        expect(mine).not.toHaveBeenCalled();
        expect(selectedButton()?.textContent).toBe('Good');
        finish({ok: true});
        await Promise.resolve();
        control('confirm-action');
        expect(grade).toHaveBeenCalledTimes(2);
        expect(grade).toHaveBeenLastCalledWith(expect.objectContaining({rating: 3}));
    });

    test('disabling an earlier button does not change which grade confirm activates', () => {
        const {control, grade} = setupPopup();
        control('previous-entry');
        const blacklist = /** @type {HTMLButtonElement} */ (querySelectorNotNull(document, '.gsm-jiten-blacklist'));
        blacklist.disabled = true;
        control('confirm-action');
        expect(grade).toHaveBeenCalledWith(expect.objectContaining({rating: 3}));
    });

    test('a replaced or hidden grading selection cannot silently activate a different action', () => {
        const {control, grader, grade, mine} = setupPopup();
        control('previous-entry');
        control('select-action', -1);
        grader._applyConfig({enabled: true, twoGrades: true});
        control('confirm-action');
        expect(grade).not.toHaveBeenCalled();
        expect(selectedButton()?.textContent).toBe('Good');
        grader._applyConfig({enabled: false});
        control('confirm-action');
        expect(grade).not.toHaveBeenCalled();
        expect(mine).not.toHaveBeenCalled();
        control('next-entry');
        expect(selectedButton()?.textContent).toBe('Mine');
    });

    test('clearing or reopening the popup resets grading focus to the default entry action', () => {
        const {control} = setupPopup();
        control('previous-entry');
        expect(selectedButton()?.textContent).toBe('Good');
        control('clear-action-selection');
        expect(selectedButton()).toBeNull();
        control('reset-action-selection');
        expect(selectedButton()?.textContent).toBe('Mine');
    });

    test('scrolling up at the top reaches grading and scrolling down returns to entry actions', () => {
        const {control, scroll, display} = setupPopup();
        control('next-entry');
        scroll.scrollTop = 150;
        control('scroll', -1);
        expect(selectedButton()?.textContent).toBe('Mine second');
        expect(scroll.scrollBy).toHaveBeenLastCalledWith({top: -110, behavior: 'auto'});
        scroll.scrollTop = 0;
        control('scroll', -1);
        expect(display.selectedIndex).toBe(0);
        expect(selectedButton()?.textContent).toBe('Good');
        control('select-action', -1);
        control('scroll', -1);
        expect(selectedButton()?.textContent).toBe('Hard');
        control('scroll', 1);
        expect(selectedButton()?.textContent).toBe('Mine');
        expect(scroll.scrollBy).toHaveBeenLastCalledWith({top: 110, behavior: 'auto'});
    });

    test('a pending default-action retry cannot steal focus from grading', () => {
        const {control} = setupPopup();
        const buttons = document.querySelectorAll('button.action-button');
        for (const button of buttons) { button.setAttribute('disabled', ''); }
        control('reset-action-selection');
        control('previous-entry');
        for (const button of buttons) { button.removeAttribute('disabled'); }
        vi.advanceTimersByTime(500);
        expect(selectedButton()?.textContent).toBe('Good');
    });
});
/* eslint-enable no-underscore-dangle, @typescript-eslint/unbound-method */
