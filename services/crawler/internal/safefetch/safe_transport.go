package safefetch

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var blockedPrefixes = mustPrefixes(
	"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24",
	"192.88.99.0/24", "198.18.0.0/15", "198.51.100.0/24",
	"203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
	"100::/64", "2001:2::/48", "2001:db8::/32", "2002::/16",
	"3fff::/20", "64:ff9b::/96", "64:ff9b:1::/48", "::/96",
)

func mustPrefixes(values ...string) []netip.Prefix {
	prefixes := make([]netip.Prefix, 0, len(values))
	for _, value := range values {
		prefixes = append(prefixes, netip.MustParsePrefix(value))
	}
	return prefixes
}

// ValidateURL accepts only HTTP(S) URLs. Destination IP validation is repeated
// at dial time to mitigate DNS rebinding and redirect-based SSRF.
func ValidateURL(raw string) (*url.URL, error) {
	u, err := url.ParseRequestURI(raw)
	if err != nil { return nil, fmt.Errorf("invalid URL: %w", err) }
	if u.Scheme != "http" && u.Scheme != "https" { return nil, errors.New("only http and https are supported") }
	if u.User != nil { return nil, errors.New("userinfo in URL is not allowed") }
	if u.Hostname() == "" { return nil, errors.New("hostname is required") }
 if port:=u.Port(); port!="" {
  expected:="80";if u.Scheme=="https"{expected="443"}
  if port!=expected{return nil,errors.New("only standard HTTP and HTTPS ports are allowed")}
 }
	if strings.Contains(u.Hostname(), "%") { return nil, errors.New("scoped IP literals are not allowed") }
	if ip := net.ParseIP(u.Hostname()); ip != nil && !isPublicIP(ip) { return nil, errors.New("destination IP is not globally routable") }
	return u, nil
}

func isPublicIP(ip net.IP) bool {
	addr, ok := netip.AddrFromSlice(ip)
	if !ok { return false }
	addr = addr.Unmap()
	if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() ||
		addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsMulticast() || addr.IsUnspecified() {
		return false
	}
	for _, prefix := range blockedPrefixes {
		if prefix.Contains(addr) { return false }
	}
	return true
}

// SafeTransport pins each connection to a freshly resolved public IP. Callers
// must manually follow redirects and re-run ValidateURL for every Location.
func SafeTransport(timeout time.Duration) *http.Transport {
	dialer := &net.Dialer{Timeout: timeout, KeepAlive: 30 * time.Second}
	return &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil { return nil, err }
			if port == "" { return nil, errors.New("destination port is required") }
			if _, err := strconv.Atoi(port); err != nil { return nil, errors.New("invalid destination port") }
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil { return nil, err }
			if len(ips) == 0 { return nil, errors.New("hostname has no addresses") }
			for _, candidate := range ips {
				if !isPublicIP(candidate.IP) { return nil, errors.New("hostname resolves to a non-public IP") }
			}
			var lastErr error
			for _, candidate := range ips {
				conn, dialErr := dialer.DialContext(ctx, "tcp", net.JoinHostPort(candidate.IP.String(), port))
				if dialErr == nil { return conn, nil }
				lastErr = dialErr
			}
			return nil, lastErr
		},
		TLSHandshakeTimeout: 8 * time.Second,
		ResponseHeaderTimeout: 12 * time.Second,
		IdleConnTimeout: 30 * time.Second,
		MaxIdleConns: 100,
		MaxIdleConnsPerHost: 2,
	}
}

// SafeClient disables automatic redirects so every hop can be revalidated.
func SafeClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Transport: SafeTransport(timeout),
		Timeout: timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
}
