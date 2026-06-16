package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeTranscriptProvider struct{}

func (fakeTranscriptProvider) GetTranscript(ctx context.Context, req TranscriptRequest) (Transcript, error) {
	return Transcript{
		VideoID:  "VjOLmNaqEKQ",
		Title:    "Fixture Video",
		Language: req.Language,
		Text:     "hello from transcript",
		Segments: []TranscriptSegment{
			{StartSeconds: 0, DurationSeconds: 1.5, Text: "hello from transcript"},
		},
	}, nil
}

func TestAuthRejectsMissingBearerToken(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		Tokens:         []string{"token-one", "token-two"},
		EndpointPath:   "/mcp/transcribe/",
		AllowedOrigins: []string{"https://chatgpt.com"},
	}, fakeTranscriptProvider{})

	req := jsonrpcRequest(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/list",
	})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rr.Code)
	}
	if rr.Header().Get("WWW-Authenticate") == "" {
		t.Fatal("missing WWW-Authenticate header")
	}
}

func TestAuthAcceptsAnyConfiguredBearerToken(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		Tokens:       []string{"token-one", "token-two"},
		EndpointPath: "/mcp/transcribe/",
	}, fakeTranscriptProvider{})

	req := jsonrpcRequest(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/list",
	})
	req.Header.Set("Authorization", "Bearer token-two")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rr.Code, rr.Body.String())
	}
}

func TestRejectsUnexpectedOrigin(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		Tokens:         []string{"token-one"},
		EndpointPath:   "/mcp/transcribe/",
		AllowedOrigins: []string{"https://chatgpt.com"},
	}, fakeTranscriptProvider{})

	req := jsonrpcRequest(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/list",
	})
	req.Header.Set("Authorization", "Bearer token-one")
	req.Header.Set("Origin", "https://evil.example")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rr.Code)
	}
}

func TestToolsListReturnsTranscriptTool(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		Tokens:       []string{"token-one"},
		EndpointPath: "/mcp/transcribe/",
	}, fakeTranscriptProvider{})

	req := jsonrpcRequest(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/list",
	})
	req.Header.Set("Authorization", "Bearer token-one")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var got struct {
		Result struct {
			Tools []struct {
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"tools"`
		} `json:"result"`
	}
	decodeJSON(t, rr, &got)

	if len(got.Result.Tools) != 1 {
		t.Fatalf("tools count = %d, want 1", len(got.Result.Tools))
	}
	if got.Result.Tools[0].Name != "youtube.transcript.get" {
		t.Fatalf("tool name = %q", got.Result.Tools[0].Name)
	}
}

func TestToolCallReturnsStructuredTranscript(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		Tokens:       []string{"token-one"},
		EndpointPath: "/mcp/transcribe/",
	}, fakeTranscriptProvider{})

	req := jsonrpcRequest(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/call",
		"params": map[string]any{
			"name": "youtube.transcript.get",
			"arguments": map[string]any{
				"url":      "https://www.youtube.com/watch?v=VjOLmNaqEKQ",
				"language": "ru",
			},
		},
	})
	req.Header.Set("Authorization", "Bearer token-one")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var got struct {
		Result struct {
			StructuredContent struct {
				VideoID  string `json:"video_id"`
				Language string `json:"language"`
				Text     string `json:"text"`
			} `json:"structuredContent"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
	}
	decodeJSON(t, rr, &got)

	if got.Result.StructuredContent.VideoID != "VjOLmNaqEKQ" {
		t.Fatalf("video_id = %q", got.Result.StructuredContent.VideoID)
	}
	if got.Result.StructuredContent.Text != "hello from transcript" {
		t.Fatalf("text = %q", got.Result.StructuredContent.Text)
	}
	if len(got.Result.Content) != 1 || got.Result.Content[0].Type != "text" {
		t.Fatalf("content = %#v", got.Result.Content)
	}
}

func TestToolCallOmitsSegmentsByDefault(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		Tokens:       []string{"token-one"},
		EndpointPath: "/mcp/transcribe/",
	}, fakeTranscriptProvider{})

	req := jsonrpcRequest(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/call",
		"params": map[string]any{
			"name": "youtube.transcript.get",
			"arguments": map[string]any{
				"url": "https://www.youtube.com/watch?v=VjOLmNaqEKQ",
			},
		},
	})
	req.Header.Set("Authorization", "Bearer token-one")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var got struct {
		Result struct {
			StructuredContent struct {
				Segments []TranscriptSegment `json:"segments"`
			} `json:"structuredContent"`
		} `json:"result"`
	}
	decodeJSON(t, rr, &got)

	if len(got.Result.StructuredContent.Segments) != 0 {
		t.Fatalf("segments count = %d, want 0 by default", len(got.Result.StructuredContent.Segments))
	}
}

func TestToolCallAllowsOneMillionCharacters(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		Tokens:       []string{"token-one"},
		EndpointPath: "/mcp/transcribe/",
	}, fakeTranscriptProvider{})

	req := jsonrpcRequest(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/call",
		"params": map[string]any{
			"name": "youtube.transcript.get",
			"arguments": map[string]any{
				"url":       "https://www.youtube.com/watch?v=VjOLmNaqEKQ",
				"max_chars": 1000000,
			},
		},
	})
	req.Header.Set("Authorization", "Bearer token-one")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rr.Code, rr.Body.String())
	}
	if bytes.Contains(rr.Body.Bytes(), []byte("max_chars must be")) {
		t.Fatalf("max_chars=1000000 was rejected: %s", rr.Body.String())
	}
}

func TestNotificationReturnsAccepted(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		Tokens:       []string{"token-one"},
		EndpointPath: "/mcp/transcribe/",
	}, fakeTranscriptProvider{})

	req := jsonrpcRequest(t, map[string]any{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
	})
	req.Header.Set("Authorization", "Bearer token-one")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rr.Code)
	}
	if rr.Body.Len() != 0 {
		t.Fatalf("body = %q, want empty", rr.Body.String())
	}
}

func jsonrpcRequest(t *testing.T, payload map[string]any) *http.Request {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/mcp/transcribe/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	return req
}

func decodeJSON(t *testing.T, rr *httptest.ResponseRecorder, out any) {
	t.Helper()

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rr.Code, rr.Body.String())
	}
	if err := json.Unmarshal(rr.Body.Bytes(), out); err != nil {
		t.Fatalf("decode response: %v\nbody=%s", err, rr.Body.String())
	}
}
