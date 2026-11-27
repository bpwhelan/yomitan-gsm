/*
 * Copyright (C) 2026  Yomitan Authors
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

import {afterEach, describe, expect, test, vi} from 'vitest';
import {YomitanApi} from '../ext/js/comm/yomitan-api.js';
import {createApiMap} from '../ext/js/core/api-map.js';

// The fixture return type is inferred from its spies.
// eslint-disable-next-line jsdoc/require-returns
/** */
function setup() {
    const formats = [{name: 'Expression', type: 'term'}];
    const termsFind = vi.fn((/** @type {{text: string}} */ {text}) => ({dictionaryEntries: [{text}]}));
    const kanjiFind = vi.fn((/** @type {{text: string}} */ {text}) => [{text}]);
    const parseText = vi.fn(() => [{content: '猫'}]);
    const options = {
        anki: {cardFormats: formats},
        dictionaries: [{name: 'Test', alias: 'Alias', enabled: true, definitionsCollapsible: 'collapsed'}],
        general: {language: 'ja'},
        scanning: {enableSearchTags: true},
    };
    const api = new YomitanApi(createApiMap([
        ['optionsGetFull', () => ({profileCurrent: 1, profiles: [{options: {anki: {cardFormats: []}}}, {options}]})],
        ['getDictionaryInfo', () => [{title: 'Test'}, {title: 'Other'}]],
        ['getMedia', (/** @type {{targets: object[]}} */ {targets}) => targets],
        ['termsFind', termsFind],
        ['kanjiFind', kanjiFind],
        ['parseText', parseText],
    ]), null);
    vi.stubGlobal('chrome', {runtime: {getManifest: () => ({version: '26.9.8.0'})}});
    return {api, formats, termsFind, kanjiFind, parseText};
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('GSM bridge shares the native API dispatch without a native port', () => {
    test('reports the bundled version while the external API is disabled', async () => {
        const {api} = setup();
        expect(api.isEnabled()).toBe(false);
        expect(api.isConnected()).toBe(false);
        await expect(api.invokeBridgeAction('yomitanVersion')).resolves.toEqual({data: {version: '26.9.8.0'}, responseStatusCode: 200});
    });

    test('single and batched term lookups use the active profile and retain indexes', async () => {
        const {api, termsFind} = setup();
        await expect(api.invokeBridgeAction('termEntries', {term: '猫'})).resolves.toEqual({
            data: {dictionaryEntries: [{text: '猫'}], index: 0}, responseStatusCode: 200,
        });
        await expect(api.invokeBridgeAction('termEntries', JSON.stringify({term: ['猫', '犬']}))).resolves.toEqual({
            data: [{dictionaryEntries: [{text: '猫'}], index: 0}, {dictionaryEntries: [{text: '犬'}], index: 1}], responseStatusCode: 200,
        });
        expect(termsFind).toHaveBeenLastCalledWith({text: '犬', details: {}, optionsContext: {index: 1}}, {});
    });

    test('tokenization and kanji lookup preserve the upstream options', async () => {
        const {api, parseText, kanjiFind} = setup();
        await api.invokeBridgeAction('tokenize', {text: '猫', scanLength: 10, parser: 'mecab'});
        expect(parseText).toHaveBeenCalledWith({
            text: '猫',
            scanLength: 10,
            optionsContext: {index: 1},
            useInternalParser: false,
            useMecabParser: true,
            useAllFrequencyDictionaries: true,
        }, {});
        await api.invokeBridgeAction('kanjiEntries', {character: '猫'});
        expect(kanjiFind).toHaveBeenCalledWith({text: '猫', details: {}, optionsContext: {index: 1}}, {});
    });

    test('retains the new upstream card format endpoint', async () => {
        const {api, formats} = setup();
        await expect(api.invokeBridgeAction('ankiCardFormats', {})).resolves.toEqual({data: formats, responseStatusCode: 200});
        await expect(api.invokeBridgeAction('ankiCardFormats', {profileIndex: 0})).resolves.toEqual({data: [], responseStatusCode: 200});
    });

    test('exposes the upstream dictionary metadata, display options and media through the bridge', async () => {
        const {api} = setup();
        await expect(api.invokeBridgeAction('dictionaryInfo')).resolves.toMatchObject({
            responseStatusCode: 200,
            data: [{title: 'Test', options: {alias: 'Alias', enabled: true}}, {title: 'Other', options: null}],
        });
        await expect(api.invokeBridgeAction('displayOptions')).resolves.toMatchObject({
            responseStatusCode: 200,
            data: {general: {language: 'ja'}, scanning: {enableSearchTags: true}},
        });
        const targets = [{dictionary: 'Test', path: 'image.png'}];
        await expect(api.invokeBridgeAction('dictionaryMedia', {targets})).resolves.toEqual({data: targets, responseStatusCode: 200});
        await expect(api.invokeBridgeAction('dictionaryMedia', {})).rejects.toThrow('targets');
    });

    test('rejects malformed bodies and unsupported actions', async () => {
        const {api} = setup();
        for (const body of [null, 1, true, 'null', '[1]']) {
            await expect(api.invokeBridgeAction('termEntries', body)).rejects.toThrow('Invalid request body');
        }
        await expect(api.invokeBridgeAction('')).rejects.toThrow('Invalid Yomitan API action');
        await expect(api.invokeBridgeAction('unsupported', {})).resolves.toEqual({data: null, responseStatusCode: 400});
    });

    test('native messages continue to use the same dispatch and response envelope', async () => {
        const {api} = setup();
        const postMessage = vi.fn();
        api._port = {postMessage};
        const message = {action: 'termEntries', params: {id: 42}, body: JSON.stringify({term: '猫'})};
        await api._onMessage(message);
        expect(postMessage).toHaveBeenCalledWith({...message, data: {dictionaryEntries: [{text: '猫'}], index: 0}, responseStatusCode: 200});
    });
});

/* eslint-enable no-underscore-dangle */
