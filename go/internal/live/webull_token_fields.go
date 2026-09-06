package live

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Webull's token/create and token/check bodies do not agree on a name for the
// deadline or the status, and the payload can sit one level down under "data".
// The Node service this was ported from read every alias and normalised epoch
// values; the port kept two top-level keys, which is why production ran with an
// empty expires_at and no expiry warning at all.
func webullTokenField(data map[string]any, keys ...string) any {
	scopes := []map[string]any{data}
	if inner, ok := data["data"].(map[string]any); ok {
		scopes = append(scopes, inner)
	}
	for _, m := range scopes {
		for _, k := range keys {
			v, ok := m[k]
			if !ok || v == nil || v == "" {
				continue
			}
			return v
		}
	}
	return nil
}

func webullTokenValue(data map[string]any) string {
	s, _ := webullTokenField(data, "token", "access_token", "accessToken").(string)
	return s
}

func webullTokenStatus(data map[string]any) string {
	s, _ := webullTokenField(data, "status", "token_status", "tokenStatus").(string)
	return s
}

// webullTokenExpiry returns the deadline as RFC3339 - the format
// daysLeftUntil parses and the DB column stores. An unparseable value yields
// "", which SaveWebullTokenChecked leaves the stored deadline alone for.
func webullTokenExpiry(data map[string]any) string {
	v := webullTokenField(data, "expires", "expires_at", "expiresAt", "expiration_time",
		"expirationTime", "expire_time", "expireTime", "tokenExpireTime")
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return normalizeExpiryString(t)
	case float64:
		return epochToRFC3339(int64(t))
	case json.Number:
		n, err := t.Int64()
		if err != nil {
			return ""
		}
		return epochToRFC3339(n)
	default:
		return ""
	}
}

func normalizeExpiryString(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	// All-digit values are epoch seconds or milliseconds, as Webull sends for
	// some fields.
	var n int64
	if _, err := fmt.Sscanf(s, "%d", &n); err == nil && strings.Trim(s, "0123456789") == "" {
		return epochToRFC3339(n)
	}
	// "+0000" (no colon) is not RFC3339 but is what Webull's timestamps carry.
	for _, layout := range []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999-0700",
		"2006-01-02T15:04:05-0700",
		"2006-01-02 15:04:05",
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}
	return ""
}

func epochToRFC3339(n int64) string {
	if n <= 0 {
		return ""
	}
	if n < 1e12 {
		n *= 1000
	}
	return time.UnixMilli(n).UTC().Format(time.RFC3339)
}

// logUnknownExpiry records the field names a check response actually carried
// when none of the known aliases held a deadline. Without it an empty
// expires_at is indistinguishable from "Webull sent nothing", and the only way
// to learn the real name is to read a live response by hand.
func (e *Engine) logUnknownExpiry(data map[string]any) {
	if e.DB == nil || len(data) == 0 || e.DB.GetWebullToken().ExpiresAt != "" {
		return
	}
	keys := make([]string, 0, len(data))
	for k := range data {
		if inner, ok := data[k].(map[string]any); ok {
			for ik := range inner {
				keys = append(keys, k+"."+ik)
			}
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	_ = e.DB.AppendAutotradeLogKind("webull", "token check carried no known expiry field; response keys: "+strings.Join(keys, ", "))
}
