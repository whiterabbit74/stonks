package store

import "testing"

// AUD-046: int(v*1e6+0.5) усекал к нулю, поэтому -100 превращалось в
// -99.999999 и каждый убыток попадал в журнал искажённым.
func TestRound6KeepsNegativeValuesExact(t *testing.T) {
	cases := map[float64]float64{
		-100: -100, -1: -1, -10.5: -10.5, 100: 100,
		0.1234565: 0.123457, -0.1234565: -0.123457,
	}
	for in, want := range cases {
		if got := round6(in); got != want {
			t.Fatalf("round6(%v) = %v, want %v", in, got, want)
		}
	}
}
