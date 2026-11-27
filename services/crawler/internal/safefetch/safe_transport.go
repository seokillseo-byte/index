package safefetch

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ValidateURL accepts only HTTP(S) URLs with a globally routable destination.
// DNS is resolved again at connection time by SafeTransport to reduce rebinding risk.
func ValidateURL(raw string) (*url.URL, error) {
	u, err := url.ParseRequestURI(raw)
	if err != nil { return nil, fmt.Errorf("invalid URL: %w", err) }
	if u.Scheme != "http" && u.Scheme != "https" { return nil, errors.New("only http and https are supported") }
	if u.User != nil { return nil, errors.New("userinfo in URL is not allowed") }
	if u.Hostname() == "" { return nil, errors.New("hostname is required") }
	if strings.Contains(u.Hostname(), "%") { return nil, errors.New("scoped IP literals are not allowed") }
	if ip := net.ParseIP(u.Hostname()); ip != nil && !isPublicIP(ip) { return nil, errors.New("destination IP is not globally routable") }
	return u, nil
}

func isPublicIP(ip net.IP) bool {
	if ip == nil { return false }
	if v4 := ip.To4(); v4 != nil {
		if v4[0] == 0 || v4[0] == 10 || v4[0] == 127 || v4[0] >= 224 { return false }
		if v4[0] == 169 && v4[1] == 254 { return false }
		if v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31 { return false }
		if v4[0] == 192 && v4[1] == 168 { return false }
		if v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 { return false }
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() { return false }
	// Reject IPv4-mapped IPv6 after conversion above; reject documentation and benchmarking ranges.
	if ip.IsInterfaceLocalMulticast() { return false }
	return true
}

// SafeTransport pins each connection to a freshly resolved public IP. Redirects
// must be disabled by callers and each Location revalidated with ValidateURL.
func SafeTransport(timeout time.Duration) *http.Transport {
	dialer := &net.Dialer{Timeout: timeout, KeepAlive: 30 * time.Second}
	return &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil { return nil, err }
			if port == "" { if strings.EqualFold(network, "tcp") { port = "80" } else { port = "443" } }
			if _, err := strconv.Atoi(port); err != nil { return nil, errors.New("invalid destination port") }
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil { return nil, err }
			if len(ips) == 0 { return nil, errors.New("hostname has no addresses") }
			var lastErr error
			for _, candidate := range ips {
				if !isPublicIP(candidate.IP) { return nil, errors.New("hostname resolves to a non-public IP") }
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

// SafeClient disables automatic redirects so each hop can be validated explicitly.
func SafeClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Transport: SafeTransport(timeout),
		Timeout: timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
}
