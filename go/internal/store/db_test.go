package store

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestOpenSetsBusyTimeout(t *testing.T) {
	db := openTestDB(t)
	var ms int
	if err := db.SQL.QueryRow(`PRAGMA busy_timeout`).Scan(&ms); err != nil {
		t.Fatal(err)
	}
	if ms != 5000 {
		t.Fatalf("busy_timeout=%d want 5000", ms)
	}
}

func TestSettingsPartialAutoTradingKeepsThresholds(t *testing.T) {
	db := openTestDB(t)
	if err := db.SaveSettings(map[string]any{
		"watchThresholdPct": 0.5,
		"autoTrading": map[string]any{
			"enabled":  true,
			"provider": "polygon",
		},
	}); err != nil {
		t.Fatal(err)
	}
	got := db.Settings()
	if got["watchThresholdPct"] != 0.5 {
		t.Fatalf("watchThresholdPct=%v want 0.5 (stored override)", got["watchThresholdPct"])
	}
	if got["resultsQuoteProvider"] != "alpha_vantage" {
		t.Fatalf("resultsQuoteProvider=%v", got["resultsQuoteProvider"])
	}
	if got["enhancerProvider"] != "finnhub" {
		t.Fatalf("enhancerProvider=%v", got["enhancerProvider"])
	}
	if got["indicatorPanePercent"] != 30 {
		t.Fatalf("indicatorPanePercent=%v", got["indicatorPanePercent"])
	}
	if got["defaultMultiTickerSymbols"] != "SPY,QQQ,IWM" {
		t.Fatalf("defaultMultiTickerSymbols=%v", got["defaultMultiTickerSymbols"])
	}
	if got["initialCapital"] != 10000 {
		t.Fatalf("initialCapital=%v want default 10000", got["initialCapital"])
	}
	at, ok := got["autoTrading"].(map[string]any)
	if !ok {
		t.Fatalf("autoTrading type %T", got["autoTrading"])
	}
	if at["enabled"] != true {
		t.Fatalf("enabled=%v", at["enabled"])
	}
	if at["provider"] != "polygon" {
		t.Fatalf("provider=%v", at["provider"])
	}
	if at["lowIBS"] != 0.1 {
		t.Fatalf("lowIBS=%v want default 0.1", at["lowIBS"])
	}
	if at["highIBS"] != 0.75 {
		t.Fatalf("highIBS=%v want default 0.75", at["highIBS"])
	}
	if at["allowExits"] == true {
		t.Fatalf("allowExits=%v want missing/false (fail-closed)", at["allowExits"])
	}
	if _, ok := at["dryRun"]; ok {
		t.Fatal("dryRun should be stripped")
	}
}

func TestSettingsNullAutoTradingKeepsDefaults(t *testing.T) {
	db := openTestDB(t)
	if err := db.SaveSettings(map[string]any{"autoTrading": nil, "foo": "bar"}); err != nil {
		t.Fatal(err)
	}
	got := db.Settings()
	at, ok := got["autoTrading"].(map[string]any)
	if !ok {
		t.Fatalf("autoTrading wiped: %v", got["autoTrading"])
	}
	if at["lowIBS"] != 0.1 || at["highIBS"] != 0.75 {
		t.Fatalf("thresholds %+v", at)
	}
	if _, ok := got["foo"]; ok {
		t.Fatalf("unknown key survived sanitizer: %v", got["foo"])
	}
}

