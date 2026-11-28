import {readFileSync} from 'node:fs';

export function buildKafkaConfig(env=process.env) {
  const brokers=(env.KAFKA_BROKERS||'').split(',').map(value=>value.trim()).filter(Boolean);
  if(!brokers.length) throw new Error('KAFKA_BROKERS is required');

  const username=env.KAFKA_SASL_USERNAME||'';
  const password=env.KAFKA_SASL_PASSWORD||'';
  const mechanism=(env.KAFKA_SASL_MECHANISM||'').toLowerCase();
  const caFile=env.KAFKA_TLS_CA_FILE||'';
  const hasSasl=Boolean(username||password||mechanism);
  if(hasSasl && (!username||!password||mechanism!=='scram-sha-512'||!caFile)) {
    throw new Error('Kafka SCRAM-SHA-512 requires username, password and KAFKA_TLS_CA_FILE');
  }

  const config={
    clientId:env.KAFKA_CLIENT_ID||'index-assist-worker',
    brokers,
    connectionTimeout:5000,
    requestTimeout:30000,
    enforceRequestTimeout:true,
  };
  if(caFile) config.ssl={ca:[readFileSync(caFile)],rejectUnauthorized:true};
  if(hasSasl) config.sasl={mechanism:'scram-sha-512',username,password};
  return config;
}
