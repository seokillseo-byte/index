package main

import "testing"

func TestParseRobotsDisallow(t *testing.T) {
  body := "User-agent: *\nDisallow: /private\nAllow: /private/public\n"
  if parseRobots(body, "/private/account") {
    t.Fatal("expected private path to be disallowed")
  }
  if !parseRobots(body, "/private/public/page") {
    t.Fatal("expected longer allow rule to override disallow")
  }
  if !parseRobots(body, "/public") {
    t.Fatal("expected unrelated public path to be allowed")
  }
}

func TestParseRobotsBotSpecificGroup(t *testing.T) {
  body := "User-agent: Googlebot\nDisallow: /\n\nUser-agent: IndexAssistBot\nDisallow: /internal\n"
  if parseRobots(body, "/internal/page") {
    t.Fatal("expected IndexAssistBot-specific rule to apply")
  }
  if !parseRobots(body, "/public") {
    t.Fatal("expected path outside disallow rule to be allowed")
  }
}
