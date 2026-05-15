'use client';

import { useCallback, useEffect, useState } from 'react';

import type {
  DashboardLoadIssue,
  FirstRunSourceReadinessPayload,
  IntegrationStatusPayload,
} from './dashboard-page-model';

type SessionStatus = 'authenticated' | 'loading' | 'unauthenticated';

export function useDashboardSourceStatus(
  status: SessionStatus,
  setLoadIssue: (issue: DashboardLoadIssue, failed: boolean) => void,
) {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusPayload | null>(null);
  const [sourceReadiness, setSourceReadiness] = useState<FirstRunSourceReadinessPayload | null>(null);

  const loadIntegrationStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/status');
      if (!response.ok) {
        setLoadIssue('integrations', true);
        setIntegrationStatus(null);
        return;
      }
      const payload = (await response.json().catch(() => null)) as IntegrationStatusPayload | null;
      setLoadIssue('integrations', payload === null);
      setIntegrationStatus(payload);
    } catch {
      setLoadIssue('integrations', true);
      setIntegrationStatus(null);
    }
  }, [setLoadIssue]);

  const loadSourceReadiness = useCallback(async () => {
    try {
      const response = await fetch('/api/source-readiness');
      if (!response.ok) {
        setSourceReadiness(null);
        return;
      }
      const payload = (await response.json().catch(() => null)) as FirstRunSourceReadinessPayload | null;
      setSourceReadiness(payload);
    } catch {
      setSourceReadiness(null);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setIntegrationStatus(null);
      setSourceReadiness(null);
      setLoadIssue('integrations', false);
      return;
    }
    void loadIntegrationStatus();
    void loadSourceReadiness();
  }, [loadIntegrationStatus, loadSourceReadiness, setLoadIssue, status]);

  return {
    integrationStatus,
    sourceReadiness,
    loadIntegrationStatus,
    loadSourceReadiness,
  };
}
