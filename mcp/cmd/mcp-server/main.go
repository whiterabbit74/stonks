package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"tradingibs-mcp/internal/mcpserver"
	"tradingibs-mcp/internal/youtube"
)

type transcriptAdapter struct {
	client youtube.Client
}

func (a transcriptAdapter) GetTranscript(ctx context.Context, req mcpserver.TranscriptRequest) (mcpserver.Transcript, error) {
	got, err := a.client.GetTranscript(ctx, youtube.Request{
		Video:    req.URL,
		Language: req.Language,
		MaxChars: req.MaxChars,
	})
	if err != nil {
		return mcpserver.Transcript{}, err
	}

	segments := make([]mcpserver.TranscriptSegment, 0, len(got.Segments))
	if req.IncludeSegments {
		for _, segment := range got.Segments {
			segments = append(segments, mcpserver.TranscriptSegment{
				StartSeconds:    segment.StartSeconds,
				DurationSeconds: segment.DurationSeconds,
				Text:            segment.Text,
			})
		}
	}

	return mcpserver.Transcript{
		VideoID:   got.VideoID,
		Title:     got.Title,
		Language:  got.Language,
		Text:      got.Text,
		Segments:  segments,
		Truncated: got.Truncated,
	}, nil
}

func main() {
	addr := env("MCP_ADDR", ":8080")
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		if err := runHealthcheck(addr); err != nil {
			log.Fatalf("healthcheck failed: %v", err)
		}
		return
	}

	endpointPath := env("MCP_ENDPOINT_PATH", "/mcp/transcribe/")
	origins := mcpserver.OriginsFromEnv(env("MCP_ALLOWED_ORIGINS", "https://chatgpt.com,https://chat.openai.com,https://tradingibs.site"))
	tokens := mcpserver.TokensFromEnv(os.Getenv("MCP_BEARER_TOKENS"))

	config := mcpserver.Config{
		Tokens:         tokens,
		EndpointPath:   endpointPath,
		AllowedOrigins: origins,
		ServerName:     "tradingibs-youtube-transcript-mcp",
	}
	if err := mcpserver.ValidateConfig(config); err != nil {
		log.Fatalf("invalid config: %v", err)
	}

	handler := mcpserver.NewHandler(config, transcriptAdapter{
		client: youtube.Client{HTTPClient: &http.Client{Timeout: 20 * time.Second}},
	})

	server := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("starting TradingIBS MCP server on %s, endpoint %s", addr, endpointPath)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server failed: %v", err)
	}
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func runHealthcheck(addr string) error {
	addr = strings.TrimSpace(addr)
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		host = "127.0.0.1"
		port = strings.TrimPrefix(addr, ":")
	}
	if host == "" || host == "::" || host == "0.0.0.0" {
		host = "127.0.0.1"
	}
	if port == "" {
		port = "8080"
	}
	target := net.JoinHostPort(host, port)

	client := http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://" + target + "/healthz")
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", response.StatusCode)
	}
	return nil
}
