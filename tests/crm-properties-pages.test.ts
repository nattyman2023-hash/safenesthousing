import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CrmPropertiesPage from '@/app/crm/properties/page';
import CrmPropertyDetailPage from '@/app/crm/properties/[id]/page';

/**
 * Page-level regression tests for the CRM property module.
 *
 * The pages are called directly and their element tree is inspected, so these tests assert what the
 * server would render without needing a browser or a seeded database. They prove the production
 * failure mode found in the audit is gone: an empty Property table renders an empty state, not the
 * five illustrative homes; a property with no Room rows renders a truthful zero-room state, not a
 * fabricated occupied room.
 */

const { getCrmProperties, getCrmProperty } = vi.hoisted(() => ({ getCrmProperties: vi.fn(), getCrmProperty: vi.fn() }));

vi.mock('@/lib/data', () => ({ getCrmProperties, getCrmProperty }));
vi.mock('@/lib/service-catalogue', () => ({ getCrmSelectableServices: vi.fn(async () => []) }));
vi.mock('@/lib/crm-auth', () => ({ requireCrmUser: vi.fn(async () => ({ id: 'user-1', organisationId: 'org-1' })) }));
vi.mock('@/components/PropertyCreateForm', () => ({ PropertyCreateForm: () => null }));
vi.mock('@/components/RoomCreateForm', () => ({ RoomCreateForm: () => null }));
vi.mock('@/components/ClickableRow', () => ({ ClickableRow: (props: { children?: unknown }) => props.children }));
vi.mock('@/components/FilterBar', () => ({ FilterBar: (props: { children?: unknown }) => props.children }));
vi.mock('next/link', () => ({ default: (props: { children?: unknown }) => props.children }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));

const FICTIONAL_HOMES = /Willow House|Harbour Court|Fenwick Road|Alder Terrace|Linden Place/;

const realProperty = {
  id: 'property-1',
  organisationId: 'org-1',
  publicName: 'Orchard View',
  neighbourhood: 'Northside',
  serviceType: 'Supported accommodation',
  capacity: 4,
  publicVacancyState: 'Rooms available',
  confidential: false,
  rooms: [] as { id: string; label: string; status: string; notes: string | null }[],
  service: null
};

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) {
    const element = node as { type: unknown; props: { children?: unknown } };
    if (typeof element.type === 'function') {
      try {
        // Expand synchronous presentational components so their rendered copy is inspected too.
        // Interactive client components (ClickableRow, FilterBar, forms) are mocked above: calling a
        // component that uses hooks outside a React render would log an invalid-hook-call warning.
        return textOf((element.type as (props: unknown) => unknown)(element.props));
      } catch {
        return textOf(element.props.children);
      }
    }
    return textOf(element.props.children);
  }
  return '';
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/crm/properties with an empty Property table', () => {
  it('renders a genuine empty state and none of the fictional homes', async () => {
    getCrmProperties.mockResolvedValue([]);
    const text = textOf(await CrmPropertiesPage());
    expect(text).toContain('No properties yet');
    expect(text).toContain('0 homes');
    expect(text).toContain('No rooms have been recorded, so every occupancy figure is zero.');
    expect(text).toContain('Add property');
    expect(text).not.toMatch(FICTIONAL_HOMES);
  });
});

describe('/crm/properties with a real Property', () => {
  it('renders the real record and its real room counts', async () => {
    getCrmProperties.mockResolvedValue([{ ...realProperty, rooms: [{ id: 'room-1', label: 'Room A', status: 'AVAILABLE', notes: null }] }]);
    const text = textOf(await CrmPropertiesPage());
    expect(text).toContain('Orchard View');
    expect(text).toContain('1 of 1 rooms');
    expect(text).not.toContain('No properties yet');
    expect(text).not.toMatch(FICTIONAL_HOMES);
  });

  it('shows a zero-room property truthfully instead of inventing availability', async () => {
    getCrmProperties.mockResolvedValue([{ ...realProperty }]);
    const text = textOf(await CrmPropertiesPage());
    expect(text).toContain('No Rooms');
    expect(text).toContain('0 rooms recorded');
    expect(text).not.toMatch(FICTIONAL_HOMES);
  });
});

describe('/crm/properties/[id]', () => {
  it('renders "No rooms have been added to this property." when there are no Room rows', async () => {
    getCrmProperty.mockResolvedValue({ ...realProperty });
    const text = textOf(await CrmPropertyDetailPage({ params: Promise.resolve({ id: 'property-1' }) }));
    expect(text).toContain('Orchard View');
    expect(text).toContain('No rooms have been added to this property.');
    expect(text).toContain('Rooms added');
    expect(text).not.toMatch(/Room 1|OCCUPIED|Restricted resident|Day \+ on-call|Void days|Review July/);
  });

  it('renders real rooms and real statuses', async () => {
    getCrmProperty.mockResolvedValue({ ...realProperty, rooms: [{ id: 'room-1', label: 'Room A', status: 'AVAILABLE', notes: 'Newly decorated' }] });
    const text = textOf(await CrmPropertyDetailPage({ params: Promise.resolve({ id: 'property-1' }) }));
    expect(text).toContain('Room A');
    expect(text).toContain('Available');
    expect(text).toContain('Newly decorated');
    expect(text).not.toContain('No rooms have been added to this property.');
  });

  it('still returns a 404 for a property that does not exist in this organisation', async () => {
    getCrmProperty.mockResolvedValue(null);
    await expect(CrmPropertyDetailPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
