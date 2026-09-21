package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
)

func main() {
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}

	// 1. Login with demo user
	loginBody, _ := json.Marshal(map[string]string{
		"phone_number": "08012345678",
		"password":     "password123",
	})
	resp, err := client.Post("http://localhost:4100/api/players/login", "application/json", bytes.NewReader(loginBody))
	if err != nil {
		panic(err)
	}
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Login (%d): %s\n", resp.StatusCode, string(b))

	// 2. Call verify-face with user_bet_id
	faceBody, _ := json.Marshal(map[string]string{
		"user_bet_id": "BET-9824108",
	})
	resp2, err := client.Post("http://localhost:4100/api/players/me/verify-face", "application/json", bytes.NewReader(faceBody))
	if err != nil {
		panic(err)
	}
	b2, _ := io.ReadAll(resp2.Body)
	resp2.Body.Close()
	fmt.Printf("Verify Face (%d): %s\n", resp2.StatusCode, string(b2))
}
