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

import {performance as timeline} from 'node:perf_hooks';
import {expect, test} from 'vitest';
import {safePerformance} from '../ext/js/core/safe-performance.js';

test('a long lookup session retains recent diagnostics and can finish overlapping measurements', () => {
    safePerformance.mark('outer:start');
    for (let i = 0; i < 1000; ++i) {
        safePerformance.mark('lookup:start');
        safePerformance.mark('lookup:end');
        safePerformance.measure('lookup', 'lookup:start', 'lookup:end');
    }
    expect(safePerformance.measure('outer', 'outer:start', 'lookup:end')).toBeDefined();
    for (const name of ['lookup:start', 'lookup:end', 'lookup']) {
        const count = timeline.getEntriesByName(name).length;
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(64);
    }
});
