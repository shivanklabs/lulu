import { api } from '../../lib/api';
import { slugify } from '../../lib/format';
import type { PublicDoctor } from '../../lib/types';

// The public directory (GET /doctors) is shared by several pages; a short cache avoids
// refetching it on every navigation (the API is rate limited per client).
const TTL_MS = 60_000;
let cache: { at: number; promise: Promise<PublicDoctor[]> } | null = null;

export const loadPublicDoctors = (): Promise<PublicDoctor[]> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = api.doctors.listPublic().catch((err: unknown) => {
    cache = null;
    throw err;
  });
  cache = { at: Date.now(), promise };
  return promise;
};

export const resetPublicDoctorsCache = (): void => {
  cache = null;
};

export interface Specialty {
  name: string;
  slug: string;
  doctorCount: number;
}

// Specialties are derived from the specialisations of verified doctors (no separate API exists)
export const specialtiesOf = (doctors: PublicDoctor[]): Specialty[] => {
  const counts = new Map<string, { name: string; count: number }>();
  for (const d of doctors) {
    const name = d.specialization.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name, count: 1 });
  }
  return Array.from(counts.values())
    .map(({ name, count }) => ({ name, slug: slugify(name), doctorCount: count }))
    .sort((a, b) => b.doctorCount - a.doctorCount || a.name.localeCompare(b.name));
};
