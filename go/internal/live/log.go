package live

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

func newCorrelationID() string {
	return strings.ReplaceAll(uuid.NewString(), "-", "")
}

func formatLog(channel, event, corr string, kv map[string]any) string {
	var b strings.Builder
	if channel != "" {
		b.WriteString(channel)
		b.WriteByte(' ')
	}
	b.WriteString("event=")
	b.WriteString(event)
	if corr != "" {
		b.WriteString(" correlationId=")
		b.WriteString(corr)
	}
	if len(kv) == 0 {
		return b.String()
	}
	keys := make([]string, 0, len(kv))
	for k := range kv {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		v := kv[k]
		if v == nil {
			continue
		}
		s := fmt.Sprint(v)
		if s == "" || s == "<nil>" {
			continue
		}
		if strings.ContainsAny(s, " \t") {
			s = strconv.Quote(s)
		}
		b.WriteByte(' ')
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(s)
	}
	return b.String()
}

func (e *Engine) logAuto(event, corr string, kv map[string]any) {
	if e == nil || e.DB == nil {
		return
	}
	_ = e.DB.AppendAutotradeLog(formatLog("autotrade", event, corr, kv))
}

func (e *Engine) logMonitor(event, corr string, kv map[string]any) {
	if e == nil || e.DB == nil {
		return
	}
	_ = e.DB.AppendAutotradeLog(formatLog("monitor", event, corr, kv))
}

func (e *Engine) logBrokerRaw(event, corr string, kv map[string]any) {
	if e == nil || e.DB == nil {
		return
	}
	_ = e.DB.AppendAutotradeLog(formatLog("brokerRaw", event, corr, kv))
}

func splitLogChannel(msg string) string {
	msg = strings.TrimSpace(msg)
	if strings.HasPrefix(msg, "monitor ") {
		return "monitor"
	}
	if strings.HasPrefix(msg, "brokerRaw ") {
		return "brokerRaw"
	}
	return "autotrade"
}
