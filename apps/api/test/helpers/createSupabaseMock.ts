type Row = Record<string, unknown>;

type TableName =
  | "users"
  | "goals"
  | "tasks"
  | "reports"
  | "agent_logs"
  | "orgs"
  | "positions"
  | "routing_suggestions"
  | "audit_log"
  | "embeddings";

export type FixtureStore = Partial<Record<TableName, Row[]>>;

function matchesFilters(row: Row, filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }>): boolean {
  return filters.every((filter) => {
    const value = row[filter.column];
    if (filter.kind === "eq") {
      return value === filter.value;
    }

    return Array.isArray(filter.value) ? filter.value.includes(value) : false;
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createSupabaseMock(fixtures: FixtureStore) {
  const store: Record<TableName, Row[]> = {
    users: clone(fixtures.users ?? []),
    goals: clone(fixtures.goals ?? []),
    tasks: clone(fixtures.tasks ?? []),
    reports: clone(fixtures.reports ?? []),
    agent_logs: clone(fixtures.agent_logs ?? []),
    orgs: clone(fixtures.orgs ?? []),
    positions: clone(fixtures.positions ?? []),
    routing_suggestions: clone(fixtures.routing_suggestions ?? []),
    audit_log: clone(fixtures.audit_log ?? []),
    embeddings: clone((fixtures as Partial<Record<string, Row[]>>).embeddings ?? [])
  };

  function query(table: TableName) {
    const filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }> = [];
    let action: "select" | "insert" | "update" = "select";
    let updatePatch: Row | null = null;
    let insertPayload: Row | Row[] | null = null;

    const execute = async (): Promise<{ data: Row | Row[] | null; error: null }> => {
      const rows = store[table];

      if (action === "insert") {
        const payload = Array.isArray(insertPayload) ? insertPayload : insertPayload ? [insertPayload] : [];
        for (const item of payload) {
          rows.push(clone(item));
        }
        return { data: payload[0] ?? null, error: null };
      }

      const matches = rows.filter((row) => matchesFilters(row, filters));

      if (action === "update") {
        for (const row of matches) {
          Object.assign(row, updatePatch ?? {});
        }
        return { data: matches, error: null };
      }

      return { data: matches, error: null };
    };

    const builder = {
      select(_columns?: string) {
        if (action === "select") {
          action = "select";
        }
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: "eq", column, value });
        return builder;
      },
      in(column: string, value: unknown[]) {
        filters.push({ kind: "in", column, value });
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      gt() {
        return builder;
      },
      update(patch: Row) {
        action = "update";
        updatePatch = patch;
        return builder;
      },
      insert(payload: Row | Row[]) {
        action = "insert";
        insertPayload = payload;
        return builder;
      },
      async maybeSingle() {
        const result = await execute();
        const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        return { data, error: null };
      },
      async single() {
        const result = await execute();
        const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        if (!data) {
          return { data: null, error: new Error(`No rows returned for ${table}`) };
        }
        return { data, error: null };
      },
      then(resolve: (value: { data: Row | Row[] | null; error: null }) => void, reject: (reason?: unknown) => void) {
        execute().then(resolve).catch(reject);
      }
    };

    return builder;
  }

  return {
    store,
    from(table: TableName) {
      return query(table);
    }
  };
}