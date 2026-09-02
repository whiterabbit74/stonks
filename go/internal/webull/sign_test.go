package webull

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
}

func nodeSignature(t *testing.T, path, body, queryJSON string) string {
	t.Helper()
	root := repoRoot(t)
	script := `const {buildSignature}=require("./server/src/services/webullClient.js");
const path=process.argv[1];
const body=process.argv[2];
const query=JSON.parse(process.argv[3]||"{}");
const headersToSign={
  host:"api.webull.com",
  "x-app-key":"appkey",
  "x-signature-algorithm":"HMAC-SHA1",
  "x-signature-nonce":"nonce-1",
  "x-signature-version":"1.0",
  "x-timestamp":"2026-09-02T12:00:00Z"
};
process.stdout.write(buildSignature({path,query,bodyString:body,headersToSign,appSecret:"secret"}));`
	cmd := exec.Command("node", "-e", script, path, body, queryJSON)
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("node buildSignature: %v %s", err, out)
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

func TestBuildSignatureMatchesNodePlaceAndGet(t *testing.T) {
	headers := map[string]string{
		"host":                  "api.webull.com",
		"x-app-key":             "appkey",
		"x-signature-algorithm": "HMAC-SHA1",
		"x-signature-nonce":     "nonce-1",
		"x-signature-version":   "1.0",
		"x-timestamp":           "2026-09-02T12:00:00Z",
	}
	placeBody := `{"account_id":"acc1","new_orders":[{"symbol":"AAPL"}]}`
	placePath := "/openapi/trade/stock/order/place"
	got := BuildSignature(placePath, map[string]string{}, placeBody, headers, "secret")
	want := nodeSignature(t, placePath, placeBody, "{}")
	if got != want {
		t.Fatalf("place sig got %s want %s", got, want)
	}
	getPath := "/account/balance"
	got = BuildSignature(getPath, map[string]string{"account_id": "acc1"}, "", headers, "secret")
	want = nodeSignature(t, getPath, "", `{"account_id":"acc1"}`)
	if got != want {
		t.Fatalf("get sig got %s want %s", got, want)
	}
}
