import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId: string;
  userId?: string;
  tenantId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function getUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}

export function setUserId(userId: string): void {
  const store = requestContext.getStore();
  if (store) store.userId = userId;
}

export function getTenantId(): string | undefined {
  return requestContext.getStore()?.tenantId;
}

export function setTenantId(tenantId: string): void {
  const store = requestContext.getStore();
  if (store) store.tenantId = tenantId;
}
