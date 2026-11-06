import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dependency regression tests for the clean-build failure.
 *
 * Next 16.2 requires React 19, but the project was pinned to React 18.3. With a cold `.next` cache the
 * build crashed while prerendering `/_global-error` and `/_not-found` (`useContext` of null). These
 * tests keep the runtime, renderer and type packages on one React release so the mismatch cannot return.
 */

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string }> };
const installed = (name: string) => JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')) as { version: string; peerDependencies?: Record<string, string> };

function major(version: string) {
  return version.split('.')[0];
}

describe('React 19 / Next 16 dependency alignment', () => {
  it('pins react and react-dom to the same 19.2 release', () => {
    expect(pkg.dependencies.react).toBe(pkg.dependencies['react-dom']);
    expect(pkg.dependencies.react).toMatch(/^19\.2\.\d+$/);
    expect(installed('react').version).toBe(pkg.dependencies.react);
    expect(installed('react-dom').version).toBe(pkg.dependencies['react-dom']);
  });

  it('keeps @types/react and @types/react-dom on the runtime major and minor', () => {
    expect(major(pkg.dependencies['@types/react'])).toBe(major(pkg.dependencies.react));
    expect(major(pkg.dependencies['@types/react-dom'])).toBe(major(pkg.dependencies['react-dom']));
    expect(pkg.dependencies['@types/react'].split('.').slice(0, 2).join('.')).toBe(pkg.dependencies.react.split('.').slice(0, 2).join('.'));
  });

  it('keeps Next on the reviewed 16.2.10 release', () => {
    expect(pkg.dependencies.next).toBe('^16.2.10');
    expect(lock.packages['node_modules/next']?.version).toBe('16.2.10');
    expect(installed('next').version).toBe('16.2.10');
  });

  it('satisfies the React peer range declared by Next', () => {
    const peers = installed('next').peerDependencies ?? {};
    expect(peers.react).toContain('^19.0.0');
    expect(peers['react-dom']).toContain('^19.0.0');
    expect(major(pkg.dependencies.react)).toBe('19');
  });

  it('resolves a single React and a single React DOM in the lockfile', () => {
    const reactCopies = Object.keys(lock.packages).filter((key) => key === 'node_modules/react' || key.endsWith('/node_modules/react'));
    const reactDomCopies = Object.keys(lock.packages).filter((key) => key === 'node_modules/react-dom' || key.endsWith('/node_modules/react-dom'));
    expect(reactCopies).toEqual(['node_modules/react']);
    expect(reactDomCopies).toEqual(['node_modules/react-dom']);
    expect(existsSync(resolve(root, 'node_modules', 'react-dom', 'node_modules', 'react'))).toBe(false);
  });

  it('leaves no React 18 package in the dependency tree', () => {
    const reactVersions = Object.entries(lock.packages)
      .filter(([key]) => key === 'node_modules/react' || key.endsWith('/node_modules/react'))
      .map(([, value]) => value.version);
    expect(reactVersions.every((version) => version?.startsWith('19.'))).toBe(true);
    expect(pkg.dependencies.react.startsWith('18.')).toBe(false);
    expect(pkg.dependencies['react-dom'].startsWith('18.')).toBe(false);
  });
});
