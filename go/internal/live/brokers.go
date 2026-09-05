package live

import (
	"sort"
	"strings"
)

type WebullExtras interface {
	CreateToken() (map[string]any, error)
	CheckToken(token string) (map[string]any, error)
	Calendar() (jsonRaw []byte, err error)
	CalendarDays(start, end string) ([]map[string]any, error)
	RawSplits(symbol string) ([]map[string]any, error)
}

var brokerBoolFields = []string{"enabled", "allowNewEntries", "allowExits"}

// sanitizeBrokers merges an explicit "brokers" patch (P2-2) and then fills
// missing brokers.webull keys from the flat next config (B-1). Nested keys
// that are already set are never overwritten; robinhood is never filled
// from flat. An omitted "brokers" object is not treated as "copy everything
// onto webull".
func sanitizeBrokers(input, current, nextFlat map[string]any) map[string]any {
	out := map[string]any{}
	if cur, ok := current["brokers"].(map[string]any); ok {
		for k, v := range cur {
			if m, ok := v.(map[string]any); ok {
				out[k] = copyStringAnyMap(m)
			}
		}
	}
	if raw, hasNested := input["brokers"].(map[string]any); hasNested {
		for name, v := range raw {
			if name != "webull" && name != "robinhood" {
				continue
			}
			patch, ok := v.(map[string]any)
			if !ok {
				continue
			}
			cur, _ := out[name].(map[string]any)
			if cur == nil {
				cur = map[string]any{}
			}
			for _, f := range brokerBoolFields {
				if b, ok := patch[f].(bool); ok {
					cur[f] = b
				}
			}
			out[name] = cur
		}
	}
	fillMissingWebullFromFlat(out, nextFlat, input)
	return out
}

func fillMissingWebullFromFlat(out, flat, input map[string]any) {
	webull, _ := out["webull"].(map[string]any)
	if webull == nil {
		webull = map[string]any{}
	}
	var named map[string]any
	if brokers, _ := input["brokers"].(map[string]any); brokers != nil {
		named, _ = brokers["webull"].(map[string]any)
	}
	filled := false
	for _, f := range brokerBoolFields {
		if cfgHas(webull, f) || !cfgHas(flat, f) {
			continue
		}
		val := asBool(flat[f])
		// A flat PATCH always includes enabled (the master toggle). Treating
		// that as "named" wrote brokers.webull.enabled=false on the first
		// settings save and froze the broker off: P2-2 will not overwrite a
		// set nested key. Persist a missing key only when the flat value is
		// true (legacy "this was on") or input.brokers.webull names it.
		if !val && !cfgHas(named, f) {
			continue
		}
		webull[f] = val
		filled = true
	}
	if filled {
		out["webull"] = webull
	}
}

func brokerFlags(cfg map[string]any, name string) (enabled, allowEntries, allowExits bool) {
	if cfg == nil {
		return false, false, false
	}
	if brokers, _ := cfg["brokers"].(map[string]any); brokers != nil {
		if b, ok := brokers[name].(map[string]any); ok {
			enabled = asBool(b["enabled"])
			allowEntries = asBool(b["allowNewEntries"])
			allowExits = asBool(b["allowExits"])
			if name == "webull" {
				if !cfgHas(b, "enabled") {
					enabled = asBool(cfg["enabled"])
				}
				if !cfgHas(b, "allowNewEntries") {
					allowEntries = allowFlag(cfg, "allowNewEntries")
				}
				if !cfgHas(b, "allowExits") {
					allowExits = allowFlag(cfg, "allowExits")
				}
			}
			return enabled, allowEntries, allowExits
		}
	}
	if name == "webull" {
		return asBool(cfg["enabled"]), allowFlag(cfg, "allowNewEntries"), allowFlag(cfg, "allowExits")
	}
	return false, false, false
}