func plantRawSettings(t *testing.T, db *DB, s map[string]any) {
	t.Helper()
	raw, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`, string(raw)); err != nil {
		t.Fatal(err)
	}
}

func rawSettingsBlob(t *testing.T, db *DB) string {
	t.Helper()
	var data string
	if err := db.SQL.QueryRow(`SELECT data FROM settings WHERE id = 1`).Scan(&data); err != nil {
		t.Fatal(err)
	}
	return data
}

func TestSettingsDropsUnknownKeysOnLoadAndSave(t *testing.T) {
	db := openTestDB(t)
	plantRawSettings(t, db, map[string]any{
		"watchThresholdPct":             0.4,
		"webullAllowEntries":            "on",
		"robinhoodEnabled":              "on",
		"autoEntryReserve":              "0.50",
		"lastActualizationDate":         "2026-09-01",
		"lastActualizationAttemptDate":  "2026-09-01",
		"lastActualizationAttemptCount": 2,
		"trackerPersistFail":            map[string]any{"webull": true},
		"polygonApiKey":                 "secret",
		"initialCapital":                25000,
		"autotradeLogMaxRows":           2,
		"autotradeLogRetentionDays":     0,
	})
	got := db.Settings()
	for _, junk := range []string{"webullAllowEntries", "robinhoodEnabled", "autoEntryReserve"} {
		if _, ok := got[junk]; ok {
			t.Fatalf("GET leaked junk key %s: %+v", junk, got[junk])
		}
	}
	if fmt.Sprint(got["lastActualizationDate"]) != "2026-09-01" {
		t.Fatalf("lastActualizationDate=%v", got["lastActualizationDate"])
	}
	if fmt.Sprint(got["lastActualizationAttemptDate"]) != "2026-09-01" {
		t.Fatalf("lastActualizationAttemptDate=%v", got["lastActualizationAttemptDate"])
	}
	if asFloat(got["lastActualizationAttemptCount"]) != 2 {
		t.Fatalf("lastActualizationAttemptCount=%v", got["lastActualizationAttemptCount"])
	}
	blocks, _ := got["trackerPersistFail"].(map[string]any)
	if blocks["webull"] != true {
		t.Fatalf("trackerPersistFail=%v", got["trackerPersistFail"])
	}
	if got["polygonApiKey"] != "secret" {
		t.Fatalf("polygonApiKey=%v", got["polygonApiKey"])
	}
	if asFloat(got["initialCapital"]) != 25000 {
		t.Fatalf("initialCapital=%v", got["initialCapital"])
	}
	if asFloat(got["autotradeLogMaxRows"]) != 2 {
		t.Fatalf("autotradeLogMaxRows=%v", got["autotradeLogMaxRows"])
	}
	if asFloat(got["autotradeLogRetentionDays"]) != 0 {
		t.Fatalf("autotradeLogRetentionDays=%v", got["autotradeLogRetentionDays"])
	}
	if asFloat(got["watchThresholdPct"]) != 0.4 {
		t.Fatalf("watchThresholdPct=%v", got["watchThresholdPct"])
	}
	if err := db.SaveSettings(got); err != nil {
		t.Fatal(err)
	}
	blob := rawSettingsBlob(t, db)
	for _, junk := range []string{"webullAllowEntries", "robinhoodEnabled", "autoEntryReserve"} {
		if strings.Contains(blob, junk) {
			t.Fatalf("save persisted junk %s: %s", junk, blob)
		}
	}
	if !strings.Contains(blob, "lastActualizationDate") || !strings.Contains(blob, "trackerPersistFail") {
		t.Fatalf("server keys dropped: %s", blob)
	}
}

func TestAllowedSettingsKeysCoverDefaults(t *testing.T) {
	for k := range defaultSettings() {
		if !AllowedSettingsKey(k) {
			t.Errorf("default key %s not on whitelist", k)
		}
	}
	for _, k := range extraStoredSettingsKeys {
		if !AllowedSettingsKey(k) {
			t.Errorf("extra key %s not on whitelist", k)
		}
	}
	for _, junk := range []string{"webullAllowEntries", "webullAllowExits", "webullEnabled",
		"robinhoodAllowEntries", "robinhoodAllowExits", "robinhoodEnabled",
		"allowNewEntries", "allowExits", "autoEntryReserve", "autoWindow"} {
		if AllowedSettingsKey(junk) {
			t.Errorf("broker/autotrade flag %s must not be a settings key", junk)
		}
	}
}

func TestSettingsExplicitZeroThresholdIsPreserved(t *testing.T) {
	db := openTestDB(t)
	if err := db.SaveSettings(map[string]any{
		"autoTrading": map[string]any{"lowIBS": 0.0, "enabled": true},
	}); err != nil {
		t.Fatal(err)
	}
	at := db.Settings()["autoTrading"].(map[string]any)
	if asFloat(at["lowIBS"]) != 0 {
		t.Fatalf("explicit 0 was replaced: %v", at["lowIBS"])
	}
	if at["highIBS"] != 0.75 {
		t.Fatalf("highIBS=%v", at["highIBS"])
	}
}

func TestTradeCloseFieldsPnLAndHoldingDays(t *testing.T) {
	existing := map[string]any{"entryPrice": 100.0, "entryDate": "2024-01-02"}
	got := TradeCloseFields(existing, 110.0, "2024-01-06", map[string]any{"notes": "x"})
	if got["status"] != "closed" {
		t.Fatalf("status %v", got["status"])
	}
	if got["pnlAbsolute"] != 10.0 {
		t.Fatalf("pnlAbsolute %v", got["pnlAbsolute"])
	}
	if got["pnlPercent"] != 10.0 {
		t.Fatalf("pnlPercent %v", got["pnlPercent"])
	}
	if got["holdingDays"] != 4 {
		t.Fatalf("holdingDays %v want 4", got["holdingDays"])
	}
	sameDay := TradeCloseFields(existing, 100.0, "2024-01-02", nil)
	if sameDay["holdingDays"] != 1 {
		t.Fatalf("same-day holdingDays %v want 1", sameDay["holdingDays"])
	}
	if sameDay["pnlAbsolute"] != 0.0 || sameDay["pnlPercent"] != 0.0 {
		t.Fatalf("flat close %+v", sameDay)
	}
}

func TestCloseMonitorTradePnL(t *testing.T) {
	db := openTestDB(t)
	if err := db.InsertTrade("trades", map[string]any{
		"id": "m1", "symbol": "AAPL", "status": "open",
		"entryDate": "2024-01-02", "entryPrice": 100.0, "notes": "opened",
	}); err != nil {
		t.Fatal(err)
	}
	closed, err := db.CloseMonitorTrade("m1", map[string]any{
		"exitPrice": 110.0, "exitDate": "2024-01-06", "exitIBS": 0.8,
	})
	if err != nil {
		t.Fatal(err)
	}
	if closed["status"] != "closed" {
		t.Fatalf("status %v", closed["status"])
	}
	if asFloat(closed["pnlAbsolute"]) != 10 {
		t.Fatalf("pnlAbsolute %v", closed["pnlAbsolute"])
	}
	if asFloat(closed["pnlPercent"]) != 10 {
		t.Fatalf("pnlPercent %v", closed["pnlPercent"])
	}
	if closed["holdingDays"] != int64(4) {
		t.Fatalf("holdingDays %v (%T)", closed["holdingDays"], closed["holdingDays"])
	}
	if asFloat(closed["exitPrice"]) != 110 {
		t.Fatalf("exitPrice %v", closed["exitPrice"])
	}
	if closed["exitDate"] != "2024-01-06" {
		t.Fatalf("exitDate %v", closed["exitDate"])
	}
}

func TestCloseMonitorTradeRejectsLinked(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.SQL.Exec(`INSERT INTO trades (id, symbol, status, entry_date, entry_price, linked_broker_trade_id)
        VALUES ('m-linked','AAPL','open','2024-01-02',100,'broker-1')`); err != nil {
		t.Fatal(err)
	}
	got, err := db.CloseMonitorTrade("m-linked", map[string]any{"exitPrice": 110.0, "exitDate": "2024-01-06"})
	if err == nil {
		t.Fatal("expected linked trade error")
	}
	if got["status"] != "open" {
		t.Fatalf("linked trade should stay open, got %v", got["status"])
	}
}

func TestCloseTradeByIDBrokerTable(t *testing.T) {
	db := openTestDB(t)
	if err := db.InsertTrade("broker_trades", map[string]any{
		"id": "b1", "symbol": "MSFT", "status": "open",
		"entryDate": "2024-01-02", "entryPrice": 50.0, "quantity": 2.0,
	}); err != nil {
		t.Fatal(err)
	}
	closed, err := db.CloseTradeByID("broker_trades", "b1", 55.0, "2024-01-10", map[string]any{"notes": "auto"})
	if err != nil {
		t.Fatal(err)
	}
	if closed["status"] != "closed" {
		t.Fatalf("status %v", closed["status"])
	}
	if asFloat(closed["pnlAbsolute"]) != 5 {
		t.Fatalf("pnlAbsolute %v", closed["pnlAbsolute"])
	}
	if asFloat(closed["pnlPercent"]) != 10 {
		t.Fatalf("pnlPercent %v", closed["pnlPercent"])
	}
	if closed["holdingDays"] != int64(8) {
		t.Fatalf("holdingDays %v", closed["holdingDays"])
	}
	if closed["exitDate"] != "2024-01-10" {
		t.Fatalf("exitDate %v", closed["exitDate"])
	}
}

func TestCloseTradeByIDAllowsLinkedMonitorTrade(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.SQL.Exec(`INSERT INTO trades (id, symbol, status, entry_date, entry_price, linked_broker_trade_id)
        VALUES ('m-auto','AAPL','open','2024-06-03',20,'broker-9')`); err != nil {
		t.Fatal(err)
	}
	closed, err := db.CloseTradeByID("trades", "m-auto", 22.0, "2024-06-04", nil)
	if err != nil {
		t.Fatal(err)
	}
	if closed["status"] != "closed" {
		t.Fatalf("status %v", closed["status"])
	}
	if asFloat(closed["pnlPercent"]) != 10 {
		t.Fatalf("pnlPercent %v", closed["pnlPercent"])
	}
}

func TestGetOHLCLastChronoTail(t *testing.T) {
	db := openTestDB(t)
	bars := []types.OHLC{
		{Date: "2024-01-01", Open: 1, High: 1, Low: 1, Close: 1, Volume: 10},
		{Date: "2024-01-02", Open: 2, High: 2, Low: 2, Close: 2, Volume: 20},
		{Date: "2024-01-03", Open: 3, High: 3, Low: 3, Close: 3, Volume: 30},
		{Date: "2024-01-04", Open: 4, High: 4, Low: 4, Close: 4, Volume: 40},
		{Date: "2024-01-05", Open: 5, High: 5, Low: 5, Close: 5, Volume: 50},
	}
	if err := db.SaveDataset("QQQ", "QQQ", "", "", bars, true); err != nil {
		t.Fatal(err)
	}
	got, adj, err := db.GetOHLCLast("qqq", 2)
	if err != nil {
		t.Fatal(err)
	}
	if !adj {
		t.Fatal("adjusted flag")
	}
	if len(got) != 2 {
		t.Fatalf("len %d", len(got))
	}
	if got[0].Date != "2024-01-04" || got[1].Date != "2024-01-05" {
		t.Fatalf("order %+v", []string{got[0].Date, got[1].Date})
	}
	if got[0].Close != 4 || got[1].Close != 5 {
		t.Fatalf("closes %v %v", got[0].Close, got[1].Close)
	}
	alias, _, err := db.GetLastOHLC("QQQ", 1)
	if err != nil || len(alias) != 1 || alias[0].Date != "2024-01-05" {
		t.Fatalf("alias %+v err %v", alias, err)
	}
	missing, adj2, err := db.GetOHLCLast("NOPE", 2)
	if err != nil || missing != nil || adj2 {
		t.Fatalf("missing ticker %v adj=%v err=%v", missing, adj2, err)
	}
}

func TestSessionDeleteExpired(t *testing.T) {
	db := openTestDB(t)
	if err := db.SessionSet("old", 1, 100); err != nil {
		t.Fatal(err)
	}
	if err := db.SessionSet("live", 50, 5000); err != nil {
		t.Fatal(err)
	}
	n, err := db.SessionDeleteExpired(1000)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("deleted %d want 1", n)
	}
	if _, _, ok := db.SessionGet("old"); ok {
		t.Fatal("expired session still present")
	}
	if _, exp, ok := db.SessionGet("live"); !ok || exp != 5000 {
		t.Fatalf("live session missing exp=%d ok=%v", exp, ok)
	}
}

func TestSettingsRoundTripJSONDoesNotDropNestedDefaults(t *testing.T) {
	db := openTestDB(t)
	raw, _ := json.Marshal(map[string]any{"autoTrading": map[string]any{"enabled": true}})
	if _, err := db.SQL.Exec(`INSERT INTO settings (id, data) VALUES (1, ?)`, string(raw)); err != nil {
		t.Fatal(err)
	}
	got := db.Settings()
	at := got["autoTrading"].(map[string]any)
	if at["lowIBS"] != 0.1 || at["highIBS"] != 0.75 {
		t.Fatalf("merged %+v", at)
	}
}

func mustWatch(t *testing.T, db *DB, symbol string) map[string]any {
	t.Helper()
	list, err := db.ListWatches()
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range list {
		if fmt.Sprint(w["symbol"]) == symbol {
			return w
		}
	}
	t.Fatalf("watch %s not found", symbol)
	return nil
}

func seedOpenWatch(t *testing.T, db *DB) {
	t.Helper()
	if err := db.UpsertWatch(map[string]any{
		"symbol":         "AAPL",
		"lowIBS":         0.1,
		"highIBS":        0.8,
		"thresholdPct":   0.4,
		"isOpenPosition": true,
		"entryPrice":     100.0,
		"entryDate":      "2026-09-01",
		"currentTradeId": "t1",
	}); err != nil {
		t.Fatal(err)
	}
}

func TestPatchWatchPreservesOpenPosition(t *testing.T) {
	db := openTestDB(t)
	seedOpenWatch(t, db)
	if err := db.PatchWatch("AAPL", map[string]any{"lowIBS": 0.12}); err != nil {
		t.Fatal(err)
	}
	got := mustWatch(t, db, "AAPL")
	if asFloat(got["lowIBS"]) != 0.12 {
		t.Fatalf("lowIBS=%v want 0.12", got["lowIBS"])
	}
	if asFloat(got["highIBS"]) != 0.8 {
		t.Fatalf("highIBS=%v want 0.8", got["highIBS"])
	}
	if asFloat(got["thresholdPct"]) != 0.4 {
		t.Fatalf("thresholdPct=%v want 0.4", got["thresholdPct"])
	}
	if got["isOpenPosition"] != true {
		t.Fatalf("isOpenPosition=%v", got["isOpenPosition"])
	}
	if asFloat(got["entryPrice"]) != 100 {
		t.Fatalf("entryPrice=%v", got["entryPrice"])
	}
	if got["entryDate"] != "2026-09-01" {
		t.Fatalf("entryDate=%v", got["entryDate"])
	}
	if got["currentTradeId"] != "t1" {
		t.Fatalf("currentTradeId=%v", got["currentTradeId"])
	}
}

func TestUpsertWatchDoesNotResetOpenPosition(t *testing.T) {
	db := openTestDB(t)
	seedOpenWatch(t, db)
	if err := db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.11}); err != nil {
		t.Fatal(err)
	}
	got := mustWatch(t, db, "AAPL")
	if asFloat(got["lowIBS"]) != 0.11 {
		t.Fatalf("lowIBS=%v want 0.11", got["lowIBS"])
	}
	if asFloat(got["highIBS"]) != 0.8 {
		t.Fatalf("highIBS=%v want preserved 0.8", got["highIBS"])
	}
	if got["isOpenPosition"] != true {
		t.Fatalf("isOpenPosition=%v", got["isOpenPosition"])
	}
	if asFloat(got["entryPrice"]) != 100 {
		t.Fatalf("entryPrice=%v", got["entryPrice"])
	}
	if got["entryDate"] != "2026-09-01" {
		t.Fatalf("entryDate=%v", got["entryDate"])
	}
	if got["currentTradeId"] != "t1" {
		t.Fatalf("currentTradeId=%v", got["currentTradeId"])
	}
}

func TestUpsertWatchKeepsExplicitZeroThreshold(t *testing.T) {
	db := openTestDB(t)
	if err := db.UpsertWatch(map[string]any{"symbol": "ZERO", "lowIBS": 0.0, "highIBS": 0.75}); err != nil {
		t.Fatal(err)
	}
	got := mustWatch(t, db, "ZERO")
	if asFloat(got["lowIBS"]) != 0 {
		t.Fatalf("lowIBS=%v want 0 (explicit zero is not the missing-key default)", got["lowIBS"])
	}
	if asFloat(got["highIBS"]) != 0.75 {
		t.Fatalf("highIBS=%v", got["highIBS"])
	}
}
