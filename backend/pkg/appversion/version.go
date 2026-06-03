package appversion

import (
	"strconv"
	"strings"
)

// BelowMinimum reports whether a native client must update before using the API.
// When minBuild > 0 it takes precedence over minVersion.
func BelowMinimum(platform string, build int, version, minVersion string, minBuild int) bool {
	platform = strings.ToLower(strings.TrimSpace(platform))
	if platform != "android" && platform != "ios" {
		return false
	}
	if minBuild > 0 {
		return build < minBuild
	}
	minVersion = strings.TrimSpace(minVersion)
	if minVersion == "" {
		return false
	}
	version = strings.TrimSpace(version)
	if version == "" {
		return true
	}
	return !AtLeast(version, minVersion)
}

// AtLeast compares dotted numeric version segments (1.0.10 >= 1.0.9).
func AtLeast(current, minimum string) bool {
	a := parseParts(current)
	b := parseParts(minimum)
	n := len(a)
	if len(b) > n {
		n = len(b)
	}
	for i := 0; i < n; i++ {
		ai, bi := 0, 0
		if i < len(a) {
			ai = a[i]
		}
		if i < len(b) {
			bi = b[i]
		}
		if ai > bi {
			return true
		}
		if ai < bi {
			return false
		}
	}
	return true
}

func parseParts(raw string) []int {
	parts := strings.Split(raw, ".")
	out := make([]int, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			out = append(out, 0)
			continue
		}
		// strip suffix like "1-beta"
		for j, c := range p {
			if c < '0' || c > '9' {
				p = p[:j]
				break
			}
		}
		n, err := strconv.Atoi(p)
		if err != nil {
			n = 0
		}
		out = append(out, n)
	}
	return out
}

// InferPlatform guesses android/ios from a React Native style user agent when
// X-App-Platform is missing (legacy app builds).
func InferPlatform(userAgent string) string {
	ua := strings.ToLower(userAgent)
	switch {
	case strings.Contains(ua, "android"), strings.Contains(ua, "okhttp"):
		return "android"
	case strings.Contains(ua, "iphone"), strings.Contains(ua, "ipad"), strings.Contains(ua, "cfnetwork"):
		return "ios"
	default:
		return ""
	}
}

// IsLikelyNativeApp detects mobile app HTTP clients (not desktop browsers).
func IsLikelyNativeApp(userAgent string) bool {
	ua := strings.ToLower(userAgent)
	if ua == "" {
		return false
	}
	if strings.Contains(ua, "mozilla/") && (strings.Contains(ua, "chrome/") || strings.Contains(ua, "safari/")) {
		// Mobile Safari still counts as native wrapper in some cases; Expo/RN usually adds more signals.
		if !strings.Contains(ua, "reactnative") && !strings.Contains(ua, "expo") {
			return false
		}
	}
	return strings.Contains(ua, "okhttp") ||
		strings.Contains(ua, "cfnetwork") ||
		strings.Contains(ua, "reactnative") ||
		strings.Contains(ua, "expo") ||
		strings.Contains(ua, "kitchenai")
}
