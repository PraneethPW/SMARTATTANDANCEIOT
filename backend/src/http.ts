import type { Request, Response, NextFunction } from "express";
import type { PoolClient } from "pg";
import { pool } from "./db.js";
export const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res).catch(next);
export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function audit(
  c: PoolClient,
  actor: string,
  action: string,
  type: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  await c.query(
    "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6)",
    [actor, action, type, id, JSON.stringify(before), JSON.stringify(after)],
  );
}
