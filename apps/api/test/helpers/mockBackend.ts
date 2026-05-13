import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";

export type QueryOperation = {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete";
  select?: string;
  selectOptions?: Record<string, unknown>;
  values?: unknown;
  filters: Array<{ kind: string; column?: string; value?: unknown }>;
  orders: Array<{ column: string; ascending?: boolean }>;
  limit?: number;
  mode: "many" | "single" | "maybeSingle";
};

type QueryResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number | null;
};

type AuthMocks = {
  getUser?: (token: string) => Promise<{ data: { user: Record<string, unknown> | null }; error: unknown | null }>;
  signInWithPassword?: (credentials: { email: string; password: string }) => Promise<{
    data: { session: Record<string, unknown> | null; user: Record<string, unknown> | null };
    error: { message?: string } | null;
  }>;
  signOut?: () => Promise<{ error: unknown | null }>;
  refreshSession?: (payload: { refresh_token: string }) => Promise<{
    data: { session: Record<string, unknown> | null };
    error: { message?: string } | null;
  }>;
  admin?: {
    createUser?: (payload: Record<string, unknown>) => Promise<{
      data: { user: Record<string, unknown> | null };
      error: { message?: string } | null;
    }>;
    updateUserById?: (id: string, payload: Record<string, unknown>) => Promise<{
      data?: { user?: Record<string, unknown> | null };
      error: { message?: string } | null;
    }>;
    listUsers?: (payload: { page: number; perPage: number }) => Promise<{
      data: { users: Array<Record<string, unknown>> };
      error: { message?: string } | null;
    }>;
  };
};

class MockQueryBuilder implements PromiseLike<QueryResult> {
  private operation: QueryOperation;

  constructor(
    table: string,
    private readonly operations: QueryOperation[],
    private readonly resolver: (operation: QueryOperation) => QueryResult | Promise<QueryResult>
  ) {
    this.operation = {
      table,
      action: "select",
      filters: [],
      orders: [],
      mode: "many"
    };
  }

  select(columns: string, options?: Record<string, unknown>): this {
    if (!this.operation.action) {
      this.operation.action = "select";
    }
    this.operation.select = columns;
    this.operation.selectOptions = options;
    return this;
  }

  insert(values: unknown): this {
    this.operation.action = "insert";
    this.operation.values = values;
    return this;
  }

  update(values: unknown): this {
    this.operation.action = "update";
    this.operation.values = values;
    return this;
  }

  upsert(values: unknown): this {
    this.operation.action = "upsert";
    this.operation.values = values;
    return this;
  }

