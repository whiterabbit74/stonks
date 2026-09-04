package robinhood

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

const RedirectURI = "http://127.0.0.1:53682/callback"

var (
	AuthorizeURL = "https://robinhood.com/oauth"
	TokenURL     = "https://api.robinhood.com/oauth2/token/"
	RegisterURL  = "https://agent.robinhood.com/oauth/trading/register"
	MCPEndpoint  = "https://agent.robinhood.com/mcp/trading"
	Resource     = "https://agent.robinhood.com/mcp/trading"
)

func b64url(b []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(b), "=")
}

func RandomB64(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return b64url(buf), nil
}

func ChallengeS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return b64url(sum[:])
}

func NewPKCE() (verifier, challenge, state string, err error) {
	verifier, err = RandomB64(32)
	if err != nil {
		return "", "", "", err
	}
	state, err = RandomB64(16)
	if err != nil {
		return "", "", "", err
	}
	return verifier, ChallengeS256(verifier), state, nil
}

func AuthorizationURL(clientID, state, challenge string) string {
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", clientID)
	q.Set("redirect_uri", RedirectURI)
	q.Set("scope", "internal")
	q.Set("state", state)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	q.Set("resource", Resource)
	return AuthorizeURL + "?" + q.Encode()
}

var callbackRe = regexp.MustCompile(`https?://[^\s"'<>]+`)

func ParseCallbackURL(raw string) (code, state string, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", fmt.Errorf("empty callback")
	}
	candidate := raw
	if !strings.Contains(raw, "://") {
		if i := strings.Index(raw, "127.0.0.1"); i >= 0 {
			candidate = "http://" + raw[i:]
		}
	} else if m := callbackRe.FindString(raw); m != "" {
		candidate = strings.TrimRight(m, ".,;)")
	}
	u, perr := url.Parse(candidate)
	if perr != nil {
		return "", "", fmt.Errorf("invalid callback url")
	}
	q := u.Query()
	if q.Get("code") == "" && u.Fragment != "" {
		if fq, ferr := url.ParseQuery(u.Fragment); ferr == nil {
			q = fq
		}
	}
	code = strings.TrimSpace(q.Get("code"))
	state = strings.TrimSpace(q.Get("state"))
	if code == "" {
		return "", "", fmt.Errorf("callback missing code")
	}
	if state == "" {
		return "", "", fmt.Errorf("callback missing state")
	}
	return code, state, nil
}
