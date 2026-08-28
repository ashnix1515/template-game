import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.join(__dirname, '..', 'dist');

describe('build output', () => {
  it('minifies dist/index.html', () => {
    const content = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    expect(/\n\s\s+/.test(content)).toBe(false);
    expect(content.includes('\n\n')).toBe(false);
  });

  it('minifies dist/sw.js to a single line', () => {
    const content = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8').trim();
    expect(content.includes('\n')).toBe(false);
  });

  it('copies assets into dist/assets', () => {
    expect(fs.existsSync(path.join(DIST, 'assets', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(DIST, 'assets', 'icon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(DIST, 'assets', 'favicon.svg'))).toBe(true);
  });

  it('generates buildinfo.js with commit, repoUrl, and builtAt', () => {
    const content = fs.readFileSync(path.join(DIST, 'buildinfo.js'), 'utf8');
    expect(content).toContain('self.BUILD_INFO');

    const match = content.match(/self\.BUILD_INFO\s*=\s*(\{.*\});/);
    expect(match).toBeTruthy();

    const info = JSON.parse(match![1]);
    expect(info).toHaveProperty('commit');
    expect(info).toHaveProperty('repoUrl');
    expect(info).toHaveProperty('builtAt');
  });

  it('bundles sw.js with a cache-first strategy and update-detection', () => {
    const content = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
    expect(content).toContain('caches.match');
    expect(content).toContain('buildinfo.js');
    expect(content).toContain('UPDATE_READY');
    expect(content).toContain('CHECK_UPDATE');
  });

  it('bundles debug.html without the service worker registration or update banner', () => {
    const content = fs.readFileSync(path.join(DIST, 'debug.html'), 'utf8');
    expect(content.includes('serviceWorker.register')).toBe(false);
    expect(content.includes('id="update-notification"')).toBe(false);
  });
});
