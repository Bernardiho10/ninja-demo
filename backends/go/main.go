// Reference backend: Go (standard library only, no go get needed).
//
// Implements the 3 endpoints the frontend needs for the real Ninja Flows
// integration. Holds NINJA_SANDBOX_SECRET_KEY server-side -- it is never
// sent to the browser. Routes have no /api/ prefix because `ham proxy`
// strips API_PROXY_PREFIX ("/api/") before forwarding to this backend.
//
//	POST /flows                  -> POST   {NINJA_API_BASE}/api/flows
//	POST /flows/:flowId/links    -> POST   {NINJA_API_BASE}/api/flows/:flowId/links
//	GET  /verifications/:id      -> GET    {NINJA_API_BASE}/api/verifications/:id
//
// Run:
//
//	go run backends/go/main.go
//
// Then, in another terminal, from the repo root:
//
//	ham proxy
//
// Open http://localhost:8082
//
// Config (reads repo-root .env, or real environment variables):
//
//	NINJA_API_BASE              default https://api.sandbox.ninja.boucloud.io
//	NINJA_SANDBOX_SECRET_KEY    required -- your sk_sandbox_... key
//	API_PORT                    default 8080 (ham proxy's default API_ENDPOINT)
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

var (
	ninjaAPIBase string
	secretKey    string
	webhookURL   string
	port         string
)

var webhookSiteRe = regexp.MustCompile(`^https://webhook\.site/([0-9a-fA-F-]{36})`)

var flowsLinksRe = regexp.MustCompile(`^/flows/([^/]+)/links$`)
var verificationsRe = regexp.MustCompile(`^/verifications/([^/]+)$`)

func loadEnv() {
	_, thisFile, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(thisFile), "..", "..")
	envPath := filepath.Join(repoRoot, ".env")

	if f, err := os.Open(envPath); err == nil {
		defer f.Close()
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			idx := strings.Index(line, "=")
			if idx <= 0 {
				continue
			}
			key := strings.TrimSpace(line[:idx])
			val := strings.TrimSpace(line[idx+1:])
			if _, exists := os.LookupEnv(key); !exists {
				os.Setenv(key, val)
			}
		}
	}

	ninjaAPIBase = os.Getenv("NINJA_API_BASE")
	if ninjaAPIBase == "" {
		ninjaAPIBase = "https://api.sandbox.ninja.boucloud.io"
	}
	secretKey = os.Getenv("NINJA_SANDBOX_SECRET_KEY")
	webhookURL = os.Getenv("NINJA_WEBHOOK_URL")
	port = os.Getenv("API_PORT")
	if port == "" {
		port = "8080"
	}
}

