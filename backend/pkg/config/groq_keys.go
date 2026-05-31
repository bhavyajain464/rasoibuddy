package config

import (
	"crypto/rand"
	"math/big"
	"strings"
)

// parseGroqAPIKeys splits GROQ_API_KEY on commas (whitespace trimmed); empty parts dropped.
func parseGroqAPIKeys(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// HasGroqAPIKey reports whether at least one Groq API key is configured.
func (c *Config) HasGroqAPIKey() bool {
	return c != nil && len(c.GroqAPIKeys) > 0
}

// PickGroqAPIKey returns a randomly chosen key from GROQ_API_KEY (comma-separated list).
func (c *Config) PickGroqAPIKey() string {
	if c == nil || len(c.GroqAPIKeys) == 0 {
		return ""
	}
	if len(c.GroqAPIKeys) == 1 {
		return c.GroqAPIKeys[0]
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(len(c.GroqAPIKeys))))
	if err != nil {
		return c.GroqAPIKeys[0]
	}
	return c.GroqAPIKeys[n.Int64()]
}
