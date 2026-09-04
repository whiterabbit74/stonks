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
	df := repoFile(t, "docker/go.runtime.Dockerfile")
	if !strings.Contains(df, "COPY mktorder /app/mktorder") {
		t.Fatal("runtime Dockerfile must copy the pre-built binary")
	}
	if !strings.Contains(df, "COPY web /app/web") {
		t.Fatal("runtime Dockerfile must ship go/web")
	}
	if strings.Contains(df, "golang:") {
		t.Fatal("runtime image must not include a Go compiler")
	}
	compose := repoFile(t, "docker-compose.yml")
	if strings.Contains(compose, "docker/go") {
		t.Fatal("compose must not build the trading server")
	}
	if !strings.Contains(compose, "image: ${SERVER_IMAGE:-stonks-server:latest}") {
		t.Fatal("compose server must run the preloaded image")
	}
	if !strings.Contains(compose, "DB_FILE=/data/db/trading.db") {
		t.Fatal("compose must point Go at the existing sqlite")
	}
	if strings.Contains(compose, "frontend") {
		t.Fatal("compose must not run a separate frontend")
	}
	caddy := repoFile(t, "caddy/Caddyfile")
	if !strings.Contains(caddy, "reverse_proxy server:3001") {
		t.Fatal("caddy must proxy the site to the Go server")
	}
	if strings.Contains(caddy, "reverse_proxy frontend:80") {
		t.Fatal("caddy must not send / to the old React frontend")
	}
	sh := repoFile(t, "deploy.sh")
	if !strings.Contains(sh, `go build -C go`) {
		t.Fatal("deploy.sh must cross-compile linux/amd64")
	}
	if !strings.Contains(sh, "docker/go.runtime.Dockerfile") {
		t.Fatal("deploy.sh must pack the runtime image")
	}
	if !strings.Contains(sh, "--no-build") {
		t.Fatal("VPS must not compile")
	}
}
