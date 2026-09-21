package main

import (
	"database/sql"
	"fmt"
	_ "modernc.org/sqlite"
)

func main() {
	db, err := sql.Open("sqlite", "./apps/ninja-bet/ninja-bet.db")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	var val string
	err = db.QueryRow("SELECT value FROM config WHERE key = 'face_verification_flow_id'").Scan(&val)
	if err != nil {
		fmt.Println("No cached flow id found:", err)
	} else {
		fmt.Println("Cached flow ID was:", val)
		_, _ = db.Exec("DELETE FROM config WHERE key = 'face_verification_flow_id'")
		fmt.Println("Deleted cached flow id so a new flow with clean RedirectURL (http://localhost:5671/play.html) will be created.")
	}
}
