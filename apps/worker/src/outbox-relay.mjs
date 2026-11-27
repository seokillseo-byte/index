import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { Kafka } from 'kafkajs';

const { Pool } = pg;
const required = ['OUTBOX_DATABASE_URL', 'KAFKA_BROKERS'];
for (const key of required) if (!process.env[key]) throw new Error(key + ' is required');
const pool = new Pool({ connectionString: process.env.OUTBOX_DATABASE_URL, max: 8, application_name: 'index-assist-outbox-relay' });
const kafka = new Kafka({
  clientId: 'index-assist-outbox-relay',
  brokers: process.env.KAFKA_BROKERS.split(',').map(x => x.trim()),
  connectionTimeout: 5000,
  requestTimeout: 30000,
});
const producer = kafka.producer({ allowAutoTopicCreation: false, idempotent: true, maxInFlightRequests: 1 });
const batchSize = Math.min(Number(process.env.OUTBOX_BATCH_SIZE || 100), 500);
const idleMs = Number(process.env.OUTBOX_IDLE_MS || 500);
let stopping = false;

async function publishBatch() {
  const client = await pool.connect();
  let rows = [];
  const leaseOwner = randomUUID();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      "SELECT id,topic,partition_key,event_type,payload,attempts FROM app.outbox_events WHERE published_at IS NULL AND next_attempt_at <= now() AND (lease_expires_at IS NULL OR lease_expires_at < now()) ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED",
      [batchSize],
    );
    rows = result.rows;
    if (rows.length) {
      await client.query("UPDATE app.outbox_events SET lease_owner=$1,lease_expires_at=now()+interval '10 minutes' WHERE id=ANY($2::uuid[])", [leaseOwner, rows.map(row => row.id)]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (!rows.length) return 0;

  for (const row of rows) {
    try {
      await producer.send({
        topic: row.topic,
        acks: -1,
        messages: [{
          key: row.partition_key,
          value: JSON.stringify({ id: row.id, type: row.event_type, payload: row.payload }),
          headers: { 'event-id': String(row.id), 'event-type': row.event_type },
        }],
      });
      await pool.query('UPDATE app.outbox_events SET published_at=now(),last_error=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_owner=$2 AND published_at IS NULL', [row.id, leaseOwner]);
    } catch (error) {
      const attempts = Number(row.attempts) + 1;
      const delaySeconds = Math.min(3600, 2 ** Math.min(attempts, 10));
      await pool.query(
        "UPDATE app.outbox_events SET attempts=$2,next_attempt_at=now()+($3::text || ' seconds')::interval,last_error=$4,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_owner=$5 AND published_at IS NULL",
        [row.id, attempts, delaySeconds, String(error).slice(0, 2000), leaseOwner],
      );
    }
  }
  return rows.length;
}

async function shutdown() {
  stopping = true;
  try { await producer.disconnect(); } finally { await pool.end(); }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await producer.connect();
console.log('Index Assist outbox relay started');
while (!stopping) {
  try {
    const count = await publishBatch();
    if (count === 0) await new Promise(resolve => setTimeout(resolve, idleMs));
  } catch (error) {
    console.error('Outbox relay cycle failed', error);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
