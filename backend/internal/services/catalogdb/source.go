package catalogdb

import "database/sql"

const FuzzySimilarityThreshold = 0.4

var db *sql.DB

// Init wires the Postgres catalog (required at API startup).
func Init(sqlDB *sql.DB) {
	db = sqlDB
}

// DB returns the wired database handle.
func DB() *sql.DB {
	return db
}
