package indicators

import (
	"fmt"
	"math"

	"mktorder.com/go/internal/types"
)

func validatePeriod(period, dataLength int) error {
	if period <= 0 {
		return fmt.Errorf("Period must be a positive integer")
	}
	if period > dataLength {
		return fmt.Errorf("Period (%d) cannot be greater than data length (%d)", period, dataLength)
	}
	return nil
}

func SMA(data []float64, period int) ([]float64, error) {
	if err := validatePeriod(period, len(data)); err != nil {
		return nil, err
	}
	result := make([]float64, len(data))
	sum := 0.0
	for i := 0; i < len(data); i++ {
		if i < period-1 {
			sum += data[i]
			result[i] = math.NaN()
		} else if i == period-1 {
			sum += data[i]
			result[i] = sum / float64(period)
		} else {
			sum = sum - data[i-period] + data[i]
			result[i] = sum / float64(period)
		}
	}
	return result, nil
}

func EMA(data []float64, period int) ([]float64, error) {
	if err := validatePeriod(period, len(data)); err != nil {
		return nil, err
	}
	result := make([]float64, len(data))
	for i := range result {
		result[i] = math.NaN()
	}
	multiplier := 2.0 / float64(period+1)
	runningSum := 0.0
	for i := 0; i < len(data); i++ {
		if i < period-1 {
			runningSum += data[i]
		} else if i == period-1 {
			runningSum += data[i]
			result[i] = runningSum / float64(period)
		} else {
			result[i] = (data[i] * multiplier) + (result[i-1] * (1 - multiplier))
		}
	}
	return result, nil
}

func EMAFromStart(data []float64, period int) []float64 {
	result := make([]float64, len(data))
	if len(data) == 0 {
		return result
	}
	for i := range result {
		result[i] = math.NaN()
	}
	multiplier := 2.0 / float64(period+1)
	result[0] = data[0]
	for i := 1; i < len(data); i++ {
		result[i] = (data[i] * multiplier) + (result[i-1] * (1 - multiplier))
	}
	return result
}

func RSI(data []float64, period int) []float64 {
	result := make([]float64, len(data))
	if len(data) < period+1 {
		for i := range result {
			result[i] = math.NaN()
		}
		return result
	}
	var avgGain, avgLoss, sumGains, sumLosses float64
	for i := 0; i < len(data); i++ {
		if i == 0 {
			result[i] = math.NaN()
			continue
		}
		change := data[i] - data[i-1]
		gain, loss := 0.0, 0.0
		if change > 0 {
			gain = change
		} else if change < 0 {
			loss = math.Abs(change)
		}
		if i <= period {
			sumGains += gain
			sumLosses += loss
			if i < period {
				result[i] = math.NaN()
			} else {
				avgGain = sumGains / float64(period)
				avgLoss = sumLosses / float64(period)
				if avgLoss == 0 {
					result[i] = 100
				} else {
					rs := avgGain / avgLoss
					result[i] = 100 - (100 / (1 + rs))
				}
			}
		} else {
			avgGain = (avgGain*float64(period-1) + gain) / float64(period)
			avgLoss = (avgLoss*float64(period-1) + loss) / float64(period)
			if avgLoss == 0 {
				result[i] = 100
			} else {
				rs := avgGain / avgLoss
				result[i] = 100 - (100 / (1 + rs))
			}
		}
	}
	return result
}

func IBS(ohlc []types.OHLC) []float64 {
	if len(ohlc) == 0 {
		panic("OHLC data is required for IBS calculation")
	}
	result := make([]float64, len(ohlc))
	for i, bar := range ohlc {
		high, low, close := bar.High, bar.Low, bar.Close
		if high < low || close < low || close > high {
			result[i] = 0.5
			continue
		}
		if high == low {
			result[i] = 0.5
			continue
		}
		result[i] = (close - low) / (high - low)
	}
	return result
}
