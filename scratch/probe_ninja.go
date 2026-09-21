package main

import (
	"bytes"
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

	testNIN := func(nin string) {
		b, _ := json.Marshal(map[string]any{"idType": "nin", "mode": "lookup", "idNumber": nin})
		req, _ := http.NewRequest("POST", baseURL+"/api/identity/identify", bytes.NewReader(b))
		req.Header.Set("Authorization", "Bearer "+sess.Token)
		req.Header.Set("Content-Type", "application/json")
		r, err := http.DefaultClient.Do(req)
		if err != nil {
			return
		}
		resBytes, _ := io.ReadAll(r.Body)
		r.Body.Close()
		var resObj struct {
			Status string `json:"status"`
			Data   *struct {
				FirstName   string `json:"first_name"`
				LastName    string `json:"last_name"`
				DateOfBirth string `json:"date_of_birth"`
				IDNumber    string `json:"id_number"`
			} `json:"data"`
		}
		json.Unmarshal(resBytes, &resObj)
		if resObj.Data != nil {
			fmt.Printf("NIN %s: Found! %s %s (DOB: %s)\n", nin, resObj.Data.FirstName, resObj.Data.LastName, resObj.Data.DateOfBirth)
		} else {
			fmt.Printf("NIN %s: Status: %s\n", nin, resObj.Status)
		}
	}

	testNIN("77777777777")
	testNIN("88888888888")
	testNIN("66666666666")
	testNIN("55555555555")
	testNIN("22222222222")
	testNIN("16161616161")
	testNIN("77777777772")
	testNIN("12345678901")
}