func (e *Engine) anyBrokerLive(cfg map[string]any) bool {
	if e == nil {
		return false
	}
	for _, name := range []string{"webull", "robinhood"} {
		enabled, _, _ := brokerFlags(cfg, name)
		if enabled && e.brokerHasWorkingToken(name) {
			return true
		}
	}
	return false
}

func (e *Engine) brokerHasWorkingToken(name string) bool {
	st := e.storedHealthStatus(name)
	if st == HealthNeedsReauth || st == HealthMissing {
		return false
	}
	if e.DB == nil {
		return false
	}
	if name == "robinhood" {
		row := e.DB.GetRobinhoodOAuth()
		return strings.TrimSpace(row.AccessToken) != "" || strings.TrimSpace(row.RefreshToken) != ""
	}
	tok := e.TokenStatus()
	has, _ := tok["hasToken"].(bool)
	return has
}

func (e *Engine) evalLive(cfg map[string]any) bool {
	return asBool(cfg["enabled"]) && e.anyBrokerLive(cfg)
}

func anyAllow(cfg map[string]any, key string) bool {
	if allowFlag(cfg, key) {
		return true
	}
	brokers, _ := cfg["brokers"].(map[string]any)
	for _, v := range brokers {
		b, _ := v.(map[string]any)
		if asBool(b["enabled"]) && asBool(b[key]) {
			return true
		}
	}
	return false
}

type namedBroker struct {
	name string
	br   Broker
}

func (e *Engine) AttachBroker(name string, b Broker) {
	if e == nil || name == "" || b == nil {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.Brokers == nil {
		e.Brokers = map[string]Broker{}
	}
	if e.Broker != nil {
		if _, ok := e.Brokers["webull"]; !ok {
			e.Brokers["webull"] = e.Broker
		}
	}
	e.Brokers[name] = b
}

func (e *Engine) DetachBroker(name string) {
	if e == nil {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.Brokers != nil {
		delete(e.Brokers, name)
	}
}

func (e *Engine) BrokerNamed(name string) Broker {
	for _, nb := range e.brokerSnapshot() {
		if nb.name == name {
			return nb.br
		}
	}
	return nil
}

// defaultBroker is the Webull adapter on e.Broker. Use it only where the
// caller is already Webull-specific (token/calendar extras, unlabeled
// legacy trackers). A tracker or order that names a broker must go through
// BrokerNamed / the broker already in hand — not this fallback.
func (e *Engine) defaultBroker() Broker {
	if e == nil {
		return nil
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.Broker
}

func (e *Engine) brokerSnapshot() []namedBroker {
	if e == nil {
		return nil
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.brokerSnapshotLocked()
}

func (e *Engine) brokerSnapshotLocked() []namedBroker {
	seen := map[string]Broker{}
	if len(e.Brokers) > 0 {
		for k, v := range e.Brokers {
			if v != nil {
				seen[k] = v
			}
		}
	} else if e.Broker != nil {
		seen["webull"] = e.Broker
	}
	var out []namedBroker
	for _, name := range []string{"webull", "robinhood"} {
		if b, ok := seen[name]; ok {
			out = append(out, namedBroker{name, b})
			delete(seen, name)
		}
	}
	extras := make([]string, 0, len(seen))
	for k := range seen {
		extras = append(extras, k)
	}
	sort.Strings(extras)
	for _, k := range extras {
		out = append(out, namedBroker{k, seen[k]})
	}
	return out
}

func (e *Engine) brokerMap() map[string]Broker {
	out := map[string]Broker{}
	for _, nb := range e.brokerSnapshot() {
		out[nb.name] = nb.br
	}
	return out
}

func (e *Engine) webullExtras() WebullExtras {
	b := e.BrokerNamed("webull")
	if b == nil {
		// Token/calendar/splits exist only on the Webull adapter. e.Broker
		// is that adapter when Brokers["webull"] has not been attached yet.
		b = e.defaultBroker()
	}
	x, _ := b.(WebullExtras)
	return x
}
