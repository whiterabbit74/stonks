package store

import (
	"fmt"
	"strings"
)

// legBroker names the broker behind a row, for tests that used to read the
// `broker` column. A position says it through whichever leg executed; a tracker
// row still carries the column itself.
func legBroker(v any) string {
	switch row := v.(type) {
	case Position:
		if row.Robinhood.Executed() {
			return "robinhood"
		}
		if row.Webull.Executed() {
			return "webull"
		}
		return ""
	case *Position:
		if row == nil {
			return ""
		}
		return legBroker(*row)
	case map[string]any:
		got := strings.TrimSpace(fmt.Sprint(row["broker"]))
		if got == "<nil>" {
			return ""
		}
		return got
	}
	return ""
}
