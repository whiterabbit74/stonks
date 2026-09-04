package robinhood

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const mcpProtocolVersion = "2025-06-18"

var bearerRe = regexp.MustCompile(`(?i)(Bearer\s+)[A-Za-z0-9._\-]+`)

func redactSecrets(s string) string {
	return bearerRe.ReplaceAllString(s, "${1}REDACTED")
}

type MCP struct {
	HTTP     *http.Client
	Endpoint string
	Token    func() (string, error)

	mu      sync.Mutex
	session string
	nextID  int
	ready   bool
}

func (c *MCP) http() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	c.HTTP = &http.Client{Timeout: 30 * time.Second}
	return c.HTTP
}

func (c *MCP) endpoint() string {
	if c.Endpoint != "" {
		return c.Endpoint
	}
	return MCPEndpoint
}

func (c *MCP) Call(method string, params any) (json.RawMessage, error) {
	if err := c.ensureSession(); err != nil {
		return nil, err
	}
	return c.rpc(method, params)
}

func (c *MCP) CallTool(name string, args map[string]any) (json.RawMessage, error) {
	if args == nil {
		args = map[string]any{}
	}
	return c.Call("tools/call", map[string]any{"name": name, "arguments": args})
}

func (c *MCP) ListTools() (json.RawMessage, error) {
	return c.Call("tools/list", map[string]any{})
}

func (c *MCP) ensureSession() error {
	c.mu.Lock()
	ready := c.ready
	c.mu.Unlock()
	if ready {
		return nil
	}
	_, err := c.rpc("initialize", map[string]any{
		"protocolVersion": mcpProtocolVersion,
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "mktorder", "version": "1"},
	})
	if err != nil {
		return err
	}
	if err := c.notify("notifications/initialized", map[string]any{}); err != nil {
		return err
	}
	c.mu.Lock()
	c.ready = true
	c.mu.Unlock()
	return nil
}

func (c *MCP) rpc(method string, params any) (json.RawMessage, error) {
	c.mu.Lock()
	c.nextID++
	id := c.nextID
	c.mu.Unlock()
	body := map[string]any{"jsonrpc": "2.0", "id": id, "method": method}
	if params != nil {
		body["params"] = params
	}
	return c.post(body, false)
}

func (c *MCP) notify(method string, params any) error {
	body := map[string]any{"jsonrpc": "2.0", "method": method}
	if params != nil {
		body["params"] = params
	}
	_, err := c.post(body, true)
	return err
}

func (c *MCP) post(payload map[string]any, notification bool) (json.RawMessage, error) {
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, c.endpoint(), bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	tok := ""
	if c.Token != nil {
		tok, err = c.Token()
		if err != nil {
			return nil, err
		}
	}
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("MCP-Protocol-Version", mcpProtocolVersion)
	c.mu.Lock()
	session := c.session
	c.mu.Unlock()
	if session != "" {
		req.Header.Set("Mcp-Session-Id", session)
	}
	resp, err := c.http().Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s", redactSecrets(err.Error()))
	}
	defer resp.Body.Close()
	if sid := resp.Header.Get("Mcp-Session-Id"); sid != "" {
		c.mu.Lock()
		c.session = sid
		c.mu.Unlock()
	}
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 401 {
		c.mu.Lock()
		c.ready = false
		c.session = ""
		c.mu.Unlock()
		return nil, fmt.Errorf("mcp unauthorized")
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("mcp http %d: %s", resp.StatusCode, redactSecrets(string(b)))
	}
	if notification {
		return nil, nil
	}
	msg := parseMCPBody(resp.Header.Get("Content-Type"), b)
	if msg == nil {
		return nil, fmt.Errorf("mcp empty response")
	}
	if errObj, ok := msg["error"].(map[string]any); ok {
		return nil, fmt.Errorf("mcp error: %v", errObj["message"])
	}
	if res, ok := msg["result"]; ok {
		out, _ := json.Marshal(res)
		return out, nil
	}
	return json.RawMessage(b), nil
}

func parseMCPBody(contentType string, body []byte) map[string]any {
	ct := strings.ToLower(contentType)
	if strings.Contains(ct, "text/event-stream") {
		for _, line := range strings.Split(string(body), "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			var m map[string]any
			if json.Unmarshal([]byte(payload), &m) == nil {
				return m
			}
		}
	}
	var m map[string]any
	if json.Unmarshal(body, &m) == nil {
		return m
	}
	return nil
}

func ToolContentJSON(result json.RawMessage) json.RawMessage {
	var root map[string]any
	if json.Unmarshal(result, &root) != nil {
		return result
	}
	content, _ := root["content"].([]any)
	for _, item := range content {
		m, _ := item.(map[string]any)
		if m == nil {
			continue
		}
		if fmt.Sprint(m["type"]) == "text" {
			s := fmt.Sprint(m["text"])
			if json.Valid([]byte(s)) {
				return json.RawMessage(s)
			}
		}
	}
	if structured, ok := root["structuredContent"]; ok {
		b, _ := json.Marshal(structured)
		return b
	}
	return result
}
