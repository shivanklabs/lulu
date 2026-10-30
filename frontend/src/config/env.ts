// Only public, non-secret values belong here (VITE_* variables are embedded in the bundle).
export const config = {
  apiUrl: (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, ''),
  appName: import.meta.env.VITE_APP_NAME || 'MediBridge',
};