// proxyToNinja forwards a request to the real Ninja sandbox API with the
// secret key attached, then relays its exact status and body back as-is.
func proxyToNinja(w http.ResponseWriter, method, upstreamPath string, body io.Reader) {
	if secretKey == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"NINJA_SANDBOX_SECRET_KEY is not set"}`))
		return
	}

	req, err := http.NewRequest(method, ninjaAPIBase+upstreamPath, body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"failed to build upstream request"}`))
		return
	}
	req.Header.Set("Authorization", "Bearer "+secretKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"error":"upstream request to Ninja sandbox failed","detail":"` + err.Error() + `"}`))
		return
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// withWebhookURL sets webhook_url to NINJA_WEBHOOK_URL on a flow-creation body.
// A missing or malformed body becomes {} like the other reference backends.
func withWebhookURL(r io.Reader) io.Reader {
	body := map[string]any{}
	json.NewDecoder(r).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	if webhookURL != "" {
		body["webhook_url"] = webhookURL
	}
	b, _ := json.Marshal(body)
	return bytes.NewReader(b)
}

type webhookEvent struct {
	DeliveryID *string         `json:"delivery_id"`
	Event      *string         `json:"event"`
	Signature  *string         `json:"signature"`
	ReceivedAt string          `json:"received_at"`
	Payload    json.RawMessage `json:"payload"`
}

// webhookEvents: Ninja delivers webhooks to a public URL, which a localhost
// backend can't be. For the demo that URL is a webhook.site inbox, and
// webhook.site has a read API, so we fetch the deliveries from there and hand
// them to the browser.
func webhookEvents(w http.ResponseWriter, verificationID string) {
	m := webhookSiteRe.FindStringSubmatch(webhookURL)
	if m == nil {
		var inbox any
		if webhookURL != "" {
			inbox = webhookURL
		}
		writeJSON(w, 200, map[string]any{"source": "unsupported", "inbox_url": inbox, "events": []webhookEvent{}})
		return
	}
	token := m[1]

	req, _ := http.NewRequest("GET", "https://webhook.site/token/"+token+"/requests?sorting=newest&per_page=50", nil)
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err == nil && resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		err = fmt.Errorf("webhook.site responded %d", resp.StatusCode)
	}
	if err != nil {
		writeJSON(w, 502, map[string]string{"error": "could not read webhook.site inbox", "detail": err.Error()})
		return
	}
	defer resp.Body.Close()

	var inbox struct {
		Data []struct {
			Method    string              `json:"method"`
			Content   string              `json:"content"`
			CreatedAt string              `json:"created_at"`
			Headers   map[string][]string `json:"headers"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&inbox); err != nil {
		writeJSON(w, 502, map[string]string{"error": "could not read webhook.site inbox", "detail": err.Error()})
		return
	}

	header := func(h map[string][]string, name string) *string {
		if v := h[name]; len(v) > 0 {
			return &v[0]
		}
		return nil
	}

	events := []webhookEvent{}
	for _, r := range inbox.Data {
		if r.Method != "POST" {
			continue
		}
		var payload struct {
			Event string `json:"event"`
			Data  struct {
				VerificationID string `json:"verification_id"`
			} `json:"data"`
		}
		if json.Unmarshal([]byte(r.Content), &payload) != nil {
			continue
		}
		if verificationID != "" && payload.Data.VerificationID != verificationID {
			continue
		}
		event := header(r.Headers, "x-ninja-event")
		if event == nil && payload.Event != "" {
			event = &payload.Event
		}
		events = append(events, webhookEvent{
			DeliveryID: header(r.Headers, "x-ninja-delivery"),
			Event:      event,
			Signature:  header(r.Headers, "x-ninja-signature"),
			ReceivedAt: r.CreatedAt,
			Payload:    json.RawMessage(r.Content),
		})
	}
	writeJSON(w, 200, map[string]any{"source": "webhook.site", "inbox_url": "https://webhook.site/#!/view/" + token, "events": events})
}

func notFound(w http.ResponseWriter, method, path string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	w.Write([]byte(`{"error":"no such route: ` + method + " " + path + `"}`))
}

func handler(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/flows":
		proxyToNinja(w, "POST", "/api/flows", withWebhookURL(r.Body))

	case r.Method == http.MethodPost && flowsLinksRe.MatchString(r.URL.Path):
		m := flowsLinksRe.FindStringSubmatch(r.URL.Path)
		flowID, _ := url.PathUnescape(m[1])
		proxyToNinja(w, "POST", "/api/flows/"+url.PathEscape(flowID)+"/links", r.Body)

	case r.Method == http.MethodGet && verificationsRe.MatchString(r.URL.Path):
		m := verificationsRe.FindStringSubmatch(r.URL.Path)
		verID, _ := url.PathUnescape(m[1])
		proxyToNinja(w, "GET", "/api/verifications/"+url.PathEscape(verID), nil)

	case r.Method == http.MethodGet && r.URL.Path == "/webhook-events":
		webhookEvents(w, r.URL.Query().Get("verification_id"))

	default:
		notFound(w, r.Method, r.URL.Path)
	}
}

func main() {
	loadEnv()

	http.HandleFunc("/", handler)

	log.Printf("Go reference backend listening on http://localhost:%s", port)
	if secretKey == "" {
		log.Println("warning: NINJA_SANDBOX_SECRET_KEY is not set -- /flows calls will fail")
	}
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
