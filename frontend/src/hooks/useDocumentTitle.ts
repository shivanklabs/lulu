import { useEffect } from 'react';
import { config } from '../config/env';

export const useDocumentTitle = (title: string): void => {
  useEffect(() => {
    document.title = title ? `${title} · ${config.appName}` : `${config.appName} — Healthcare Coordination`;
  }, [title]);
};
