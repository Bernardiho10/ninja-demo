package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"time"
)

func main() {
	fmt.Println("=== 1. Testing Route /play with double question marks ===")
	resp, err := http.Get("http://localhost:5671/play?face=complete?vs_id=vs_BjDilVPEuIr4L9BME8xbCDBWgH8vM&status=failed")
	if err != nil {
		fmt.Println("HTTP GET /play error:", err)
	} else {
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		fmt.Printf("Status: %d, Contains redirect logic: %v\n", resp.StatusCode, strings.Contains(string(b), "window.location.replace"))
	}

	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}

	rand.Seed(time.Now().UnixNano())
	randomPhone := fmt.Sprintf("080%08d", rand.Intn(90000000)+10000000)

	fmt.Println("\n=== 2. Testing Registration with Mismatched NIN Identity ===")
	mismatchBody, _ := json.Marshal(map[string]any{
		"phone_number": randomPhone,
		"password":     "password123",
		"nin":          "77777777777", // James Bond's real sandbox NIN
		"first_name":   "Chinedu",
		"last_name":    "Okafor",
	})
	resp, err = client.Post("http://localhost:4100/api/players/register", "application/json", bytes.NewReader(mismatchBody))
	if err != nil {
		fmt.Println("Register mismatch error:", err)
	} else {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		fmt.Printf("Status: %d, Response: %s\n", resp.StatusCode, string(b))
	}

	fmt.Println("\n=== 3. Testing Registration with Matching NIN Identity ===")
	// With the SAME random phone number (verifying it wasn't locked by the rejected attempt!)
	matchBody, _ := json.Marshal(map[string]any{
		"phone_number": randomPhone,
		"password":     "password123",
		"nin":          "77777777777",
		"first_name":   "James",
		"last_name":    "Bond",
	})
	resp, err = client.Post("http://localhost:4100/api/players/register", "application/json", bytes.NewReader(matchBody))
	if err != nil {
		fmt.Println("Register match error:", err)
	} else {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		fmt.Printf("Status: %d, Response: %s\n", resp.StatusCode, string(b))
	}

	fmt.Println("\n=== 4. Testing Start Face Verification (verify user_bet_id fix) ===")
	faceReq, _ := json.Marshal(map[string]string{
		"user_bet_id": "BET-9824108",
	})
	resp, err = client.Post("http://localhost:4100/api/players/me/verify-face", "application/json", bytes.NewReader(faceReq))
	if err != nil {
		fmt.Println("Start face verification error:", err)
	} else {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		fmt.Printf("Status: %d, Response: %s\n", resp.StatusCode, string(b))
	}

	fmt.Println("\n=== 5. Testing Simulate Match Win (to fund winnings balance) ===")
	resp, _ = client.Post("http://localhost:4100/api/bets/simulate-win", "application/json", nil)
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Simulate Win: %d -> %s\n", resp.StatusCode, string(b))

	fmt.Println("\n=== 6. Testing Bank Account & BVN Ownership Verification ===")
	bankReq, _ := json.Marshal(map[string]string{
		"bank_name":      "Access Bank",
		"account_number": "0123456789",
	})
	resp, _ = client.Post("http://localhost:4100/api/players/me/bank-details", "application/json", bytes.NewReader(bankReq))
	b, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Save Bank: %d -> %s\n", resp.StatusCode, string(b))

	fmt.Println("\n=== 7. Testing Instant Payout with Mismatched Beneficiary (Anti-ATO Mule Defense) ===")
	muleReq, _ := json.Marshal(map[string]any{
		"amount_naira":     50000,
		"beneficiary_name": "Emeka Obi",
		"bank_name":        "Access Bank",
		"account_number":   "0123456789",
		"bvn":              "77777777777",
	})
	resp, _ = client.Post("http://localhost:4100/api/payouts/request", "application/json", bytes.NewReader(muleReq))
	b, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Mule Payout Attempt: %d -> %s\n", resp.StatusCode, string(b))

	fmt.Println("\n=== 8. Testing Instant Payout with Legitimate Matching Beneficiary ===")
	legitReq, _ := json.Marshal(map[string]any{
		"amount_naira":     50000,
		"beneficiary_name": "James Bond",
		"bank_name":        "Access Bank",
		"account_number":   "0123456789",
		"bvn":              "77777777777",
	})
	resp, _ = client.Post("http://localhost:4100/api/payouts/request", "application/json", bytes.NewReader(legitReq))
	b, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Legit Payout Attempt: %d -> %s\n", resp.StatusCode, string(b))

	fmt.Println("\n=== All backend and web routing checks executed successfully! ===")
}
