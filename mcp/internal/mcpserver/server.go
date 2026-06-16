package mcpserver

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const (
	ProtocolVersion = "2025-11-25"
	ToolName        = "youtube.transcript.get"
	defaultMaxChars = 500000
	maxCharsLimit   = 1000000
)

type Config struct {
	Tokens         []string
	EndpointPath   string
	AllowedOrigins []string
	ServerName     string
}

type TranscriptProvider interface {
	GetTranscript(context.Context, TranscriptRequest) (Transcript, error)
}

type TranscriptRequest struct {
	URL             string
	Language        string
	IncludeSegments bool
	MaxChars        int
}

type Transcript struct {
	VideoID   string              `json:"video_id"`
	Title     string              `json:"title"`
	URL       string              `json:"url"`
	Language  string              `json:"language"`
	Text      string              `json:"text"`
	Segments  []TranscriptSegment `json:"segments,omitempty"`
	Truncated bool                `json:"truncated"`
}

type TranscriptSegment struct {
	StartSeconds    float64 `json:"start_seconds"`
	DurationSeconds float64 `json:"duration_seconds"`
	Text            string  `json:"text"`
}

type Handler struct {
	config   Config
	tokens   []string
	origins  map[string]struct{}
	provider TranscriptProvider
	logger   *slog.Logger
}

func NewHandler(config Config, provider TranscriptProvider) http.Handler {
	if config.EndpointPath == "" {
		config.EndpointPath = "/mcp/transcribe/"
	}
	if config.ServerName == "" {
		config.ServerName = "tradingibs-youtube-transcript-mcp"
	}

	origins := make(map[string]struct{}, len(config.AllowedOrigins))
	for _, origin := range config.AllowedOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			origins[origin] = struct{}{}
		}
	}

	tokens := make([]string, 0, len(config.Tokens))
	for _, token := range config.Tokens {
		token = strings.TrimSpace(token)
		if token != "" {
			tokens = append(tokens, token)
		}
	}

	return &Handler{
		config:   config,
		tokens:   tokens,
		origins:  origins,
		provider: provider,
		logger:   slog.Default(),
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.isHealthPath(r.URL.Path) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": h.config.ServerName})
		return
	}

	if !samePath(r.URL.Path, h.config.EndpointPath) {
		http.NotFound(w, r)
		return
	}

	if r.Method == http.MethodOptions {
		h.writeCORSHeaders(w)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !h.validOrigin(r.Header.Get("Origin")) {
		writeJSONRPCError(w, http.StatusForbidden, nil, -32000, "forbidden origin")
		return
	}
	h.writeCORSHeaders(w)

	if r.Method == http.MethodGet {
		w.Header().Set("Allow", "GET, POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "SSE stream is not enabled; use POST for JSON-RPC"})
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}

	if len(h.tokens) == 0 {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "MCP bearer tokens are not configured"})
		return
	}
	if !h.validBearerToken(r.Header.Get("Authorization")) {
		w.Header().Set("WWW-Authenticate", `Bearer realm="tradingibs-mcp"`)
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "authorization required"})
		return
	}

	var req rpcRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeJSONRPCError(w, http.StatusBadRequest, nil, -32700, "parse error")
		return
	}
	if req.JSONRPC != "2.0" || req.Method == "" {
		writeJSONRPCError(w, http.StatusBadRequest, req.ID, -32600, "invalid request")
		return
	}
	if len(req.ID) == 0 {
		if strings.HasPrefix(req.Method, "notifications/") {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		writeJSONRPCError(w, http.StatusBadRequest, nil, -32600, "request id is required")
		return
	}

	result, rpcErr := h.dispatch(r.Context(), req.Method, req.Params)
	if rpcErr != nil {
		writeRPCResponse(w, http.StatusOK, req.ID, nil, rpcErr)
		return
	}
	writeRPCResponse(w, http.StatusOK, req.ID, result, nil)
}

func (h *Handler) isHealthPath(path string) bool {
	return path == "/healthz" || samePath(path, strings.TrimRight(h.config.EndpointPath, "/")+"/healthz")
}

func (h *Handler) validOrigin(origin string) bool {
	if origin == "" || len(h.origins) == 0 {
		return true
	}
	_, ok := h.origins[origin]
	return ok
}

func (h *Handler) writeCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, MCP-Protocol-Version")
}

func (h *Handler) validBearerToken(header string) bool {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	got := strings.TrimSpace(strings.TrimPrefix(header, prefix))
	for _, want := range h.tokens {
		if subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1 {
			return true
		}
	}
	return false
}

func (h *Handler) dispatch(ctx context.Context, method string, params json.RawMessage) (any, *rpcError) {
	switch method {
	case "initialize":
		return map[string]any{
			"protocolVersion": ProtocolVersion,
			"capabilities": map[string]any{
				"tools": map[string]any{},
			},
			"serverInfo": map[string]any{
				"name":    h.config.ServerName,
				"version": "1.0.0",
			},
			"instructions": "Use youtube.transcript.get to retrieve the transcript for a public YouTube video URL.",
		}, nil
	case "ping":
		return map[string]any{}, nil
	case "tools/list":
		return map[string]any{"tools": []any{toolDefinition()}}, nil
	case "tools/call":
		return h.callTool(ctx, params)
	default:
		return nil, &rpcError{Code: -32601, Message: "method not found"}
	}
}

