import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicMetrics } from '@/lib/public-content';

/**
 * The public site must not publish invented quantitative claims. These tests pin the removal of the
 * marketing metric defaults (`94%`, `12 rooms`, `7 days`, `24/7`) and of the named property/news
 * examples that could be mistaken for real SafeNest records.
 */

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), 'utf8');

describe('public metrics are saved values only', () => {
  it('renders no metrics when nothing has been saved', () => {
    expect(publicMetrics(undefined)).toEqual([]);
    expect(publicMetrics(null)).toEqual([]);
    expect(publicMetrics({})).toEqual([]);
    expect(publicMetrics({ 'homepage.stats.moveOn': '', 'homepage.stats.newRooms': '   ' })).toEqual([]);
  });

  it('returns only the metrics an editor has actually saved', () => {
    expect(publicMetrics({ 'homepage.stats.moveOn': ' 91% ', 'homepage.stats.responseTarget': '5 working days' })).toEqual([
      { value: '91%', label: 'move-on tenancies sustained at six months' },
      { value: '5 working days', label: 'our target for acknowledging referrals' }
    ]);
  });

  it('has no metric defaults in the public content source', () => {
    const data = read('src', 'lib', 'data.ts');
    const settingsStart = data.indexOf('export const fallbackSiteSettings');
    const settingsEnd = data.indexOf('};', settingsStart);
    expect(settingsStart).toBeGreaterThan(-1);
    const settingsBlock = data.slice(settingsStart, settingsEnd);
    expect(settingsBlock).not.toMatch(/homepage\.stats/);
    expect(settingsBlock).not.toContain('94%');
    expect(data).not.toContain("'94%'");
    expect(data).not.toContain('fallbackProperties');
    expect(data).not.toContain('fallbackNews');
    expect(data).not.toContain('willow-house');
    expect(data).not.toContain('outcomes-report-2025-26');
  });

  it('has no hard-coded statistic or 24/7 claim in the stats band', () => {
    const ui = read('src', 'components', 'PublicUI.tsx');
    const bandStart = ui.indexOf('export function StatsBand');
    const bandEnd = ui.indexOf('\n}', bandStart);
    expect(bandStart).toBeGreaterThan(-1);
    const band = ui.slice(bandStart, bandEnd);
    expect(band).not.toContain('94%');
    expect(band).not.toContain('24/7');
    expect(band).not.toContain("'12'");
    expect(band).toContain('publicMetrics');
    expect(band).toContain('if (!metrics.length) return null');
  });
});

describe('public pages show honest empty states', () => {
  it('does not invent homes, vacancies or news when the tables are empty', () => {
    const data = read('src', 'lib', 'data.ts');
    const properties = data.slice(data.indexOf('export async function getPublicProperties'), data.indexOf('export async function getPublicPropertyBySlug'));
    const news = data.slice(data.indexOf('export async function getPublishedNews'), data.indexOf('export async function getNewsBySlug'));
    expect(properties).toContain('return [];');
    expect(properties).not.toMatch(/fallback/);
    expect(news).toContain('return [];');
    expect(news).not.toMatch(/fallback/);
  });

  it('renders explicit empty states on the public properties page', () => {
    expect(read('src', 'app', '(public)', 'properties', 'page.tsx')).toContain('Property details are not published yet');
  });

  it('renders an explicit empty state on the public news page', () => {
    expect(read('src', 'app', '(public)', 'news', 'page.tsx')).toContain('No news has been published yet');
  });

  it('omits the homepage property section entirely when nothing is published', () => {
    expect(read('src', 'app', '(public)', 'page.tsx')).toContain('properties.length > 0 &&');
  });
});
