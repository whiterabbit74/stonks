package youtube

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const defaultPlayerEndpoint = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
const defaultWatchEndpoint = "https://www.youtube.com/watch"
const innerTubeClientVersion = "20.10.38"

var videoIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

type Request struct {
	Video    string
	Language string
	MaxChars int
}

type Transcript struct {
	VideoID   string    `json:"video_id"`
	Title     string    `json:"title"`
	Language  string    `json:"language"`
	Text      string    `json:"text"`
	Segments  []Segment `json:"segments"`
	Truncated bool      `json:"truncated"`
}

type Segment struct {
	StartSeconds    float64 `json:"start_seconds"`
	DurationSeconds float64 `json:"duration_seconds"`
	Text            string  `json:"text"`
}

type Client struct {
	HTTPClient                  *http.Client
	PlayerEndpoint              string
	WatchEndpoint               string
	AllowNonYouTubeCaptionHosts bool
	UserAgent                   string
}

func ParseVideoID(input string) (string, error) {
	raw := strings.TrimSpace(input)
	if videoIDPattern.MatchString(raw) {
		return raw, nil
	}

	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("expected a YouTube URL or 11-character video ID")
	}
	if parsed.User != nil {
		return "", fmt.Errorf("YouTube URL must not contain credentials")
	}

	host := strings.ToLower(parsed.Hostname())
	var candidate string

	switch {
	case host == "youtu.be":
		candidate = firstPathSegment(parsed.Path)
	case isYouTubeHost(host):
		candidate = parsed.Query().Get("v")
		if candidate == "" {
			segments := strings.Split(strings.Trim(parsed.EscapedPath(), "/"), "/")
			if len(segments) >= 2 {
				switch segments[0] {
				case "embed", "shorts", "live":
					candidate, _ = url.PathUnescape(segments[1])
				}
			}
		}
	default:
		return "", fmt.Errorf("unsupported video URL host")
	}

	if !videoIDPattern.MatchString(candidate) {
		return "", fmt.Errorf("could not find a valid YouTube video ID")
	}
	return candidate, nil
}

func firstPathSegment(path string) string {
	segment := strings.Trim(path, "/")
	if idx := strings.IndexByte(segment, '/'); idx >= 0 {
		segment = segment[:idx]
	}
	decoded, err := url.PathUnescape(segment)
	if err != nil {
		return segment
	}
	return decoded
}

func isYouTubeHost(host string) bool {
	return host == "youtube.com" ||
		host == "www.youtube.com" ||
		host == "m.youtube.com" ||
		host == "music.youtube.com" ||
		host == "youtube-nocookie.com" ||
		host == "www.youtube-nocookie.com"
}

func (c Client) GetTranscript(ctx context.Context, req Request) (Transcript, error) {
	videoID, err := ParseVideoID(req.Video)
	if err != nil {
		return Transcript{}, err
	}

	player, err := c.fetchPlayer(ctx, videoID)
	if err != nil {
		return Transcript{}, err
	}

	track, err := selectTrack(player.CaptionTracks, req.Language)
	if err != nil {
		return Transcript{}, err
	}
	if err := c.validateCaptionURL(track.BaseURL); err != nil {
		return Transcript{}, err
	}

	body, err := c.fetchCaption(ctx, track.BaseURL)
	if err != nil {
		return Transcript{}, err
	}
	segments, err := ParseCaption(body)
	if err != nil {
		return Transcript{}, err
	}
	if len(segments) == 0 {
		return Transcript{}, fmt.Errorf("caption track is empty")
	}

	text := joinSegments(segments)
	truncated := false
	if req.MaxChars > 0 && len([]rune(text)) > req.MaxChars {
		text = string([]rune(text)[:req.MaxChars])
		truncated = true
	}

	return Transcript{
		VideoID:   videoID,
		Title:     player.Title,
		Language:  track.LanguageCode,
		Text:      text,
		Segments:  segments,
		Truncated: truncated,
	}, nil
}

func (c Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: 20 * time.Second}
}

func (c Client) endpoint() string {
	if c.PlayerEndpoint != "" {
		return c.PlayerEndpoint
	}
	return defaultPlayerEndpoint
}

func (c Client) watchEndpoint() string {
	if c.WatchEndpoint != "" {
		return c.WatchEndpoint
	}
	return defaultWatchEndpoint
}

func (c Client) userAgent() string {
	if c.UserAgent != "" {
		return c.UserAgent
	}
	return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)"
}

func (c Client) innerTubeUserAgent() string {
	return "com.google.android.youtube/" + innerTubeClientVersion + " (Linux; U; Android 14)"
}

type playerData struct {
	Title         string
	CaptionTracks []captionTrack
}

type captionTrack struct {
	BaseURL      string
	LanguageCode string
	Name         string
	Kind         string
}

