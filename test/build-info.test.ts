import { describe, it, expect } from 'vitest';
import { formatBuildInfo } from '../src/ts/build-info';

describe('formatBuildInfo', () => {
  it('returns "unknown" for missing info', () => {
    expect(formatBuildInfo(null)).toBe('unknown');
    expect(formatBuildInfo(undefined)).toBe('unknown');
    expect(formatBuildInfo({})).toBe('unknown');
  });

  it('formats a commit as a link to <repoUrl>/commit/<sha>', () => {
    const result = formatBuildInfo({
      commit: 'abcdef1234567890',
      repoUrl: 'https://github.com/ashnix/template-game',
      builtAt: '2026-01-15T10:30:00.000Z',
    });

    expect(result).toContain(
      'href="https://github.com/ashnix/template-game/commit/abcdef1234567890"'
    );
    expect(result).toContain('>abcdef1<');
  });

  it('falls back to the raw builtAt string when it is not a valid date', () => {
    const result = formatBuildInfo({ commit: 'abc1234', builtAt: 'not-a-date' });
    expect(result).toContain('not-a-date');
  });
});
