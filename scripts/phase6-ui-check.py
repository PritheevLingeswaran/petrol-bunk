from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path(".artifacts/phase6-ui")
OUT.mkdir(parents=True, exist_ok=True)

def login(page, username):
    page.goto(f"{BASE}/login", timeout=90_000)
    page.wait_for_load_state("networkidle")
    page.locator('input[name="username"]').fill(username)
    page.locator('input[name="password"]').fill("ChangeMe123!")
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_timeout(5_000)
    print(f"Login {username}: {page.url}")
    if "/login" in page.url:
        raise AssertionError(f"Login did not leave {page.url}: {page.locator('body').inner_text()[:1000]}")
    page.wait_for_load_state("networkidle")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    owner_context = browser.new_context(viewport={"width": 1440, "height": 1000})
    owner = owner_context.new_page()
    owner.set_default_timeout(30_000)
    owner.set_default_navigation_timeout(90_000)
    errors = []
    owner.on("pageerror", lambda error: errors.append(str(error)))
    owner.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    login(owner, "owner")

    owner.goto(BASE)
    owner.wait_for_load_state("networkidle")
    assert owner.get_by_text("Low-stock tanks").count() == 1, f"Dashboard URL/body: {owner.url} / {owner.locator('body').inner_text()[:1200]}"
    owner.screenshot(path=str(OUT / "dashboard.png"), full_page=True)

    owner.goto(f"{BASE}/inventory/stock-status")
    owner.wait_for_load_state("networkidle")
    assert owner.locator(".tank-gauge").count() == 4
    owner.screenshot(path=str(OUT / "stock-status.png"), full_page=True)

    owner.goto(f"{BASE}/payroll/attendance")
    owner.wait_for_load_state("networkidle")
    assert owner.locator(".attendance-table tbody tr").count() == 6
    owner.screenshot(path=str(OUT / "attendance.png"), full_page=True)

    owner.goto(f"{BASE}/admin/permissions")
    owner.wait_for_load_state("networkidle")
    assert owner.get_by_role("heading", name="Permission matrix").count() == 1
    assert owner.locator(".matrix tbody tr").count() == 12

    owner.goto(f"{BASE}/admin/user-control")
    owner.wait_for_load_state("networkidle")
    assert owner.get_by_role("heading", name="Per-user restrictions").count() == 1

    owner.goto(f"{BASE}/admin/login-logs")
    owner.wait_for_load_state("networkidle")
    assert owner.get_by_role("heading", name="Login log").count() == 1
    assert owner.locator('input[type="date"]').count() == 2

    owner.goto(f"{BASE}/admin/audit-logs")
    owner.wait_for_load_state("networkidle")
    assert owner.get_by_role("heading", name="Audit log").count() == 1
    assert owner.locator('input[type="date"]').count() == 2

    owner.goto(f"{BASE}/inventory/inspections")
    owner.wait_for_load_state("networkidle")
    assert owner.get_by_role("link", name="PDF").count() == 3
    assert not errors, f"Owner console/page errors: {errors}"
    owner_context.close()

    salesman_context = browser.new_context(viewport={"width": 1280, "height": 900})
    salesman = salesman_context.new_page()
    salesman.set_default_timeout(30_000)
    salesman.set_default_navigation_timeout(90_000)
    login(salesman, "salesman")
    salesman.goto(f"{BASE}/accounts/vouchers")
    salesman.wait_for_load_state("networkidle")
    assert salesman.url.endswith("/?denied=1"), salesman.url
    assert salesman.get_by_text("That screen is outside your effective permission").count() == 1
    assert salesman.locator('.sidebar a[href^="/accounts/"]').count() == 0
    salesman.screenshot(path=str(OUT / "salesman-denied.png"), full_page=True)
    salesman_context.close()
    browser.close()
    print("PASS  Owner Phase 6 screens render without browser errors")
    print("PASS  Four live tank gauges and six attendance rows render")
    print("PASS  Inspection PDF controls and permission matrix render")
    print("PASS  User/date/screen restrictions and both filterable logs render")
    print("PASS  SALESMAN direct accounts URL is denied and accounts links are absent")
