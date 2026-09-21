package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"time"
)

func main() {
	rand.Seed(time.Now().UnixNano())
	phone := fmt.Sprintf("080%08d", rand.Intn(90000000)+10000000)

	fmt.Println("--- TEST MISMATCH ---")
	mismatchBody, _ := json.Marshal(map[string]any{
		"phone_number": phone,
		"password":     "password123",
		"nin":          "77777777777",
		"first_name":   "Chinedu",
		"last_name":    "Okafor",
	})
	resp, _ := http.Post("http://localhost:4100/api/players/register", "application/json", bytes.NewReader(mismatchBody))
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Mismatch Result: %d -> %s\n", resp.StatusCode, string(b))

	fmt.Println("\n--- TEST MATCH ---")
	matchBody, _ := json.Marshal(map[string]any{
		"phone_number": phone,
		"password":     "password123",
		"nin":          "77777777777",
		"first_name":   "James",
		"last_name":    "Bond",
	})
	resp, _ = http.Post("http://localhost:4100/api/players/register", "application/json", bytes.NewReader(matchBody))
	var player map[string]any
	json.NewDecoder(resp.Body).Decode(&player)
	resp.Body.Close()
	delete(player, "photo_data_uri")
	cleanJSON, _ := json.Marshal(player)
	fmt.Printf("Match Result: %d -> %s\n", resp.StatusCode, string(cleanJSON))
}