func (c Client) fetchPlayer(ctx context.Context, videoID string) (playerData, error) {
	payload := map[string]any{
		"context": map[string]any{
			"client": map[string]any{
				"clientName":    "ANDROID",
				"clientVersion": innerTubeClientVersion,
			},
		},
		"videoId": videoID,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return playerData{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint(), bytes.NewReader(body))
	if err != nil {
		return playerData{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", c.innerTubeUserAgent())

	response, err := c.httpClient().Do(request)
	if err != nil {
		return c.fetchWatchPlayer(ctx, videoID, fmt.Errorf("youtube player request failed: %w", err))
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return c.fetchWatchPlayer(ctx, videoID, fmt.Errorf("youtube player returned HTTP %d", response.StatusCode))
	}

	raw, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return playerData{}, err
	}

	return parsePlayerJSON(raw)
}

func parsePlayerJSON(raw []byte) (playerData, error) {
	var decoded struct {
		VideoDetails struct {
			Title string `json:"title"`
		} `json:"videoDetails"`
		Captions struct {
			PlayerCaptionsTracklistRenderer struct {
				CaptionTracks []struct {
					BaseURL      string `json:"baseUrl"`
					LanguageCode string `json:"languageCode"`
					Kind         string `json:"kind"`
					Name         struct {
						SimpleText string `json:"simpleText"`
						Runs       []struct {
							Text string `json:"text"`
						} `json:"runs"`
					} `json:"name"`
				} `json:"captionTracks"`
			} `json:"playerCaptionsTracklistRenderer"`
		} `json:"captions"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return playerData{}, fmt.Errorf("youtube player response is not valid JSON: %w", err)
	}

	tracks := make([]captionTrack, 0, len(decoded.Captions.PlayerCaptionsTracklistRenderer.CaptionTracks))
	for _, track := range decoded.Captions.PlayerCaptionsTracklistRenderer.CaptionTracks {
		name := track.Name.SimpleText
		if name == "" {
			parts := make([]string, 0, len(track.Name.Runs))
			for _, run := range track.Name.Runs {
				parts = append(parts, run.Text)
			}
			name = strings.TrimSpace(strings.Join(parts, " "))
		}
		if track.BaseURL != "" && track.LanguageCode != "" {
			tracks = append(tracks, captionTrack{
				BaseURL:      track.BaseURL,
				LanguageCode: track.LanguageCode,
				Name:         name,
				Kind:         track.Kind,
			})
		}
	}
	if len(tracks) == 0 {
		return playerData{}, fmt.Errorf("no transcript captions are available for this video")
	}

	return playerData{Title: decoded.VideoDetails.Title, CaptionTracks: tracks}, nil
}

func (c Client) fetchWatchPlayer(ctx context.Context, videoID string, primaryErr error) (playerData, error) {
	watchURL, err := url.Parse(c.watchEndpoint())
	if err != nil {
		return playerData{}, primaryErr
	}
	query := watchURL.Query()
	query.Set("v", videoID)
	watchURL.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, watchURL.String(), nil)
	if err != nil {
		return playerData{}, primaryErr
	}
	request.Header.Set("User-Agent", c.userAgent())
	request.Header.Set("Accept-Language", "en-US,en;q=0.9")

	response, err := c.httpClient().Do(request)
	if err != nil {
		return playerData{}, fmt.Errorf("%v; watch page request failed: %w", primaryErr, err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return playerData{}, fmt.Errorf("%v; watch page returned HTTP %d", primaryErr, response.StatusCode)
	}

	raw, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return playerData{}, err
	}
	playerJSON, err := extractInitialPlayerResponse(raw)
	if err != nil {
		return playerData{}, fmt.Errorf("%v; %w", primaryErr, err)
	}
	return parsePlayerJSON(playerJSON)
}

func extractInitialPlayerResponse(raw []byte) ([]byte, error) {
	input := string(raw)
	markers := []string{
		"ytInitialPlayerResponse",
		`"playerResponse"`,
	}
	for _, marker := range markers {
		idx := strings.Index(input, marker)
		for idx >= 0 {
			brace := strings.IndexByte(input[idx:], '{')
			if brace < 0 {
				break
			}
			start := idx + brace
			end, ok := findMatchingBrace(input, start)
			if ok {
				return []byte(input[start:end]), nil
			}
			next := strings.Index(input[idx+len(marker):], marker)
			if next < 0 {
				break
			}
			idx += len(marker) + next
		}
	}
	return nil, fmt.Errorf("could not find ytInitialPlayerResponse in watch page")
}

func findMatchingBrace(input string, start int) (int, bool) {
	depth := 0
	inString := false
	escaped := false

	for i := start; i < len(input); i++ {
		ch := input[i]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			switch ch {
			case '\\':
				escaped = true
			case '"':
				inString = false
			}
			continue
		}

		switch ch {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i + 1, true
			}
		}
	}
	return 0, false
}

func selectTrack(tracks []captionTrack, language string) (captionTrack, error) {
	if len(tracks) == 0 {
		return captionTrack{}, fmt.Errorf("no caption tracks are available")
	}
	want := strings.ToLower(strings.TrimSpace(language))
	if want == "" {
		return tracks[0], nil
	}
	for _, track := range tracks {
		if strings.ToLower(track.LanguageCode) == want {
			return track, nil
		}
	}
	for _, track := range tracks {
		code := strings.ToLower(track.LanguageCode)
		if strings.HasPrefix(code, want+"-") || strings.HasPrefix(want, code+"-") {
			return track, nil
		}
	}
	return captionTrack{}, fmt.Errorf("transcript language %q is not available", language)
}

func (c Client) validateCaptionURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("caption URL is invalid")
	}
	if parsed.User != nil {
		return fmt.Errorf("caption URL must not contain credentials")
	}
	if c.AllowNonYouTubeCaptionHosts {
		return nil
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("caption URL must use HTTPS")
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "youtube.com" || strings.HasSuffix(host, ".youtube.com") {
		return nil
	}
	return fmt.Errorf("caption URL host is not allowed")
}

func (c Client) fetchCaption(ctx context.Context, raw string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", c.userAgent())

	response, err := c.httpClient().Do(request)
	if err != nil {
		return nil, fmt.Errorf("caption request failed: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("caption request returned HTTP %d", response.StatusCode)
	}
	return io.ReadAll(io.LimitReader(response.Body, 12<<20))
}

func ParseCaption(raw []byte) ([]Segment, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, errors.New("caption response is empty")
	}
	if trimmed[0] == '{' {
		return parseJSON3(trimmed)
	}
	return ParseTimedTextXML(trimmed)
}

func parseJSON3(raw []byte) ([]Segment, error) {
	var decoded struct {
		Events []struct {
			StartMS  float64 `json:"tStartMs"`
			Duration float64 `json:"dDurationMs"`
			Segments []struct {
				UTF8 string `json:"utf8"`
			} `json:"segs"`
		} `json:"events"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("caption JSON is invalid: %w", err)
	}

	segments := make([]Segment, 0, len(decoded.Events))
	for _, event := range decoded.Events {
		parts := make([]string, 0, len(event.Segments))
		for _, seg := range event.Segments {
			text := normalizeText(seg.UTF8)
			if text != "" {
				parts = append(parts, text)
			}
		}
		text := normalizeText(strings.Join(parts, " "))
		if text == "" {
			continue
		}
		segments = append(segments, Segment{
			StartSeconds:    event.StartMS / 1000,
			DurationSeconds: event.Duration / 1000,
			Text:            text,
		})
	}
	return segments, nil
}

func ParseTimedTextXML(raw []byte) ([]Segment, error) {
	decoder := xml.NewDecoder(bytes.NewReader(raw))
	segments := make([]Segment, 0)

	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("caption XML is invalid: %w", err)
		}
		start, ok := token.(xml.StartElement)
		if !ok {
			continue
		}

		switch start.Name.Local {
		case "text":
			segment, err := decodeTextElement(decoder, start)
			if err != nil {
				return nil, err
			}
			if segment.Text != "" {
				segments = append(segments, segment)
			}
		case "p":
			segment, err := decodeParagraphElement(decoder, start)
			if err != nil {
				return nil, err
			}
			if segment.Text != "" {
				segments = append(segments, segment)
			}
		}
	}
	return segments, nil
}

