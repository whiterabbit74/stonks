package httpapi

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// AUD-N13: пустое числовое поле формы настроек уходило на сервер как 0.
// lowIBS = 0 означает «никогда не входить», порог проскальзывания 0 — резерв в
// ноль: обе настройки молча меняют торговое поведение и выглядят осознанными.
// Браузер не даёт отправить форму с пустым required-полем.
func TestAutotradeNumberInputsAreRequired(t *testing.T) {
	app, err := os.ReadFile("../web/js/app.js")
	if err != nil {
		app, err = os.ReadFile("../../web/js/app.js")
	}
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	for _, name := range []string{"autoLowIBS", "autoHighIBS", "autoWindow", "autoSlippage", "autoEntryReserve"} {
		re := regexp.MustCompile(`<input name="` + name + `"[^>]*>`)
		tag := re.FindString(a)
		if tag == "" {
			t.Errorf("поле %s не найдено в форме настроек", name)
			continue
		}
		if !strings.Contains(tag, " required") {
			t.Errorf("поле %s без required: пустое значение уйдёт на сервер как 0 — %s", name, tag)
		}
	}
}
