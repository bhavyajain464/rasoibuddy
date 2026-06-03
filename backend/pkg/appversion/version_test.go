package appversion

import "testing"

func TestAtLeast(t *testing.T) {
	cases := []struct {
		cur, min string
		want     bool
	}{
		{"1.0.1", "1.0.1", true},
		{"1.0.2", "1.0.1", true},
		{"1.0.0", "1.0.1", false},
		{"2.0.0", "1.9.9", true},
	}
	for _, c := range cases {
		if got := AtLeast(c.cur, c.min); got != c.want {
			t.Fatalf("AtLeast(%q, %q) = %v, want %v", c.cur, c.min, got, c.want)
		}
	}
}

func TestBelowMinimumBuild(t *testing.T) {
	if !BelowMinimum("android", 41, "1.0.0", "1.0.0", 42) {
		t.Fatal("expected build 41 below min 42")
	}
	if BelowMinimum("android", 42, "1.0.0", "1.0.0", 42) {
		t.Fatal("expected build 42 to pass")
	}
}

func TestBelowMinimumLegacyMissingBuild(t *testing.T) {
	if !BelowMinimum("android", 0, "", "1.0.1", 0) {
		t.Fatal("missing version with min version set should block")
	}
}
