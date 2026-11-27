import { Global, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;
  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({
      connectionString, max: Number(config.get<string>('DB_POOL_MAX') ?? 20),
      idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000, query_timeout: 20_000,
      application_name: 'index-assist-api',
      ssl: config.get<string>('DATABASE_SSL') === 'true' ? { rejectUnauthorized: true } : undefined,
    });
    this.pool.on('error', error => this.logger.error('Unexpected PostgreSQL pool error', error.stack));
  }
  query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }
  async withTransaction<T>(work: (client: PoolClient) => Promise<T>, tenantId?: string): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (tenantId) await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async onApplicationShutdown(): Promise<void> { await this.pool.end(); }
}
@Global()
@Module({ providers:[DatabaseService], exports:[DatabaseService] })
export class DatabaseModule {}
