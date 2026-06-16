package catalogdb

import (
	"github.com/lib/pq"
)

func pqStringArray(dest *[]string) interface{} {
	return pq.Array(dest)
}
