package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

func main() {
	body := []byte(`{"phone_number":"08077665544","password":"password123","nin":"77777777777","first_name":"Chinedu","last_name":"Okafor"}`)
	resp, err := http.Post("http://localhost:4100/api/players/register", "application/json", bytes.NewReader(body))
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	fmt.Printf("HTTP %d:\n%s\n", resp.StatusCode, string(b))
}
