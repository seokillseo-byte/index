package main

import "testing"

func TestExtractBacklinksMatchesResolvedTarget(t *testing.T) {
 body:=[]byte(`<!doctype html><html><body>
 <a href="https://target.example/path#section" rel="nofollow sponsored">Target page</a>
 <a href="/unrelated">Other</a>
 <a href="https://target.example/path">Second <strong>target</strong></a>
 </body></html>`)
 got,err:=extractBacklinks(body,"https://source.example/article","https://target.example/path")
 if err!=nil{t.Fatal(err)}
 if len(got)!=2{t.Fatalf("expected 2 matching backlinks, got %d",len(got))}
 if got[0].LinkType!="sponsored"{t.Fatalf("expected sponsored link type, got %s",got[0].LinkType)}
 if got[1].TargetURL!="https://target.example/path"{t.Fatalf("unexpected canonical target: %s",got[1].TargetURL)}
}

func TestExtractBacklinksIgnoresNonMatchingAndUnsafeSchemes(t *testing.T) {
 body:=[]byte(`<a href="javascript:alert(1)">bad</a><a href="https://other.example/">other</a>`)
 got,err:=extractBacklinks(body,"https://source.example/","https://target.example/")
 if err!=nil{t.Fatal(err)}
 if len(got)!=0{t.Fatalf("expected no matching links, got %d",len(got))}
}

func TestCanonicalURLRemovesFragmentAndDefaultPort(t *testing.T){
 got,err:=canonicalURL("HTTPS://Target.Example:443/path#anchor")
 if err!=nil{t.Fatal(err)}
 if got!="https://target.example/path"{t.Fatalf("unexpected canonical URL: %s",got)}
}
