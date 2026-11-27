package safefetch

import (
	"net"
	"testing"
)

func TestValidateURLRejectsUnsafeDestinations(t *testing.T) {
	cases := []string{
		"http://127.0.0.1/",
		"http://10.0.0.2/",
		"http://169.254.169.254/latest/meta-data/",
		"http://192.0.2.10/",
		"http://[::1]/",
		"http://[fd00::1]/",
		"file:///etc/passwd",
		"javascript:alert(1)",
		"http://user:pass@example.com/",
	}
	for _, input := range cases {
		t.Run(input, func(t *testing.T) {
			if _, err := ValidateURL(input); err == nil {
				t.Fatalf("expected URL to be rejected: %s", input)
			}
		})
	}
}

func TestValidateURLAcceptsPublicHTTPURL(t *testing.T) {
	if _, err := ValidateURL("https://example.com/path?q=1"); err != nil {
		t.Fatalf("expected syntactically valid public URL, got: %v", err)
	}
}

func TestPublicIPClassification(t *testing.T) {
	cases := []struct { ip string; want bool }{
		{"8.8.8.8", true}, {"1.1.1.1", true}, {"127.0.0.1", false},
		{"10.1.2.3", false}, {"172.16.0.1", false}, {"192.168.1.1", false},
		{"100.64.0.1", false}, {"198.51.100.4", false}, {"203.0.113.4", false},
		{"224.0.0.1", false}, {"2606:4700:4700::1111", true}, {"::1", false},
		{"fc00::1", false}, {"fe80::1", false}, {"2001:db8::1", false},
	}
	for _, tc := range cases {
		t.Run(tc.ip, func(t *testing.T) {
			if got := isPublicIP(net.ParseIP(tc.ip)); got != tc.want {
				t.Fatalf("isPublicIP(%s) = %v, want %v", tc.ip, got, tc.want)
			}
		})
	}
}
