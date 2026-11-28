import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildKafkaConfig} from '../src/kafka-config.mjs';

test('Kafka client requires complete TLS-protected SCRAM configuration',()=>{
  assert.throws(()=>buildKafkaConfig({KAFKA_BROKERS:'broker:9092',KAFKA_SASL_USERNAME:'relay'}),/requires username, password and KAFKA_TLS_CA_FILE/);
  assert.throws(()=>buildKafkaConfig({KAFKA_BROKERS:'broker:9092',KAFKA_SASL_USERNAME:'relay',KAFKA_SASL_PASSWORD:'secret',KAFKA_SASL_MECHANISM:'plain',KAFKA_TLS_CA_FILE:'/ca.pem'}),/SCRAM-SHA-512/);
});

test('production Kafka clients reject plaintext configuration',()=>{
  assert.throws(()=>buildKafkaConfig({NODE_ENV:'production',KAFKA_BROKERS:'broker:9092'}),/require TLS and SCRAM-SHA-512/);
});

test('Kafka client enables certificate-verified TLS and SCRAM-SHA-512',()=>{
  const dir=mkdtempSync(join(tmpdir(),'index-kafka-'));
  try {
    const ca=join(dir,'ca.pem');
    writeFileSync(ca,'test-ca');
    const config=buildKafkaConfig({
      KAFKA_BROKERS:'broker-a:9092, broker-b:9092',
      KAFKA_CLIENT_ID:'test-client',
      KAFKA_TLS_CA_FILE:ca,
      KAFKA_SASL_USERNAME:'crawler',
      KAFKA_SASL_PASSWORD:'test-secret',
      KAFKA_SASL_MECHANISM:'scram-sha-512',
    });
    assert.deepEqual(config.brokers,['broker-a:9092','broker-b:9092']);
    assert.equal(config.ssl.rejectUnauthorized,true);
    assert.equal(config.ssl.ca[0].toString(),'test-ca');
    assert.deepEqual(config.sasl,{mechanism:'scram-sha-512',username:'crawler',password:'test-secret'});
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('Kafka TLS can be enabled without SASL for a separately controlled test listener',()=>{
  const dir=mkdtempSync(join(tmpdir(),'index-kafka-'));
  try {
    const ca=join(dir,'ca.pem'); writeFileSync(ca,'test-ca');
    const config=buildKafkaConfig({KAFKA_BROKERS:'broker:9092',KAFKA_TLS_CA_FILE:ca});
    assert.equal(config.ssl.rejectUnauthorized,true);
    assert.equal(config.sasl,undefined);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