func (h *Handler) callTool(ctx context.Context, params json.RawMessage) (any, *rpcError) {
	var call struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(params, &call); err != nil {
		return nil, &rpcError{Code: -32602, Message: "invalid tool call params"}
	}
	if call.Name != ToolName {
		return nil, &rpcError{Code: -32602, Message: "unknown tool"}
	}

	var args struct {
		URL             string `json:"url"`
		Language        string `json:"language"`
		IncludeSegments *bool  `json:"include_segments"`
		MaxChars        int    `json:"max_chars"`
	}
	if len(call.Arguments) == 0 || string(call.Arguments) == "null" {
		return nil, &rpcError{Code: -32602, Message: "tool arguments are required"}
	}
	if err := json.Unmarshal(call.Arguments, &args); err != nil {
		return nil, &rpcError{Code: -32602, Message: "invalid tool arguments"}
	}
	args.URL = strings.TrimSpace(args.URL)
	if args.URL == "" {
		return nil, &rpcError{Code: -32602, Message: "url is required"}
	}
	includeSegments := false
	if args.IncludeSegments != nil {
		includeSegments = *args.IncludeSegments
	}
	if args.MaxChars == 0 {
		args.MaxChars = defaultMaxChars
	}
	if args.MaxChars < 1000 || args.MaxChars > maxCharsLimit {
		return nil, &rpcError{Code: -32602, Message: "max_chars must be between 1000 and 1000000"}
	}

	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	transcript, err := h.provider.GetTranscript(ctx, TranscriptRequest{
		URL:             args.URL,
		Language:        args.Language,
		IncludeSegments: includeSegments,
		MaxChars:        args.MaxChars,
	})
	if err != nil {
		h.logger.Warn("transcript tool failed", "error", err)
		return map[string]any{
			"isError": true,
			"content": []map[string]any{
				{"type": "text", "text": safeError(err)},
			},
		}, nil
	}
	transcript.URL = args.URL
	if !includeSegments {
		transcript.Segments = nil
	}

	return map[string]any{
		"structuredContent": transcript,
		"content": []map[string]any{
			{"type": "text", "text": transcript.Text},
		},
	}, nil
}

func toolDefinition() map[string]any {
	return map[string]any{
		"name":        ToolName,
		"title":       "Get YouTube Transcript",
		"description": "Use this when you need the transcript text for a public YouTube video URL. Do not use when the video has no available captions or when the user asks for private account data.",
		"inputSchema": map[string]any{
			"type":     "object",
			"required": []string{"url"},
			"properties": map[string]any{
				"url": map[string]any{
					"type":        "string",
					"description": "A YouTube watch, youtu.be, embed, shorts, live URL, or an 11-character YouTube video ID.",
				},
				"language": map[string]any{
					"type":        "string",
					"description": "Optional preferred caption language code, for example en, ru, es, or en-US. If omitted, the first available caption track is used.",
				},
				"include_segments": map[string]any{
					"type":        "boolean",
					"description": "Whether to include timestamped transcript segments in structuredContent.",
					"default":     false,
				},
				"max_chars": map[string]any{
					"type":        "integer",
					"description": "Maximum number of transcript characters to return.",
					"default":     defaultMaxChars,
					"minimum":     1000,
					"maximum":     maxCharsLimit,
				},
			},
		},
		"outputSchema": map[string]any{
			"type":     "object",
			"required": []string{"video_id", "language", "text"},
			"properties": map[string]any{
				"video_id":  map[string]any{"type": "string"},
				"title":     map[string]any{"type": "string"},
				"url":       map[string]any{"type": "string"},
				"language":  map[string]any{"type": "string"},
				"text":      map[string]any{"type": "string"},
				"truncated": map[string]any{"type": "boolean"},
				"segments": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"start_seconds":    map[string]any{"type": "number"},
							"duration_seconds": map[string]any{"type": "number"},
							"text":             map[string]any{"type": "string"},
						},
					},
				},
			},
		},
		"annotations": map[string]any{
			"readOnlyHint":    true,
			"destructiveHint": false,
			"openWorldHint":   true,
		},
	}
}

func samePath(got, want string) bool {
	return strings.TrimRight(got, "/") == strings.TrimRight(want, "/")
}

func safeError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if strings.Contains(msg, "\n") {
		msg = strings.SplitN(msg, "\n", 2)[0]
	}
	return msg
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func writeRPCResponse(w http.ResponseWriter, status int, id json.RawMessage, result any, err *rpcError) {
	response := rpcResponse{
		JSONRPC: "2.0",
		ID:      id,
		Result:  result,
		Error:   err,
	}
	writeJSON(w, status, response)
}

func writeJSONRPCError(w http.ResponseWriter, status int, id json.RawMessage, code int, message string) {
	writeRPCResponse(w, status, id, nil, &rpcError{Code: code, Message: message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil && !errors.Is(err, http.ErrHandlerTimeout) {
		slog.Default().Warn("write json response failed", "error", err)
	}
}

func TokensFromEnv(raw string) []string {
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n' || r == ' ' || r == '\t'
	})
	out := make([]string, 0, len(fields))
	for _, field := range fields {
		field = strings.TrimSpace(field)
		if field != "" {
			out = append(out, field)
		}
	}
	return out
}

func OriginsFromEnv(raw string) []string {
	return TokensFromEnv(raw)
}

func ValidateConfig(config Config) error {
	if len(TokensFromEnv(strings.Join(config.Tokens, ","))) == 0 {
		return fmt.Errorf("MCP_BEARER_TOKENS must contain at least one token")
	}
	return nil
}
