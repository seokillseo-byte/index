package main

import (
 "crypto/tls"
 "crypto/x509"
 "fmt"
 "os"
 "strings"
 "time"

 "github.com/segmentio/kafka-go"
 "github.com/segmentio/kafka-go/sasl/scram"
)

func kafkaDialerFromEnv() (*kafka.Dialer,error) {
 dialer:=&kafka.Dialer{Timeout:10*time.Second,DualStack:true}
 username:=os.Getenv("KAFKA_SASL_USERNAME")
 password:=os.Getenv("KAFKA_SASL_PASSWORD")
 mechanism:=strings.ToLower(os.Getenv("KAFKA_SASL_MECHANISM"))
 caFile:=os.Getenv("KAFKA_TLS_CA_FILE")
 hasSASL:=username!=""||password!=""||mechanism!=""
 if os.Getenv("NODE_ENV")=="production"&&!hasSASL {
  return nil,fmt.Errorf("production Kafka clients require TLS and SCRAM-SHA-512 authentication")
 }
 if hasSASL {
  if username==""||password==""||mechanism!="scram-sha-512"||caFile=="" {
   return nil,fmt.Errorf("Kafka SCRAM-SHA-512 requires username, password and KAFKA_TLS_CA_FILE")
  }
  scramMechanism,err:=scram.Mechanism(scram.SHA512,username,password)
  if err!=nil{return nil,fmt.Errorf("configure Kafka SCRAM: %w",err)}
  dialer.SASLMechanism=scramMechanism
 }
 if caFile!="" {
  pem,err:=os.ReadFile(caFile);if err!=nil{return nil,fmt.Errorf("read Kafka CA file: %w",err)}
  roots:=x509.NewCertPool()
  if !roots.AppendCertsFromPEM(pem){return nil,fmt.Errorf("Kafka CA file contains no valid certificates")}
  dialer.TLS=&tls.Config{MinVersion:tls.VersionTLS12,RootCAs:roots}
 }
 return dialer,nil
}
