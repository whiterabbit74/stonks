package httpapi

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func repoFile(t *testing.T, rel string) string {
	t.Helper()
	p := filepath.Join("..", "..", "..", rel)
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestGoDeployShipsBinaryAndWeb(t *testing.T) {
	df := repoFile(t, "docker/go.Dockerfile")
	if !strings.Contains(df, "go build -o /out/mktorder ./cmd/server") {
		t.Fatal("go.Dockerfile must build cmd/server")
	}
	if !strings.Contains(df, "COPY go/web /app/web") {
		t.Fatal("go.Dockerfile must ship go/web")
	}
	compose := repoFile(t, "docker-compose.yml")
	if !strings.Contains(compose, "docker/go.Dockerfile") {
		t.Fatal("compose server must build docker/go.Dockerfile")
	}
	if !strings.Contains(compose, "DB_FILE=/data/db/trading.db") {
		t.Fatal("compose must point Go at the existing sqlite")
	}
	caddy := repoFile(t, "caddy/Caddyfile")
	if !strings.Contains(caddy, "reverse_proxy server:3001") {
		t.Fatal("caddy must proxy the site to the Go server")
	}
	if strings.Contains(caddy, "reverse_proxy frontend:80") {
		t.Fatal("caddy must not send / to the old React frontend")
	}
	sh := repoFile(t, "deploy-go.sh")
	if !strings.Contains(sh, "docker compose build server") {
		t.Fatal("deploy-go.sh must rebuild the Go server image")
	}
}
