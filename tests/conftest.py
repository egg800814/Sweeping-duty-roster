# tests/conftest.py
"""
共用 Pytest Fixtures：
- 啟動本地 HTTP Server 提供靜態頁面
- 提供 setup_page / viewer_page / index_page fixtures
- 預載 localStorage 資料
"""
import json
import threading
import http.server
import functools
import os
import pytest
from pathlib import Path
from playwright.sync_api import sync_playwright


# ─── 專案根目錄 ───
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ─── 讀取 data.json 取得 GAS API URL 與測試資料 ───
DATA_JSON_PATH = PROJECT_ROOT / "data" / "data.json"
with open(DATA_JSON_PATH, "r", encoding="utf-8") as f:
    DATA_JSON = json.load(f)

GAS_API_URL = DATA_JSON.get("gasApiUrl", "")


# ─── 本地 HTTP Server ───
class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """不輸出 log 的 handler"""
    def log_message(self, format, *args):
        pass


@pytest.fixture(scope="session")
def http_server():
    """啟動一個本地靜態 HTTP Server，scope=session 整個測試 session 共用。"""
    handler = functools.partial(QuietHTTPHandler, directory=str(PROJECT_ROOT))
    server = http.server.HTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


@pytest.fixture(scope="session")
def browser_instance():
    """Session-scoped Playwright browser instance."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        yield browser
        browser.close()


@pytest.fixture
def context(browser_instance):
    """每個 test 一個獨立 context（隔離 localStorage）。"""
    ctx = browser_instance.new_context()
    yield ctx
    ctx.close()


@pytest.fixture
def page(context):
    """每個 test 一個獨立 page。"""
    pg = context.new_page()
    yield pg
    pg.close()


def _inject_data_json(page, base_url):
    """攔截 data.json 請求，直接回傳本地資料（避免路徑問題）。"""
    def handle_data_json(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(DATA_JSON),
        )
    page.route("**/data/data.json*", handle_data_json)


@pytest.fixture
def setup_page(page, http_server):
    """開啟 setup.html 並等待載入完成。"""
    _inject_data_json(page, http_server)
    page.goto(f"{http_server}/frontend/setup.html", wait_until="networkidle")
    # 等待 boot() 完成
    page.wait_for_selector("#staffCheckboxes .checkbox-item", timeout=10000)
    return page


@pytest.fixture
def viewer_page(page, http_server):
    """開啟 viewer.html（需要 mock GAS API）。"""
    _inject_data_json(page, http_server)
    return page


@pytest.fixture
def index_page(page, http_server):
    """開啟 index.html。"""
    _inject_data_json(page, http_server)
    page.goto(f"{http_server}/index.html", wait_until="networkidle")
    return page


# ─── 共用 helpers ───
def click_tab(page, tab_name):
    """點擊指定的 tab 按鈕。"""
    page.click(f'.tab-btn[data-tab="{tab_name}"]')
    page.wait_for_selector(f'#panel-{tab_name}.active', timeout=5000)


def get_toast_text(page, timeout=3000):
    """取得最新 toast 訊息文字。"""
    page.wait_for_selector(".toast", timeout=timeout)
    page.wait_for_timeout(300) # 給動畫一點時間
    toasts = page.locator(".toast").all_inner_texts()
    return toasts[-1] if toasts else ""


def accept_dialog(page):
    """預先設定接受下一個 confirm dialog。"""
    page.once("dialog", lambda d: d.accept())


def dismiss_dialog(page):
    """預先設定取消下一個 confirm dialog。"""
    page.once("dialog", lambda d: d.dismiss())
