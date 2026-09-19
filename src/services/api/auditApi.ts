import { api } from '../apiClient';
import type { ApiPage } from './catalogApi';

/** Audit trail and API performance. */

export interface AuditRow {
  auditId: number;
  userId: string | null;
  username: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  apiPath: string | null;
  httpMethod: string | null;
  currentPage: string | null;
  previousPage: string | null;
  result: 'success' | 'failure' | 'denied';
  statusCode: number | null;
  errorMessage: string | null;
  ipAddress: string | null;
  correlationId: string | null;
  occurredAtUtc: string;
  hasOldValue: boolean;
  hasNewValue: boolean;
}

export interface EndpointPerformance {
  apiPath: string;
  httpMethod: string;
  calls: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  avgDatabaseMs: number;
  failures: number;
  failurePercent: number;
  rating: 'Excellent' | 'Good' | 'Acceptable' | 'Slow' | 'Critical';
}

export const auditApi = {
  list(query: {
    userId?: string;
    action?: string;
    module?: string;
    entityId?: string;
    result?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    return api.get<ApiPage<AuditRow>>('/api/audit', { query });
  },

  /** Full detail including the before and after payloads. */
  get(auditId: number) {
    return api.get<Record<string, unknown>>(`/api/audit/${auditId}`);
  },

  filters() {
    return api.get<{
      actions: string[];
      modules: string[];
      users: { userId: string; username: string }[];
    }>('/api/audit/filters');
  },

  performance(query: { from?: string; to?: string } = {}) {
    return api.get<{
      endpoints: EndpointPerformance[];
      summary: {
        totalCalls: number;
        avgMs: number;
        worstMs: number;
        failures: number;
        criticalCalls: number;
        slowCalls: number;
      };
    }>('/api/audit/performance', { query });
  },

  slow(thresholdMs = 300, take = 50) {
    return api.get<{
      requests: Record<string, unknown>[];
      queries: Record<string, unknown>[];
    }>('/api/audit/performance/slow', { query: { thresholdMs, take } });
  },

  nPlusOne() {
    return api.get<Record<string, unknown>[]>('/api/audit/performance/nplusone');
  },
};
