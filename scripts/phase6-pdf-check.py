from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://localhost:3000"
OUTPUT = Path(".artifacts/phase6-pdf")
OUTPUT.mkdir(parents=True, exist_ok=True)


def save_pdf(context, href: str, name: str) -> None:
    response = context.request.get(f"{BASE}{href}")
    assert response.ok, f"{href}: {response.status} {response.text()}"
    content = response.body()
    assert content.startswith(b"%PDF")
    (OUTPUT / name).write_bytes(content)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.goto(f"{BASE}/login")
    page.locator('input[name="username"]').fill("owner")
    page.locator('input[name="password"]').fill("ChangeMe123!")
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_timeout(3_000)
    assert "/login" not in page.url

    page.goto(f"{BASE}/inventory/inspections")
    inspection_href = page.get_by_role("link", name="PDF").first.get_attribute("href")
    assert inspection_href
    save_pdf(context, inspection_href, "inspection.pdf")

    page.goto(f"{BASE}/payroll/salary-runs")
    page.locator('input[name="month"]').fill("2026-09")
    page.get_by_role("button", name="Calculate preview").click()
    page.get_by_text("Editable salary preview calculated").wait_for()

    page.goto(f"{BASE}/payroll/payslips")
    payslip_href = page.get_by_role("link", name="Download all PDF").get_attribute(
        "href"
    )
    assert payslip_href
    save_pdf(context, payslip_href, "payslips.pdf")

    browser.close()

print(f"Downloaded authenticated Phase 6 PDFs to {OUTPUT}")
