package httpapi

import (
	"fmt"
	"strings"

	"mktorder.com/go/internal/store"
)

// legBroker names the broker behind a row, for tests that used to read the
// `broker` column.
func legBroker(v any) string {
	switch row := v.(type) {
	case store.Position:
		if row.Robinhood.Executed() {
			return "robinhood"
		}
		if row.Webull.Executed() {
			return "webull"
		}
		return ""
	case map[string]any:
		got := strings.TrimSpace(fmt.Sprint(row["broker"]))
		if got == "<nil>" {
			return ""
		}
		return got
	}
	return ""
}
