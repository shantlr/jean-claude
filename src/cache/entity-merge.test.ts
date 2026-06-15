import { describe, expect, it } from 'vitest';

import { applyEntityPatch, mergeEntitySnapshot } from './entity-merge';

type TestEntity = {
  id: string;
  title: string;
  summary: string | null;
  detail: string | null;
  count?: number;
};

describe('entity merge helpers', () => {
  it('ignores absent snapshot fields represented by undefined', () => {
    const current: TestEntity = {
      id: 'entity-1',
      title: 'Current title',
      summary: 'Current summary',
      detail: 'Current detail',
      count: 3,
    };

    const next = mergeEntitySnapshot(current, {
      title: 'Snapshot title',
      summary: undefined,
      count: undefined,
    });

    expect(next).toEqual({
      id: 'entity-1',
      title: 'Snapshot title',
      summary: 'Current summary',
      detail: 'Current detail',
      count: 3,
    });
  });

  it('applies patch null fields as intentional clears', () => {
    const current: TestEntity = {
      id: 'entity-1',
      title: 'Current title',
      summary: 'Current summary',
      detail: 'Current detail',
      count: 3,
    };

    const next = applyEntityPatch(current, {
      summary: null,
    });

    expect(next).toEqual({
      id: 'entity-1',
      title: 'Current title',
      summary: null,
      detail: 'Current detail',
      count: 3,
    });
  });

  it('ignores patch fields represented by undefined', () => {
    const current: TestEntity = {
      id: 'entity-1',
      title: 'Current title',
      summary: 'Current summary',
      detail: 'Current detail',
      count: 3,
    };

    const next = applyEntityPatch(current, {
      title: 'Patched title',
      summary: undefined,
      count: undefined,
    });

    expect(next).toEqual({
      id: 'entity-1',
      title: 'Patched title',
      summary: 'Current summary',
      detail: 'Current detail',
      count: 3,
    });
  });

  it('keeps detail fields when merging lower-detail summary snapshots', () => {
    const current: TestEntity = {
      id: 'entity-1',
      title: 'Detailed title',
      summary: 'Detailed summary',
      detail: 'Full detail text',
    };

    const next = mergeEntitySnapshot(current, {
      title: 'Summary title',
      summary: 'Summary text',
      detail: undefined,
    });

    expect(next).toEqual({
      id: 'entity-1',
      title: 'Summary title',
      summary: 'Summary text',
      detail: 'Full detail text',
    });
  });
});
