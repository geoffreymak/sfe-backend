import type {
  Connection,
  Query,
  Schema,
  Aggregate,
  HydratedDocument,
  CallbackWithoutResultAndOptionalError,
} from 'mongoose';
import { requestContext } from '../logger/request-context';

// Global plugin that injects tenantId into queries for schemas that have a tenantId path
export function MultiTenantPlugin(schema: Schema) {
  if (!schema.path('tenantId')) {
    // Do nothing if schema is not tenant-scoped
    return;
  }

  const injectFilter = (query: Query<any, any>) => {
    type QueryWithGetOptions = { getOptions?: () => unknown };
    const rawOpts = (query as unknown as QueryWithGetOptions).getOptions?.();
    const opts = (rawOpts ?? {}) as { skipTenant?: boolean };
    if (opts?.skipTenant === true) return;
    const store = requestContext.getStore();
    const tenantId = store?.tenantId;
    if (!tenantId) return; // no tenant context -> let it pass (guards should enforce it)

    const filter = query.getFilter() || {};
    if (!('tenantId' in filter)) {
      query.setQuery({ ...filter, tenantId });
    }
  };

  // Query middleware
  // Use RegExp and specific registrations because Mongoose v8 typings do not accept string[] here
  schema.pre(/^find/, function (this: Query<any, any>) {
    injectFilter(this);
  });

  schema.pre(/^count/, function (this: Query<any, any>) {
    injectFilter(this);
  });

  schema.pre(/^(update|delete)/, function (this: Query<any, any>) {
    injectFilter(this);
  });

  // Aggregate middleware
  schema.pre(
    'aggregate',
    function (
      this: Aggregate<unknown> & { options?: { skipTenant?: boolean } },
    ) {
      if (this.options?.skipTenant === true) return;
      const store = requestContext.getStore();
      const tenantId = store?.tenantId;
      if (!tenantId) return;
      const pipeline = this.pipeline();
      // Only inject if not already matched
      const hasMatch = pipeline.some(
        (stage) =>
          '$match' in stage &&
          (stage as { $match: { tenantId?: unknown } }).$match.tenantId != null,
      );
      if (!hasMatch) {
        this.pipeline().unshift({ $match: { tenantId } });
      }
    },
  );

  // Save middleware: set tenantId if missing
  schema.pre(
    'save',
    { document: true, query: false },
    function (
      this: HydratedDocument<{ tenantId?: string }>,
      next: CallbackWithoutResultAndOptionalError,
    ) {
      if (!this.tenantId) {
        const store = requestContext.getStore();
        if (store?.tenantId) this.tenantId = store.tenantId;
      }
      next();
    },
  );
}

// Helper to apply plugin on a connection
export function applyMultiTenantPlugin(conn: Connection) {
  conn.plugin(MultiTenantPlugin);
}