  delete(): this {
    this.operation.action = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.operation.filters.push({ kind: "eq", column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.operation.filters.push({ kind: "gt", column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.operation.filters.push({ kind: "lte", column, value });
    return this;
  }

  ilike(column: string, value: unknown): this {
    this.operation.filters.push({ kind: "ilike", column, value });
    return this;
  }

  in(column: string, value: unknown): this {
    this.operation.filters.push({ kind: "in", column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.operation.filters.push({ kind: "is", column, value });
    return this;
  }

  or(value: string): this {
    this.operation.filters.push({ kind: "or", value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.operation.orders.push({ column, ascending: options?.ascending });
    return this;
  }

  limit(value: number): this {
    this.operation.limit = value;
    return this;
  }

  single(): Promise<QueryResult> {
    this.operation.mode = "single";
    return this.execute();
  }

  maybeSingle(): Promise<QueryResult> {
    this.operation.mode = "maybeSingle";
    return this.execute();
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    const snapshot: QueryOperation = {
      ...this.operation,
      filters: [...this.operation.filters],
      orders: [...this.operation.orders]
    };
    this.operations.push(snapshot);
    const result = await this.resolver(snapshot);
    return {
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count ?? null
    };
  }
}

export function createSupabaseMock(options: {
  resolve: (operation: QueryOperation) => QueryResult | Promise<QueryResult>;
  auth?: AuthMocks;
  rpcResolver?: (
    fn: string,
    args: Record<string, unknown>
  ) => QueryResult | Promise<QueryResult>;
}) {
  const operations: QueryOperation[] = [];

  const auth = {
    getUser: async (token: string) => {
      if (options.auth?.getUser) {
        return options.auth.getUser(token);
      }
      return { data: { user: null }, error: { message: "not mocked" } };
    },
    signInWithPassword: async (credentials: { email: string; password: string }) => {
      if (options.auth?.signInWithPassword) {
        return options.auth.signInWithPassword(credentials);
      }
      return { data: { session: null, user: null }, error: { message: "not mocked" } };
    },
    signOut: async () => options.auth?.signOut?.() ?? { error: null },
    refreshSession: async (payload: { refresh_token: string }) => {
      if (options.auth?.refreshSession) {
        return options.auth.refreshSession(payload);
      }
      return { data: { session: null }, error: { message: "not mocked" } };
    },
    admin: {
      createUser: async (payload: Record<string, unknown>) => {
        if (options.auth?.admin?.createUser) {
          return options.auth.admin.createUser(payload);
        }
        return { data: { user: null }, error: { message: "not mocked" } };
      },
      updateUserById: async (id: string, payload: Record<string, unknown>) => {
        if (options.auth?.admin?.updateUserById) {
          return options.auth.admin.updateUserById(id, payload);
        }
        return { data: { user: null }, error: { message: "not mocked" } };
      },
      listUsers: async (payload: { page: number; perPage: number }) => {
        if (options.auth?.admin?.listUsers) {
          return options.auth.admin.listUsers(payload);
        }
        return { data: { users: [] }, error: null };
      }
    }
  };

  return {
    operations,
    client: {
      from(table: string) {
        return new MockQueryBuilder(table, operations, options.resolve);
      },
      auth,
      rpc: async (fn: string, args: Record<string, unknown> = {}) => {
        if (options.rpcResolver) {
          return options.rpcResolver(fn, args);
        }
        return { data: null, error: null };
      }
    }
  };
}

export function createRedisMock() {
  const counters = new Map<string, number>();

  return {
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire() {
      return 1;
    }
  };
}

export function createTestEnv(overrides: Partial<ReturnType<typeof createTestEnvBase>> = {}) {
  return {
    ...createTestEnvBase(),
    ...overrides
  };
}

function createTestEnvBase() {
  return {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    WEB_ORIGIN: "https://app.orgos.test",
    RELAX_SECURITY_FOR_LOCAL_TESTING: false,
    SLA_MONITOR_ENABLED: false,
    SLA_CHECK_INTERVAL_MS: 60_000,
    SLA_AT_RISK_WINDOW_MINUTES: 120,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    UPSTASH_REDIS_URL: "https://redis.test",
    UPSTASH_REDIS_TOKEN: "redis-token",
    GROQ_API_KEY: undefined,
    GEMINI_API_KEY: undefined,
    SENTRY_DSN: undefined,
    DATADOG_API_KEY: undefined,
    DATADOG_ENABLED: false
  };
}

export async function buildRouteTestApp(options: {
  routes: FastifyPluginAsync | FastifyPluginAsync[];
  supabaseService: unknown;
  supabaseAnon?: unknown;
  currentUser?: { id: string; role: string | null; email?: string };
  env?: Partial<ReturnType<typeof createTestEnv>>;
  beforeRoutes?: (app: FastifyInstance) => Promise<void>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorate("env", createTestEnv(options.env) as never);
  app.decorate("supabaseService", (options.supabaseService ?? {}) as never);
  app.decorate("supabaseAnon", (options.supabaseAnon ?? options.supabaseService ?? {}) as never);
  app.decorate("redis", createRedisMock() as never);

  app.addHook("onRequest", async (request) => {
    request.requestId = "test-request";
    request.user = options.currentUser
      ? ({
          id: options.currentUser.id,
          email: options.currentUser.email ?? `${options.currentUser.id}@orgos.test`,
          user_metadata: options.currentUser.role ? { role: options.currentUser.role } : {}
        } as never)
      : null;
    request.userRole = options.currentUser?.role ?? null;
  });

  if (options.beforeRoutes) {
    await options.beforeRoutes(app);
  }

  const routeList = Array.isArray(options.routes) ? options.routes : [options.routes];
  for (const route of routeList) {
    await app.register(route);
  }

  await app.ready();
  return app;
}
