package live

import (
	"strings"
	"time"
	"mktorder.com/go/internal/tradingdate"
)

const (
	HealthOK           = "OK"
	HealthExpiringSoon = "EXPIRING_SOON"
	HealthNeedsReauth  = "NEEDS_REAUTH"
	HealthUnreachable  = "UNREACHABLE"
	HealthMissing      = "MISSING"
)

type BrokerHealth struct {
	Broker    string `json:"broker"`
	Status    string `json:"status"`
	CheckedAt string `json:"checkedAt"`
	ExpiresAt string `json:"expiresAt,omitempty"`
	DaysLeft  *int   `json:"daysLeft"`
	Detail    string `json:"detail,omitempty"`
}

func ClassifyWebullHealth(token, checkStatus, expiresAt string, now time.Time) (status string, daysLeft *int) {
	if strings.TrimSpace(token) == "" {
		return HealthMissing, nil
	}
	st := strings.ToUpper(strings.TrimSpace(checkStatus))
	if st == "UNKNOWN" || st == "UNREACHABLE" {
		return HealthUnreachable, daysLeftUntil(expiresAt, now)
	}
	if st != "" && st != "NORMAL" && st != "OK" && st != HealthExpiringSoon {
		return HealthNeedsReauth, daysLeftUntil(expiresAt, now)
	}
	dl := daysLeftUntil(expiresAt, now)
	if dl != nil && *dl <= 3 {
		return HealthExpiringSoon, dl
	}
	return HealthOK, dl
}

func daysLeftUntil(expiresAt string, now time.Time) *int {
	expiresAt = strings.TrimSpace(expiresAt)
	if expiresAt == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, expiresAt)
	}
	if err != nil {
		return nil
	}
	loc, err := time.LoadLocation(tradingdate.NYZone)
	if err != nil {
		loc = time.UTC
	}
	d := int(t.In(loc).Sub(now.In(loc)).Hours() / 24)
	return &d
}

func RecordedHealth(previous, observed string) string {
	if observed == HealthUnreachable && previous != "" && previous != HealthUnreachable {
		return previous
	}
	return observed
}

func ShouldHealthAlert(prevAlerted, status string, lastAlertedAt time.Time, now time.Time) (send bool, kind string) {
	switch status {
	case HealthNeedsReauth, HealthMissing, HealthExpiringSoon:
		if prevAlerted != status {
			return true, "transition"
		}
		if !lastAlertedAt.IsZero() && now.Sub(lastAlertedAt) >= 72*time.Hour {
			return true, "repeat"
		}
		return false, ""
	case HealthOK:
		if prevAlerted == HealthNeedsReauth || prevAlerted == HealthMissing || prevAlerted == HealthExpiringSoon {
			return true, "restored"
		}
	}
	return false, ""
}

func HealthAlertText(broker, status, kind string) string {
	name := "Webull"
	if broker == "robinhood" {
		name = "Robinhood"
	}
	if kind == "restored" {
		return "<b>" + name + ": доступ восстановлен</b>\nСтатус: OK"
	}
	if status == HealthExpiringSoon {
		if broker == "robinhood" {
			return "<b>" + name + ": доступ истекает</b>\nОсталось ≤ 3 дней. Пройдите копи-паст авторизацию на вкладке Robinhood → Подключение."
		}
		return "<b>" + name + ": токен истекает</b>\nОсталось ≤ 3 дней. Перевыпустите токен на вкладке Webull."
	}
	if broker == "robinhood" {
		return "<b>" + name + ": требуется переавторизация</b>\nПройдите копи-паст авторизацию на вкладке Robinhood → Подключение."
	}
	return "<b>" + name + ": требуется переавторизация</b>\nПеревыпустите токен на вкладке Webull."
}
