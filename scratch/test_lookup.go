package main

import (
	"context"
	"fmt"

	"github.com/bernardoko/ninja-demo/internal/ninja"
)

func main() {
	baseURL := "https://api.sandbox.ninja.boucloud.io"
	key := "pk_sandbox_2ccf1ef6-3eb8-4420-b7d4-1f5ca1b3cb3f"
	sec := "sk_sandbox_1c6ab06a-7cd8-4f97-94a6-15ab3ca7e017"

	client := ninja.NewClient(baseURL, key, sec)
	client.SetLogger(func(endpoint, method string, statusCode, durationMs int, reqPayload, respPayload string, isMock bool) {
		fmt.Printf("API CALL: %s %s (%d)\nReq: %s\nResp: %s\n", method, endpoint, statusCode, reqPayload, respPayload)
	})

	resp, err := client.Identify(context.Background(), ninja.IdentifyRequest{
		IDType:    "nin",
		Mode:      "lookup",
		IDNumber:  "11111111111",
		Reference: "test_lookup_1",
	})
	if err != nil {
		fmt.Println("Identify error:", err)
		return
	}
	fmt.Printf("Result: Verified=%v, Data=%+v\n", resp.Verified, resp.Data)
}
