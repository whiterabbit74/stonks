package live

type WebullExtras interface {
	CreateToken() (map[string]any, error)
	CheckToken(token string) (map[string]any, error)
	Calendar() (jsonRaw []byte, err error)
	CalendarDays(start, end string) ([]map[string]any, error)
	RawSplits(symbol string) ([]map[string]any, error)
}

var brokerBoolFields = []string{"enabled", "allowNewEntries", "allowExits"}

func sanitizeBrokers(input, current, nextFlat map[string]any) map[string]any {
	out := map[string]any{}
	if cur, ok := current["brokers"].(map[string]any); ok {
		for k, v := range cur {
			if m, ok := v.(map[string]any); ok {
				out[k] = copyStringAnyMap(m)
			}
		}
	}
	raw, hasNested := input["brokers"].(map[string]any)
	if hasNested {
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
		return out
	}
	wmap, _ := out["webull"].(map[string]any)
	if wmap == nil {
		wmap = map[string]any{}
	}
	for _, f := range brokerBoolFields {
		if b, ok := input[f].(bool); ok {
			wmap[f] = b
		} else if b, ok := nextFlat[f].(bool); ok {
			wmap[f] = b
		}
	}
	if len(wmap) > 0 {
		out["webull"] = wmap
	}
	return out
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

func anyAllow(cfg map[string]any, key string) bool {
	if allowFlag(cfg, key) {
		return true
	}
	brokers, _ := cfg["brokers"].(map[string]any)
	for _, v := range brokers {
		b, _ := v.(map[string]any)
		if asBool(b[key]) {
			return true
		}
	}
	return false
}

func (e *Engine) brokerMap() map[string]Broker {
	if e == nil {
		return nil
	}
	if len(e.Brokers) > 0 {
		return e.Brokers
	}
	if e.Broker != nil {
		return map[string]Broker{"webull": e.Broker}
	}
	return map[string]Broker{}
}

func (e *Engine) webullExtras() WebullExtras {
	b := e.brokerMap()["webull"]
	if b == nil {
		b = e.Broker
	}
	x, _ := b.(WebullExtras)
	return x
}
