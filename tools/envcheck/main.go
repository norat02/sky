package main

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
)

var requiredPublic = []string{"PUBLIC_SITE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"}
var requiredServer = []string{"SUPABASE_SERVICE_ROLE_KEY", "SCORE_SIGNING_SECRET"}
var keyPattern = regexp.MustCompile(`^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$`)

func parseDotEnv(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()

	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		match := keyPattern.FindStringSubmatch(line)
		if len(match) != 3 {
			continue
		}
		value := strings.TrimSpace(match[2])
		if len(value) >= 2 && ((value[0] == '\'' && value[len(value)-1] == '\'') || (value[0] == '"' && value[len(value)-1] == '"')) {
			value = value[1 : len(value)-1]
		}
		values[match[1]] = value
	}
	return values, scanner.Err()
}

func value(name string, local map[string]string) string {
	if current, ok := os.LookupEnv(name); ok && strings.TrimSpace(current) != "" {
		return current
	}
	return local[name]
}

func checkGroup(label string, names []string, local map[string]string) int {
	failures := 0
	for _, name := range names {
		current := strings.TrimSpace(value(name, local))
		lower := strings.ToLower(current)
		if current == "" || strings.HasPrefix(lower, "your-") || strings.HasPrefix(lower, "<") || lower == "changeme" || lower == "replace-me" {
			fmt.Printf("MISSING %s/%s\n", label, name)
			failures++
			continue
		}
		if name == "SCORE_SIGNING_SECRET" && len(current) < 32 {
			fmt.Printf("INVALID %s/%s (must be at least 32 characters)\n", label, name)
			failures++
			continue
		}
		fmt.Printf("OK %s/%s\n", label, name)
	}
	return failures
}

func checkDatabase(local map[string]string) int {
	if strings.TrimSpace(value("DATABASE_URL", local)) == "" && strings.TrimSpace(value("NEON_DATABASE_URL", local)) == "" {
		fmt.Println("MISSING server/DATABASE_URL or server/NEON_DATABASE_URL")
		return 1
	}
	fmt.Println("OK server/Neon connection string present")
	return 0
}

func main() {
	local, err := parseDotEnv(".env.local")
	if err != nil {
		fmt.Fprintf(os.Stderr, "cannot read .env.local: %v\n", err)
		os.Exit(2)
	}
	failures := checkGroup("public", requiredPublic, local)
	failures += checkDatabase(local)
	failures += checkGroup("server", requiredServer, local)
	if failures > 0 {
		fmt.Printf("Environment check failed: %d issue(s); values were not printed.\n", failures)
		os.Exit(1)
	}
	fmt.Println("Environment check passed; values were not printed.")
}
