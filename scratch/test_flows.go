package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	baseURL := "https://api.sandbox.ninja.boucloud.io"
	key := "pk_sandbox_2ccf1ef6-3eb8-4420-b7d4-1f5ca1b3cb3f"
	sec := "sk_sandbox_1c6ab06a-7cd8-4f97-94a6-15ab3ca7e017"

	body, _ := json.Marshal(map[string]string{
		"client_key":    key,
		"client_secret": sec,
	})
	resp, _ := http.Post(baseURL+"/auth/session", "application/json", bytes.NewReader(body))
	var sess struct {
		Token string `json:"token"`
	}
	json.NewDecoder(resp.Body).Decode(&sess)
	resp.Body.Close()

	flowID := "vf_QAIWePPP4cLtGCaIkDeJillxxwYiV"

	reqBody, _ := json.Marshal(map[string]any{
		"customer_name": "James Bond",
		"customer_ref":  "player_123:BET-9824108",
		"values": map[string]any{
			"first_name": "James",
			"last_name":  "Bond",
		},
	})
	req, _ := http.NewRequestWithContext(context.Background(), "POST", baseURL+"/api/flows/"+flowID+"/links", bytes.NewReader(reqBody))
	req.Header.Set("Authorization", "Bearer "+sess.Token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	fmt.Printf("Create link -> Status %d: %s\n", res.StatusCode, string(b))
}
