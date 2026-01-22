from playwright.sync_api import sync_playwright
import time

def verify_mobile():
    with sync_playwright() as p:
        # iPhone 12 emulation
        iphone_12 = p.devices['iPhone 12']
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(**iphone_12)
        page = context.new_page()

        try:
            # 1. Check BottomNav and Home
            page.goto("http://localhost:5173/")
            time.sleep(2) # Wait for load
            page.screenshot(path="verification_home.png")
            print("Home screenshot taken.")

            # 2. Check Settings (Inputs)
            page.goto("http://localhost:5173/settings")
            time.sleep(2)
            page.screenshot(path="verification_settings.png")
            print("Settings screenshot taken.")

            # Check computed font size of an input
            input_el = page.locator('input[type="number"]').first
            if input_el.is_visible():
                font_size = input_el.evaluate("el => window.getComputedStyle(el).fontSize")
                print(f"Input font size: {font_size}")

            # 3. Check Results (KPI Grid - might be empty without data)
            page.goto("http://localhost:5173/results")
            time.sleep(2)
            page.screenshot(path="verification_results.png")
            print("Results screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_mobile()
