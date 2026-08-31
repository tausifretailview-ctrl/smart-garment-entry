/**
 * Minimal thenable PostgREST mock for dual-running the retail customer-ledger
 * queryFn without touching a database.
 */
export type LedgerDb = Record<string, Record<string, unknown>[]>;

type Filter = (row: Record<string, unknown>) => boolean;

function val(row: Record<string, unknown>, col: string): unknown {
  return row[col];
}

class FakeQuery {
  private filters: Filter[] = [];
  private sortCol: string | null = null;
  private sortAsc = true;
  private mode: "list" | "single" | "update" = "list";

  constructor(
    private readonly table: string,
    private readonly rows: Record<string, unknown>[],
  ) {}

  select(_cols?: string): this {
    return this;
  }

  eq(col: string, value: unknown): this {
    this.filters.push((row) => val(row, col) === value);
    return this;
  }

  neq(col: string, value: unknown): this {
    this.filters.push((row) => val(row, col) !== value);
    return this;
  }

  in(col: string, values: unknown[]): this {
    const set = new Set(values);
    this.filters.push((row) => set.has(val(row, col)));
    return this;
  }

  is(col: string, value: null): this {
    this.filters.push((row) => {
      const v = val(row, col);
      return v === value || v === undefined;
    });
    return this;
  }

  gte(col: string, value: string): this {
    this.filters.push((row) => String(val(row, col) ?? "") >= value);
    return this;
  }

  lte(col: string, value: string): this {
    this.filters.push((row) => String(val(row, col) ?? "") <= value);
    return this;
  }

  lt(col: string, value: string): this {
    this.filters.push((row) => String(val(row, col) ?? "") < value);
    return this;
  }

  or(expr: string): this {
    const parts = expr.split(",").map((p) => p.trim()).filter(Boolean);
    this.filters.push((row) =>
      parts.some((part) => {
        const m = part.match(/^(\w+)\.ilike\.%(.+)%$/i);
        if (!m) return false;
        const hay = String(val(row, m[1]) ?? "").toLowerCase();
        return hay.includes(m[2].toLowerCase());
      }),
    );
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.sortCol = col;
    this.sortAsc = opts?.ascending !== false;
    return this;
  }

  maybeSingle(): this {
    this.mode = "single";
    return this;
  }

  single(): this {
    this.mode = "single";
    return this;
  }

  update(_patch: Record<string, unknown>): this {
    this.mode = "update";
    return this;
  }

  private execute(): Record<string, unknown>[] {
    let out = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.sortCol) {
      const col = this.sortCol;
      const asc = this.sortAsc;
      out = [...out].sort((a, b) => {
        const av = String(val(a, col) ?? "");
        const bv = String(val(b, col) ?? "");
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return asc ? cmp : -cmp;
      });
    }
    return out;
  }

  then<TResult1 = unknown, TResult2 = never>(
    resolve?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const executed = this.execute();
    const payload =
      this.mode === "update"
        ? { data: null, error: null }
        : this.mode === "single"
          ? { data: executed[0] ?? null, error: null }
          : { data: executed, error: null };
    return Promise.resolve(payload).then(resolve ?? undefined, reject ?? undefined);
  }
}

export function createFakeLedgerClient(db: LedgerDb) {
  return {
    from(table: string) {
      const rows = (db[table] || []).map((r) => ({ ...r }));
      return new FakeQuery(table, rows);
    },
  };
}
