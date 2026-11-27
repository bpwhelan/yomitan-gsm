import {expect, test} from 'vitest';
import {deferPromise} from '../ext/js/core/utilities.js';
import {LookupCache} from '../ext/js/general/lookup-cache.js';

test('repeated and concurrent queries share work but never mutable results', async () => {
    const cache = new LookupCache();
    const profile = {};
    let calls = 0;
    const load = async () => ({entries: [{term: '食べる'}], call: ++calls});
    const [first, second] = await Promise.all([cache.get(profile, '食べた', load), cache.get(profile, '食べた', load)]);
    first.entries[0].term = 'changed';
    expect(second.entries[0].term).toBe('食べる');
    expect((await cache.get(profile, '食べた', load)).entries[0].term).toBe('食べる');
    expect(calls).toBe(1);
    await cache.get({}, '食べた', load);
    expect(calls).toBe(2);
});

test('invalidation prevents unfinished old work from repopulating the cache', async () => {
    const cache = new LookupCache();
    const profile = {};
    /** @type {import('core').DeferredPromiseDetails<string>} */
    const pending = deferPromise();
    const old = cache.get(profile, 'word', () => pending.promise);
    cache.clear();
    await cache.get(profile, 'word', async () => 'new');
    pending.resolve('old');
    expect(await old).toBe('old');
    expect(await cache.get(profile, 'word', async () => 'unexpected')).toBe('new');
});

test('misses are cached, errors are retried, and result storage is bounded', async () => {
    const cache = new LookupCache(2, 100);
    const profile = {};
    let calls = 0;
    const load = async () => { ++calls; return []; };
    await cache.get(profile, 'a', load); await cache.get(profile, 'a', load);
    expect(calls).toBe(1);
    await cache.get(profile, 'b', load); await cache.get(profile, 'a', load);
    await cache.get(profile, 'c', load); await cache.get(profile, 'b', load);
    expect(calls).toBe(4);
    await expect(cache.get(profile, 'error', async () => {throw Error('temporary');})).rejects.toThrow('temporary');
    expect(await cache.get(profile, 'error', load)).toEqual([]);
    const large = async () => { ++calls; return 'x'.repeat(100); };
    const before = calls;
    await cache.get(profile, 'large', large); await cache.get(profile, 'large', large);
    expect(calls - before).toBe(2);
});
