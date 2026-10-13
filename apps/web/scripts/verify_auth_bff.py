"""Disposable local integration check. Requires auth-enabled Next dev and isolated API.
Never prints passwords, cookies, token values or response bodies. No schema operations.
Only the freshly created home is deleted; test accounts remain for DB teardown by owner.
"""
import copy
import http.cookiejar
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid

origin = os.environ.get("AUTH_INTEGRATION_WEB_ORIGIN", "http://localhost:3011")
api = os.environ.get("AUTH_INTEGRATION_API_URL", "http://127.0.0.1:8011")
for target in (origin, api):
    url = urllib.parse.urlparse(target)
    if url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1"} or url.path or url.port == 8000:
        raise SystemExit("Refusing non-local or pilot integration target")
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def names(cookie_jar):
    return sorted(cookie.name for cookie in cookie_jar)


def upstream_me_status(bound_access):
    """Checks a session token directly against the isolated API. Value is never printed."""
    token = bound_access.split("~", 1)[1]
    request = urllib.request.Request(api + "/api/v1/auth/me", headers={"Authorization": "Bearer " + token})
    try:
        return urllib.request.urlopen(request, timeout=20).status
    except urllib.error.HTTPError as error:
        return error.status


def call(label, path, expected, method="GET", body=None, write_origin=origin):
    headers = {"Content-Type": "application/json", "Origin": write_origin}
    request = urllib.request.Request(origin + "/api/bff/" + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        response = client.open(request, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    assert response.status == expected, f"{label}: expected {expected}, received {response.status}"
    if path.startswith("auth/"):
        assert b'access_token' not in raw and b'refresh_token' not in raw, f"{label}: token payload leak"
    assert "no-store" in response.headers.get("Cache-Control", ""), f"{label}: cacheable"
    print(f"{label}: HTTP {response.status}")
    return json.loads(raw) if raw else None


email = f"erd-web-test-{uuid.uuid4().hex}@example.com"
password = secrets.token_urlsafe(32)
credentials = {"email": email, "password": password}
register_credentials = {**credentials, "accept_terms": True}
call("anonymous me", "auth/me", 401)
anonymous_page = client.open(origin + "/dashboard", timeout=20)
assert anonymous_page.geturl().endswith("/login")
print("anonymous protected navigation: redirected to /login")
call("cross-origin login rejected", "auth/login", 403, "POST", credentials, "https://evil.example")
epoch = call("auth epoch required before first login", "auth/register", 428, "POST", register_credentials)
assert epoch["code"] == "auth_epoch_required" and names(jar) == ["erd-epoch"]
call("register", "auth/register", 201, "POST", register_credentials)
assert names(jar) == ["erd-access", "erd-epoch", "erd-logout"]
assert all(cookie.has_nonstandard_attr("HttpOnly") and cookie.get_nonstandard_attr("SameSite") == "strict" for cookie in jar)
print("cookie flags: HttpOnly / SameSite=strict / host-only verified")
me = call("me after register", "auth/me", 200)
assert me["email"] == email and me["role"] == "user"
page = client.open(origin + "/dashboard", timeout=20)
rendered = page.read()
assert page.status == 200 and not page.geturl().endswith("/login")
assert all(cookie.value.encode() not in rendered for cookie in jar)
print("authenticated protected HTML: HTTP 200, no token values serialized")
assert call("new account has no pilot homes", "homes", 200) == []
home = call("create owned home", "homes", 201, "POST", {"name": "Disposable ERD web auth check", "distributor": "EDESUR"})
home_id = home["id"]
assert any(item["id"] == home_id for item in call("read back owned home", "homes", 200))
call("dashboard via existing BFF route", f"homes/{home_id}/dashboard", 200)
call("forbidden proxy host", "homes?url=https://evil.example", 400)
call("refresh deliberately unavailable", "auth/refresh", 404, "POST", {})
old_session = [copy.copy(cookie) for cookie in jar]
call("logout", "auth/logout", 200, "POST", {})
assert names(jar) == ["erd-epoch"]
new_epoch = copy.copy(next(iter(jar)))
assert all(cookie.value != new_epoch.value for cookie in old_session if cookie.name == "erd-epoch")
print("logout rotated the auth epoch")
call("me after logout", "auth/me", 401)
for cookie in old_session:
    jar.set_cookie(cookie)
call("revoked access rejected even before JWT expiry", "auth/me", 401)
jar.clear()
jar.set_cookie(new_epoch)
old_session.clear()
duplicate = call("duplicate registration", "auth/register", 409, "POST", register_credentials)
assert duplicate["detail"] == "Ya existe una cuenta con este correo electrónico."
wrong = call("wrong credentials", "auth/login", 401, "POST", {"email": email, "password": secrets.token_urlsafe(32)})
assert wrong["detail"] == "Credenciales inválidas."
print("error messages are local Spanish text")
call("login", "auth/login", 200, "POST", credentials)
assert call("same account home preserved server-side", "homes", 200)[0]["id"] == home_id
call("delete only fresh test home", f"homes/{home_id}", 204, "DELETE", {})
assert call("home deletion read back", "homes", 200) == []
call("logout before account switch", "auth/logout", 200, "POST", {})
other = {"email": f"erd-web-test-{uuid.uuid4().hex}@example.com", "password": secrets.token_urlsafe(32)}
call("second account registration", "auth/register", 201, "POST", {**other, "accept_terms": True})
assert call("second account cannot see first account homes", "homes", 200) == []
call("final logout", "auth/logout", 200, "POST", {})
# Late login: sent under the current epoch, its Set-Cookie lands after another tab's logout.
stale_jar = http.cookiejar.CookieJar()
for cookie in jar:
    stale_jar.set_cookie(copy.copy(cookie))
stale_client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(stale_jar))
call("other tab logout (rotates epoch)", "auth/logout", 200, "POST", {})
request = urllib.request.Request(origin + "/api/bff/auth/login", data=json.dumps(other).encode(), headers={"Content-Type": "application/json", "Origin": origin}, method="POST")
assert stale_client.open(request, timeout=20).status == 200
late = {cookie.name: cookie for cookie in stale_jar if cookie.name in {"erd-access", "erd-logout"}}
assert upstream_me_status(late["erd-access"].value) == 200
print("late login obtained a real server session: HTTP 200 upstream")
for cookie in late.values():
    jar.set_cookie(copy.copy(cookie))  # the browser applies the late Set-Cookie
call("late login cannot restore a session after logout", "auth/me", 401)
assert upstream_me_status(late["erd-access"].value) == 401
print("late login session revoked upstream: HTTP 401")
late.clear()
print("PASS: real Next BFF / isolated authenticated API integration; tokens never printed")
