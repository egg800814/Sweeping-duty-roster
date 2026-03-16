# tests/test_index.py
"""
任務二（補充）：index.html — 入口頁面測試
"""
import json
import pytest
from conftest import _inject_data_json, GAS_API_URL


class TestIndexPage:
    """入口頁面測試"""

    def test_portal_cards_rendered(self, index_page):
        """兩張入口卡片正確顯示"""
        page = index_page
        cards = page.locator(".portal-card")
        assert cards.count() == 2

    def test_viewer_link(self, index_page):
        """一般打掃人員連結指向 viewer.html"""
        page = index_page
        viewer_link = page.locator(".portal-card").first
        href = viewer_link.get_attribute("href")
        assert "viewer.html" in href

    def test_setup_link(self, index_page):
        """管理員連結指向 setup.html"""
        page = index_page
        setup_link = page.locator(".portal-card").nth(1)
        href = setup_link.get_attribute("href")
        assert "setup.html" in href

    def test_admin_badge(self, index_page):
        """管理員卡片有 ADMIN 標籤"""
        page = index_page
        badge = page.locator(".badge")
        assert badge.is_visible()
        assert "ADMIN" in badge.inner_text()

    def test_title(self, index_page):
        """頁面標題正確"""
        page = index_page
        assert "掃地排班" in page.title() or "MDI" in page.title()

    def test_planner_info_display(self, page, http_server):
        """今日責任者從 API 載入並顯示"""
        _inject_data_json(page, http_server)

        mock_response = [{"todayPlanner": "測試負責人"}]
        page.route("**/script.google.com/**", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(mock_response),
        ))

        page.goto(f"{http_server}/index.html", wait_until="networkidle")
        page.wait_for_timeout(2000)

        planner_el = page.locator("#plannerInfo")
        text = planner_el.inner_text()
        assert "測試負責人" in text
