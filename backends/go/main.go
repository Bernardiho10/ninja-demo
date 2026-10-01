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
	port         string
)

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

func notFound(w http.ResponseWriter, method, path string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	w.Write([]byte(`{"error":"no such route: ` + method + " " + path + `"}`))
}

func handler(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/flows":
		proxyToNinja(w, "POST", "/api/flows", r.Body)

	case r.Method == http.MethodPost && flowsLinksRe.MatchString(r.URL.Path):
		m := flowsLinksRe.FindStringSubmatch(r.URL.Path)
		flowID, _ := url.PathUnescape(m[1])
		proxyToNinja(w, "POST", "/api/flows/"+url.PathEscape(flowID)+"/links", r.Body)

	case r.Method == http.MethodGet && verificationsRe.MatchString(r.URL.Path):
		m := verificationsRe.FindStringSubmatch(r.URL.Path)
		verID, _ := url.PathUnescape(m[1])
		proxyToNinja(w, "GET", "/api/verifications/"+url.PathEscape(verID), nil)

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
