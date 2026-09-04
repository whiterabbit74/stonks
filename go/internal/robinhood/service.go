package robinhood

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"mktorder.com/go/internal/store"
)

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	Scope        string `json:"scope"`
	ExpiresIn    int    `json:"expires_in"`
}

type Service struct {
	DB   *store.DB
	HTTP *http.Client
	MCP  *MCP

	mu sync.Mutex
}

func New(db *store.DB) *Service {
	s := &Service{DB: db, HTTP: &http.Client{Timeout: 20 * time.Second}}
	s.MCP = &MCP{HTTP: s.HTTP, Endpoint: MCPEndpoint, Token: s.AccessToken}
	return s
}

func (s *Service) http() *http.Client {
	if s.HTTP != nil {
		return s.HTTP
	}
	s.HTTP = &http.Client{Timeout: 20 * time.Second}
	return s.HTTP
}

func (s *Service) RegisterClient() (string, error) {
	if s.DB != nil {
		if id := strings.TrimSpace(s.DB.GetRobinhoodOAuth().ClientID); id != "" {
			return id, nil
		}
	}
	body, _ := json.Marshal(map[string]any{
		"client_name":                "mktorder",
		"redirect_uris":              []string{RedirectURI},
		"grant_types":                []string{"authorization_code", "refresh_token"},
		"response_types":             []string{"code"},
		"token_endpoint_auth_method": "none",
		"scope":                      "internal",
	})
	resp, err := s.http().Post(RegisterURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("dcr http %d: %s", resp.StatusCode, redactSecrets(string(raw)))
	}
	var parsed struct {
		ClientID string `json:"client_id"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}
	if parsed.ClientID == "" {
		return "", fmt.Errorf("dcr missing client_id")
	}
	if s.DB != nil {
		if err := s.DB.SaveRobinhoodClientID(parsed.ClientID); err != nil {
			return "", err
		}
	}
	return parsed.ClientID, nil
}

func (s *Service) StartOAuth() (authURL string, err error) {
	clientID, err := s.RegisterClient()
	if err != nil {
		return "", err
	}
	verifier, challenge, state, err := NewPKCE()
	if err != nil {
		return "", err
	}
	if s.DB != nil {
		if err := s.DB.SaveRobinhoodPending(state, verifier, RedirectURI); err != nil {
			return "", err
		}
	}
	return AuthorizationURL(clientID, state, challenge), nil
}

func (s *Service) CompleteFromCallbackURL(raw string) error {
	code, state, err := ParseCallbackURL(raw)
	if err != nil {
		return err
	}
	if s.DB == nil {
		return fmt.Errorf("oauth store missing")
	}
	verifier, redirect, err := s.DB.TakeRobinhoodPending(state)
	if err != nil {
		return err
	}
	if redirect == "" {
		redirect = RedirectURI
	}
	row := s.DB.GetRobinhoodOAuth()
	tok, err := s.exchange(url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirect},
		"client_id":     {row.ClientID},
		"code_verifier": {verifier},
		"resource":      {Resource},
	})
	if err != nil {
		return err
	}
	return s.persistToken(tok)
}

func (s *Service) AccessToken() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.DB == nil {
		return "", fmt.Errorf("oauth store missing")
	}
	row := s.DB.GetRobinhoodOAuth()
	if row.AccessToken == "" {
		return "", fmt.Errorf("robinhood not connected")
	}
	if expiringSoon(row.ExpiresAt, time.Now()) {
		if err := s.refreshLocked(); err != nil {
			return "", err
		}
		row = s.DB.GetRobinhoodOAuth()
	}
	return row.AccessToken, nil
}

func (s *Service) Refresh() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.refreshLocked()
}

func (s *Service) refreshLocked() error {
	if s.DB == nil {
		return fmt.Errorf("oauth store missing")
	}
	row := s.DB.GetRobinhoodOAuth()
	if row.RefreshToken == "" {
		return fmt.Errorf("robinhood needs reauth")
	}
	tok, err := s.exchange(url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {row.RefreshToken},
		"client_id":     {row.ClientID},
		"scope":         {"internal"},
	})
	if err != nil {
		return err
	}
	return s.persistToken(tok)
}

func (s *Service) Revoke() error {
	if s.DB == nil {
		return nil
	}
	return s.DB.ClearRobinhoodTokens()
}

func (s *Service) Status() string {
	if s.DB == nil {
		return "MISSING"
	}
	row := s.DB.GetRobinhoodOAuth()
	if row.AccessToken == "" && row.RefreshToken == "" {
		return "MISSING"
	}
	return row.LastCheckStatus
}

func (s *Service) persistToken(tok TokenResponse) error {
	if tok.AccessToken == "" {
		return fmt.Errorf("token response missing access_token")
	}
	exp := ""
	if tok.ExpiresIn > 0 {
		exp = time.Now().UTC().Add(time.Duration(tok.ExpiresIn) * time.Second).Format(time.RFC3339)
	}
	return s.DB.SaveRobinhoodTokens(tok.AccessToken, tok.RefreshToken, tok.TokenType, tok.Scope, exp)
}

func (s *Service) exchange(form url.Values) (TokenResponse, error) {
	req, err := http.NewRequest(http.MethodPost, TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return TokenResponse{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.http().Do(req)
	if err != nil {
		return TokenResponse{}, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 400 || resp.StatusCode == 401 {
		return TokenResponse{}, fmt.Errorf("NEEDS_REAUTH")
	}
	if resp.StatusCode >= 300 {
		return TokenResponse{}, fmt.Errorf("token http %d", resp.StatusCode)
	}
	var tok TokenResponse
	if err := json.Unmarshal(raw, &tok); err != nil {
		return TokenResponse{}, err
	}
	return tok, nil
}

func ParseTokenJSON(raw []byte) (TokenResponse, error) {
	var tok TokenResponse
	if err := json.Unmarshal(raw, &tok); err != nil {
		return TokenResponse{}, err
	}
	return tok, nil
}

func expiringSoon(expiresAt string, now time.Time) bool {
	expiresAt = strings.TrimSpace(expiresAt)
	if expiresAt == "" {
		return false
	}
	t, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, expiresAt)
	}
	if err != nil {
		return false
	}
	return t.Sub(now) <= 24*time.Hour
}

func (s *Service) CallTool(name string, args map[string]any) (json.RawMessage, error) {
	if s.MCP == nil {
		s.MCP = &MCP{HTTP: s.http(), Endpoint: MCPEndpoint, Token: s.AccessToken}
	}
	raw, err := s.MCP.CallTool(name, args)
	if err != nil && strings.Contains(err.Error(), "unauthorized") {
		if rerr := s.Refresh(); rerr != nil {
			return nil, fmt.Errorf("NEEDS_REAUTH")
		}
		s.MCP.mu.Lock()
		s.MCP.ready = false
		s.MCP.session = ""
		s.MCP.mu.Unlock()
		return s.MCP.CallTool(name, args)
	}
	return raw, err
}
