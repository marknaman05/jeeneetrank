"""One-time: get a Google refresh token for the counsellor's calendar.

1. console.cloud.google.com -> new project -> APIs & Services -> Enable
   "Google Calendar API".
2. APIs & Services -> OAuth consent screen -> External, add yourself as a
   test user (Publishing status can stay "Testing").
3. Credentials -> Create credentials -> OAuth client ID -> Desktop app.
   Copy the client id and secret.
4. python3 google-auth.py  (opens the browser; sign in with the Google
   account whose calendar should hold the sessions).

Prints the three secrets to store on the Worker.
"""

import http.server, json, sys, urllib.parse, urllib.request, webbrowser

SCOPE = "https://www.googleapis.com/auth/calendar.events"
PORT = 8765

client_id = input("client id: ").strip()
client_secret = input("client secret: ").strip()
redirect = f"http://localhost:{PORT}/"
url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
    "client_id": client_id, "redirect_uri": redirect, "response_type": "code",
    "scope": SCOPE, "access_type": "offline", "prompt": "consent",
})
print("\nOpening the browser for consent…")
webbrowser.open(url)

code = {}
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code["v"] = q.get("code", [""])[0]
        self.send_response(200); self.end_headers()
        self.wfile.write(b"Done - you can close this tab.")
    def log_message(self, *a): pass
http.server.HTTPServer(("localhost", PORT), H).handle_request()
if not code.get("v"):
    sys.exit("no code received")

tok = json.load(urllib.request.urlopen(urllib.request.Request(
    "https://oauth2.googleapis.com/token",
    data=urllib.parse.urlencode({"code": code["v"], "client_id": client_id, "client_secret": client_secret,
                                 "redirect_uri": redirect, "grant_type": "authorization_code"}).encode())))
if "refresh_token" not in tok:
    sys.exit("no refresh token in response (revoke the app's access at myaccount.google.com/permissions and run again)")
print("\nNow run, pasting each value when asked:")
print("  npx wrangler secret put GOOGLE_CLIENT_ID      ->", client_id)
print("  npx wrangler secret put GOOGLE_CLIENT_SECRET  ->", client_secret)
print("  npx wrangler secret put GOOGLE_REFRESH_TOKEN  ->", tok["refresh_token"])
