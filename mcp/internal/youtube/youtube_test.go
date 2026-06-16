package youtube

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseVideoID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "watch URL",
			input: "https://www.youtube.com/watch?v=VjOLmNaqEKQ&ab_channel=test",
			want:  "VjOLmNaqEKQ",
		},
		{
			name:  "short URL",
			input: "https://youtu.be/VjOLmNaqEKQ?t=14",
			want:  "VjOLmNaqEKQ",
		},
		{
			name:  "embed URL",
			input: "https://www.youtube.com/embed/VjOLmNaqEKQ",
			want:  "VjOLmNaqEKQ",
		},
		{
			name:  "raw ID",
			input: "VjOLmNaqEKQ",
			want:  "VjOLmNaqEKQ",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseVideoID(tt.input)
			if err != nil {
				t.Fatalf("ParseVideoID returned error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("ParseVideoID() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseVideoIDRejectsUnexpectedHost(t *testing.T) {
	t.Parallel()

	if _, err := ParseVideoID("https://example.com/watch?v=VjOLmNaqEKQ"); err == nil {
		t.Fatal("ParseVideoID accepted non-YouTube URL")
	}
}

func TestParseTimedTextXML(t *testing.T) {
	t.Parallel()

	input := []byte(`<transcript>
		<text start="1.23" dur="2">Hello &amp; world</text>
		<text start="3.50" dur="1.5">second line</text>
	</transcript>`)

	got, err := ParseTimedTextXML(input)
	if err != nil {
		t.Fatalf("ParseTimedTextXML returned error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d segments, want 2", len(got))
	}
	if got[0].StartSeconds != 1.23 || got[0].DurationSeconds != 2 || got[0].Text != "Hello & world" {
		t.Fatalf("first segment = %#v", got[0])
	}
	if got[1].Text != "second line" {
		t.Fatalf("second segment text = %q", got[1].Text)
	}
}

func TestClientFetchesRequestedLanguageTranscript(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	mux.HandleFunc("/youtubei/v1/player", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("player method = %s, want POST", r.Method)
		}

		var payload struct {
			VideoID string `json:"videoId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode player payload: %v", err)
		}
		if payload.VideoID != "VjOLmNaqEKQ" {
			t.Fatalf("videoId = %q", payload.VideoID)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"videoDetails": {"title": "Fixture Video"},
			"captions": {
				"playerCaptionsTracklistRenderer": {
					"captionTracks": [
						{"baseUrl": "` + server.URL + `/captions-en", "languageCode": "en", "name": {"simpleText": "English"}},
						{"baseUrl": "` + server.URL + `/captions-ru", "languageCode": "ru", "name": {"simpleText": "Russian"}}
					]
				}
			}
		}`))
	})

	mux.HandleFunc("/captions-ru", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/xml")
		_, _ = w.Write([]byte(`<transcript><text start="0" dur="1.2">privet</text></transcript>`))
	})

	client := Client{
		HTTPClient:                  server.Client(),
		PlayerEndpoint:              server.URL + "/youtubei/v1/player",
		AllowNonYouTubeCaptionHosts: true,
	}

	got, err := client.GetTranscript(context.Background(), Request{
		Video:    "https://www.youtube.com/watch?v=VjOLmNaqEKQ",
		Language: "ru",
	})
	if err != nil {
		t.Fatalf("GetTranscript returned error: %v", err)
	}
	if got.VideoID != "VjOLmNaqEKQ" || got.Language != "ru" || got.Title != "Fixture Video" {
		t.Fatalf("unexpected transcript metadata: %#v", got)
	}
	if got.Text != "privet" {
		t.Fatalf("Text = %q, want privet", got.Text)
	}
}

func TestClientFallsBackToWatchPageWhenPlayerEndpointFails(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	mux.HandleFunc("/youtubei/v1/player", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad request", http.StatusBadRequest)
	})
	mux.HandleFunc("/watch", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("v") != "VjOLmNaqEKQ" {
			t.Fatalf("watch v = %q", r.URL.Query().Get("v"))
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><script>
			var ytInitialPlayerResponse = {
				"videoDetails": {"title": "Fallback Video"},
				"captions": {
					"playerCaptionsTracklistRenderer": {
						"captionTracks": [
							{"baseUrl": "` + server.URL + `/captions-en", "languageCode": "en", "name": {"simpleText": "English"}}
						]
					}
				}
			};
		</script></html>`))
	})
	mux.HandleFunc("/captions-en", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/xml")
		_, _ = w.Write([]byte(`<transcript><text start="0" dur="1">fallback text</text></transcript>`))
	})

	client := Client{
		HTTPClient:                  server.Client(),
		PlayerEndpoint:              server.URL + "/youtubei/v1/player",
		WatchEndpoint:               server.URL + "/watch",
		AllowNonYouTubeCaptionHosts: true,
	}

	got, err := client.GetTranscript(context.Background(), Request{Video: "VjOLmNaqEKQ"})
	if err != nil {
		t.Fatalf("GetTranscript returned error: %v", err)
	}
	if got.Title != "Fallback Video" {
		t.Fatalf("Title = %q, want Fallback Video", got.Title)
	}
	if got.Text != "fallback text" {
		t.Fatalf("Text = %q, want fallback text", got.Text)
	}
}