func decodeTextElement(decoder *xml.Decoder, start xml.StartElement) (Segment, error) {
	var body string
	if err := decoder.DecodeElement(&body, &start); err != nil {
		return Segment{}, err
	}
	return Segment{
		StartSeconds:    parseFloatAttr(start.Attr, "start"),
		DurationSeconds: parseFloatAttr(start.Attr, "dur"),
		Text:            normalizeText(body),
	}, nil
}

func decodeParagraphElement(decoder *xml.Decoder, start xml.StartElement) (Segment, error) {
	var body struct {
		CharData string   `xml:",chardata"`
		Runs     []string `xml:"s"`
	}
	if err := decoder.DecodeElement(&body, &start); err != nil {
		return Segment{}, err
	}

	parts := make([]string, 0, len(body.Runs)+1)
	if text := normalizeText(body.CharData); text != "" {
		parts = append(parts, text)
	}
	for _, run := range body.Runs {
		if text := normalizeText(run); text != "" {
			parts = append(parts, text)
		}
	}
	return Segment{
		StartSeconds:    parseFloatAttr(start.Attr, "t") / 1000,
		DurationSeconds: parseFloatAttr(start.Attr, "d") / 1000,
		Text:            normalizeText(strings.Join(parts, " ")),
	}, nil
}

func parseFloatAttr(attrs []xml.Attr, name string) float64 {
	for _, attr := range attrs {
		if attr.Name.Local != name {
			continue
		}
		value, err := strconv.ParseFloat(attr.Value, 64)
		if err == nil {
			return value
		}
	}
	return 0
}

func normalizeText(input string) string {
	text := html.UnescapeString(input)
	text = strings.ReplaceAll(text, "\u200b", "")
	return strings.Join(strings.Fields(text), " ")
}

func joinSegments(segments []Segment) string {
	parts := make([]string, 0, len(segments))
	for _, segment := range segments {
		if segment.Text != "" {
			parts = append(parts, segment.Text)
		}
	}
	return strings.Join(parts, " ")
}
