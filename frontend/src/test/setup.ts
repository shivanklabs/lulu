import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetPublicDoctorsCache } from '../features/doctors/doctor-data';

// jsdom does not implement scrolling; ScrollToTop calls it on every navigation
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetPublicDoctorsCache();
  vi.restoreAllMocks();
});
