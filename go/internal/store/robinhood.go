package store

import (
	"database/sql"
	"fmt"
	"time"
)

type RobinhoodOAuthRow struct {
	ClientID, AccessToken, RefreshToken, TokenType, Scope, ExpiresAt, AccountNumber string
	LastCheckStatus, LastCheckAt, LastAlertedStatus, LastAlertedAt                  string
	LastHealthCheckDate, LastAttemptAt                                              string
}

func (d *DB) GetRobinhoodOAuth() RobinhoodOAuthRow {
	var row RobinhoodOAuthRow
	_ = d.SQL.QueryRow(`SELECT COALESCE(client_id,''), COALESCE(access_token,''), COALESCE(refresh_token,''),
        COALESCE(token_type,''), COALESCE(scope,''), COALESCE(expires_at,''), COALESCE(account_number,''),
        COALESCE(last_check_status,''), COALESCE(last_check_at,''), COALESCE(last_alerted_status,''),
        COALESCE(last_alerted_at,''), COALESCE(last_health_check_date,''), COALESCE(last_health_check_attempt_at,'')
        FROM robinhood_oauth WHERE id='current'`).
		Scan(&row.ClientID, &row.AccessToken, &row.RefreshToken, &row.TokenType, &row.Scope, &row.ExpiresAt,
			&row.AccountNumber, &row.LastCheckStatus, &row.LastCheckAt, &row.LastAlertedStatus, &row.LastAlertedAt,
			&row.LastHealthCheckDate, &row.LastAttemptAt)
	return row
}

func (d *DB) SaveRobinhoodClientID(clientID string) error {
	_, err := d.SQL.Exec(`INSERT INTO robinhood_oauth (id, client_id, created_at, updated_at)
        VALUES ('current', ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id, updated_at=datetime('now')`, clientID)
	return err
}

func (d *DB) SaveRobinhoodTokens(access, refresh, tokenType, scope, expiresAt string) error {
	_, err := d.SQL.Exec(`INSERT INTO robinhood_oauth (id, access_token, refresh_token, token_type, scope, expires_at, last_check_status, last_check_at, updated_at)
        VALUES ('current', ?, ?, ?, ?, ?, 'OK', datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            access_token=excluded.access_token,
            refresh_token=COALESCE(NULLIF(excluded.refresh_token,''), robinhood_oauth.refresh_token),
            token_type=excluded.token_type, scope=excluded.scope, expires_at=excluded.expires_at,
            last_check_status='OK', last_check_at=datetime('now'), updated_at=datetime('now')`,
		access, refresh, tokenType, scope, expiresAt)
	return err
}

func (d *DB) SaveRobinhoodAccount(account string) error {
	_, err := d.SQL.Exec(`UPDATE robinhood_oauth SET account_number=?, updated_at=datetime('now') WHERE id='current'`, account)
	return err
}

func (d *DB) UpsertRobinhoodHealth(todayET, status, attemptAt string) error {
	_, err := d.SQL.Exec(`INSERT INTO robinhood_oauth (id, last_check_status, last_health_check_date, last_health_check_attempt_at, updated_at)
        VALUES ('current', ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET last_check_status=excluded.last_check_status,
            last_health_check_date=excluded.last_health_check_date,
            last_health_check_attempt_at=excluded.last_health_check_attempt_at, updated_at=datetime('now')`, status, todayET, attemptAt)
	return err
}

func (d *DB) SetRobinhoodAlerted(status, at string) error {
	_, err := d.SQL.Exec(`INSERT INTO robinhood_oauth (id, last_alerted_status, last_alerted_at, updated_at)
        VALUES ('current', ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET last_alerted_status=excluded.last_alerted_status, last_alerted_at=excluded.last_alerted_at, updated_at=datetime('now')`, status, at)
	return err
}

func (d *DB) SetWebullAlerted(status, at string) error {
	_, err := d.SQL.Exec(`INSERT INTO webull_token (id, last_alerted_status, last_alerted_at, updated_at)
        VALUES ('current', ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET last_alerted_status=excluded.last_alerted_status, last_alerted_at=excluded.last_alerted_at, updated_at=datetime('now')`, status, at)
	return err
}

func (d *DB) ClearRobinhoodTokens() error {
	_, err := d.SQL.Exec(`UPDATE robinhood_oauth SET access_token='', refresh_token='', account_number='', last_check_status='MISSING', updated_at=datetime('now') WHERE id='current'`)
	return err
}

func (d *DB) SaveRobinhoodPending(state, verifier, redirect string) error {
	_, err := d.SQL.Exec(`INSERT INTO robinhood_oauth_pending (state, code_verifier, redirect_uri, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(state) DO UPDATE SET code_verifier=excluded.code_verifier, redirect_uri=excluded.redirect_uri, created_at=excluded.created_at`,
		state, verifier, redirect, time.Now().UTC().Format(time.RFC3339Nano))
	return err
}

func (d *DB) TakeRobinhoodPending(state string) (verifier, redirect string, err error) {
	var created string
	err = d.SQL.QueryRow(`SELECT code_verifier, redirect_uri, created_at FROM robinhood_oauth_pending WHERE state=?`, state).Scan(&verifier, &redirect, &created)
	if err == sql.ErrNoRows {
		return "", "", fmt.Errorf("unknown oauth state")
	}
	if err != nil {
		return "", "", err
	}
	_, _ = d.SQL.Exec(`DELETE FROM robinhood_oauth_pending WHERE state=?`, state)
	t, perr := time.Parse(time.RFC3339Nano, created)
	if perr != nil {
		t, _ = time.Parse(time.RFC3339, created)
	}
	if !t.IsZero() && time.Since(t) > 15*time.Minute {
		return "", "", fmt.Errorf("oauth state expired")
	}
	return verifier, redirect, nil
}

func (d *DB) AnyPendingTrackerFor(broker string) map[string]any {
	rows, err := d.ListPendingTrackers()
	if err != nil || len(rows) == 0 {
		return nil
	}
	if broker == "" {
		return rows[0]
	}
	for _, row := range rows {
		if fmt.Sprint(row["broker"]) == broker {
			return row
		}
	}
	return nil
}

func (d *DB) FindPendingTrackerBroker(symbol, action, broker string) map[string]any {
	rows, err := d.ListPendingTrackers()
	if err != nil {
		return nil
	}
	want := SafeTicker(symbol)
	for _, row := range rows {
		if action != "" && fmt.Sprint(row["action"]) != action {
			continue
		}
		if want != "" && SafeTicker(fmt.Sprint(row["symbol"])) != want {
			continue
		}
		if broker != "" && fmt.Sprint(row["broker"]) != broker {
			continue
		}
		return row
	}
	return nil
}
