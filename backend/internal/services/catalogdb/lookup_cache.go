package catalogdb

import "sync"

type cachedLookup struct {
	result LookupResult
	found  bool
}

var (
	ingredientIDCache   sync.Map
	ingredientNameCache sync.Map
)

func loadCachedID(id string) (LookupResult, bool, bool) {
	if v, ok := ingredientIDCache.Load(id); ok {
		e := v.(cachedLookup)
		return e.result, e.found, true
	}
	return LookupResult{}, false, false
}

func storeCachedID(id string, hit LookupResult, found bool) {
	ingredientIDCache.Store(id, cachedLookup{result: hit, found: found})
}

func loadCachedName(key string) (LookupResult, bool, bool) {
	if v, ok := ingredientNameCache.Load(key); ok {
		e := v.(cachedLookup)
		return e.result, e.found, true
	}
	return LookupResult{}, false, false
}

func storeCachedName(key string, hit LookupResult, found bool) {
	ingredientNameCache.Store(key, cachedLookup{result: hit, found: found})
}
