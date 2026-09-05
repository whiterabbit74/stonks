package webull

import (
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

func md5Upper(s string) string {
	sum := md5.Sum([]byte(s))
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}

func encodeURIComponent(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '!' || c == '~' || c == '*' || c == '\'' || c == '(' || c == ')' {
			b.WriteByte(c)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", c)
	}
	return b.String()
}

func BuildSignature(path string, query map[string]string, bodyString string, headersToSign map[string]string, appSecret string) string {
	merged := map[string]string{}
	for k, v := range query {
		if v == "" {
			continue
		}
		if _, clash := headersToSign[k]; clash {
			continue
		}
		merged[k] = v
	}
	for k, v := range headersToSign {
		if v == "" {
			continue
		}
		merged[k] = v
	}
	keys := make([]string, 0, len(merged))
	for k := range merged {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+merged[k])
	}
	str1 := strings.Join(parts, "&")
	str3 := path + "&" + str1
	if bodyString != "" {
		str3 = str3 + "&" + md5Upper(bodyString)
	}
	mac := hmac.New(sha1.New, []byte(appSecret+"&"))
	_, _ = mac.Write([]byte(encodeURIComponent(str3)))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
