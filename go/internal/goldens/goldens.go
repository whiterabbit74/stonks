package goldens

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"

	"mktorder.com/go/internal/types"
)

func Dir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "testdata", "goldens")
}

func Load(name string, dest interface{}) {
	b, err := os.ReadFile(filepath.Join(Dir(), name))
	if err != nil {
		panic(err)
	}
	if err := json.Unmarshal(b, dest); err != nil {
		panic(err)
	}
}

func Bars(name string) []types.OHLC {
	var bars []types.OHLC
	Load(name, &bars)
	return bars
}

func CompactTrades(name string) []types.CompactTrade {
	var t []types.CompactTrade
	Load(name, &t)
	return t
}

func MustAlmost(a, b, eps float64) bool {
	if a == b {
		return true
	}
	d := a - b
	if d < 0 {
		d = -d
	}
	scale := a
	if b > a {
		scale = b
	}
	if scale < 0 {
		scale = -scale
	}
	if scale < 1 {
		scale = 1
	}
	return d <= eps*scale
}
