/**
 * Equipment browse + host category taxonomy (Phase 4).
 * `match` values are stored on listing attributes.category and used for chip filters.
 */

export const EQUIPMENT_CATEGORY_DEFS = [
  { id: 'all', labelKey: 'events.categories.all', color: '#2563eb', match: null },
  { id: 'photography', labelKey: 'equipment.categories.photography', color: '#7c3aed', match: 'Photography' },
  { id: 'avSound', labelKey: 'equipment.categories.avSound', color: '#0891b2', match: 'AV & Sound' },
  { id: 'construction', labelKey: 'equipment.categories.construction', color: '#ca8a04', match: 'Construction' },
  { id: 'outdoor', labelKey: 'equipment.categories.outdoor', color: '#059669', match: 'Outdoor' },
  { id: 'party', labelKey: 'equipment.categories.party', color: '#db2777', match: 'Party' },
  { id: 'sports', labelKey: 'equipment.categories.sports', color: '#dc2626', match: 'Sports' },
  { id: 'kitchen', labelKey: 'equipment.categories.kitchen', color: '#ea580c', match: 'Kitchen' },
  { id: 'lighting', labelKey: 'equipment.categories.lighting', color: '#f59e0b', match: 'Lighting' },
];
