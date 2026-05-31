package services

import (
	"os"
	"strings"
	"time"
)

// complimentaryTierForEmail returns the grant tier when email is in PREMIUM_GRANT_EMAILS.
func complimentaryTierForEmail(email string) (tier string, ok bool) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return "", false
	}
	for _, allowed := range parsePremiumGrantEmails() {
		if email == allowed {
			tier := NormalizeTier(strings.TrimSpace(os.Getenv("PREMIUM_GRANT_TIER")))
			if tier == TierFree {
				tier = TierPro
			}
			return tier, true
		}
	}
	return "", false
}

func parsePremiumGrantEmails() []string {
	raw := strings.TrimSpace(os.Getenv("PREMIUM_GRANT_EMAILS"))
	if raw == "" {
		return nil
	}
	// Semicolons allowed when commas would break deploy tooling (e.g. gcloud --set-env-vars).
	raw = strings.ReplaceAll(raw, ";", ",")
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// applyComplimentaryPremium upgrades entitlements for allowlisted emails without touching DB.
func applyComplimentaryPremium(email, dbTier, dbInterval string, dbExpires *time.Time) (string, string, *time.Time) {
	grantTier, granted := complimentaryTierForEmail(email)
	if !granted {
		return dbTier, dbInterval, dbExpires
	}
	effective := effectiveTier(NormalizeTier(dbTier), dbExpires)
	if tierRank(grantTier) > tierRank(effective) {
		return grantTier, "", nil
	}
	if tierRank(effective) >= tierRank(grantTier) {
		return dbTier, dbInterval, dbExpires
	}
	return grantTier, "", nil
}
