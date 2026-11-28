package main

import (
 "os"
 "path/filepath"
 "testing"
)

func clearKafkaSecurityEnv(t *testing.T) {
 t.Helper()
 for _,key:=range []string{"KAFKA_SASL_USERNAME","KAFKA_SASL_PASSWORD","KAFKA_SASL_MECHANISM","KAFKA_TLS_CA_FILE"} {
  t.Setenv(key,"")
 }
}

func TestKafkaDialerDefaultsToCompatibilityMode(t *testing.T) {
 clearKafkaSecurityEnv(t)
 dialer,err:=kafkaDialerFromEnv()
 if err!=nil{t.Fatal(err)}
 if dialer.TLS!=nil||dialer.SASLMechanism!=nil{t.Fatal("unexpected Kafka security configuration")}
}

func TestKafkaDialerRejectsPartialSCRAMConfiguration(t *testing.T) {
 clearKafkaSecurityEnv(t)
 t.Setenv("KAFKA_SASL_USERNAME","crawler")
 if _,err:=kafkaDialerFromEnv();err==nil{t.Fatal("expected incomplete SCRAM configuration to fail")}
}

func TestKafkaDialerRejectsInvalidCAFile(t *testing.T) {
 clearKafkaSecurityEnv(t)
 path:=filepath.Join(t.TempDir(),"ca.pem")
 if err:=os.WriteFile(path,[]byte("not a certificate"),0600);err!=nil{t.Fatal(err)}
 t.Setenv("KAFKA_TLS_CA_FILE",path)
 if _,err:=kafkaDialerFromEnv();err==nil{t.Fatal("expected invalid CA file to fail")}
}
