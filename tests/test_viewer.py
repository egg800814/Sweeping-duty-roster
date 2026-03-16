# tests/test_viewer.py
"""
任務二：viewer.html — 互動功能測試
使用 Playwright route mock 攔截 GAS API 請求
"""
import json
import pytest
from conftest import _inject_data_json, GAS_API_URL


# ─── Mock Data ───
MOCK_ASSIGNMENTS = [
    {
        "areaCode": "a1",
        "areaName": "2樓_廚房",
        "persons": "楊麗玉, 江辰平",
        "staffNames": "楊麗玉, 江辰平",
        "status1": "",
        "status2": "",
        "status3": "",
        "status4": "",
        "gender1": "female",
        "gender2": "female",
        "gender3": "",
        "gender4": "",
        "genders": ["female", "female"],
    },
    {
        "areaCode": "a5",
        "areaName": "1樓_食堂",
        "persons": "莊達富",
        "staffNames": "莊達富",
        "status1": "已確認",
        "status2": "",
        "status3": "",
        "status4": "",
        "gender1": "male",
        "gender2": "",
        "gender3": "",
        "gender4": "",
        "genders": ["male"],
    },
    {
        "areaCode": "a10",
        "areaName": "2樓_多目的室",
        "persons": "無人打掃",
        "staffNames": "無人打掃",
        "status1": "",
        "status2": "",
        "status3": "",
        "status4": "",
        "gender1": "",
        "gender2": "",
        "gender3": "",
        "gender4": "",
        "genders": [],
    },
]


def _setup_viewer_with_mock(page, http_server, assignments, status_code=200):
    """設定 viewer 頁面 + mock GAS API GET"""
    _inject_data_json(page, http_server)

    def handle_gas_get(route):
        if status_code == 200:
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(assignments),
            )
        else:
            route.fulfill(status=status_code, body="Server Error")

    page.route("**/script.google.com/**", handle_gas_get)
    page.goto(f"{http_server}/frontend/viewer.html", wait_until="networkidle")
    page.wait_for_timeout(2000)


class TestViewerLoad:
    """頁面載入測試"""

    def test_load_with_data(self, page, http_server):
        """正常載入排班資料，卡片正確渲染"""
        _setup_viewer_with_mock(page, http_server, MOCK_ASSIGNMENTS)

        cards = page.locator("#container .card")
        assert cards.count() == 3

        # 第一張卡片顯示區域名稱
        assert "2樓_廚房" in cards.first.inner_text()

    def test_load_empty_data(self, page, http_server):
        """空資料顯示「今日打掃區域尚未安排」"""
        _setup_viewer_with_mock(page, http_server, [])

        no_data = page.locator("#no-data")
        assert no_data.is_visible()
        assert "尚未安排" in no_data.inner_text()

    def test_load_api_failure(self, page, http_server):
        """API 失敗顯示連線失敗訊息"""
        _inject_data_json(page, http_server)

        page.route("**/script.google.com/**", lambda route: route.abort())
        page.goto(f"{http_server}/frontend/viewer.html", wait_until="networkidle")
        page.wait_for_timeout(3000)

        loading = page.locator("#loading")
        assert "失敗" in loading.inner_text() or loading.is_visible()


class TestViewerConfirmButton:
    """確認按鈕測試"""

    def test_confirm_success(self, page, http_server):
        """點擊確認按鈕 → 成功 → 按鈕變綠 + disabled"""
        _setup_viewer_with_mock(page, http_server, MOCK_ASSIGNMENTS)

        # 重新設定 POST route
        def handle_post(route):
            if route.request.method == "POST":
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body='{"success": true}',
                )
            else:
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(MOCK_ASSIGNMENTS),
                )

        page.unroute("**/script.google.com/**")
        page.route("**/script.google.com/**", handle_post)

        # 找到第一個未確認的按鈕（a1 區域的第一個人）
        btn = page.locator("#btn-a1-0")
        assert btn.is_visible()
        assert not btn.is_disabled()

        btn.click()
        page.wait_for_timeout(2000)

        # 按鈕應變成成功狀態
        assert btn.is_disabled()
        assert "已確認" in btn.inner_text()
        assert "btn-success" in btn.get_attribute("class")

    def test_confirm_failure(self, page, http_server):
        """點擊確認按鈕 → 失敗 → alert 提示 + 按鈕恢復"""
        _setup_viewer_with_mock(page, http_server, MOCK_ASSIGNMENTS)

        def handle_post_fail(route):
            if route.request.method == "POST":
                route.fulfill(status=500, body="Error")
            else:
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(MOCK_ASSIGNMENTS),
                )

        page.unroute("**/script.google.com/**")
        page.route("**/script.google.com/**", handle_post_fail)

        # 攔截 alert
        dialog_messages = []
        page.on("dialog", lambda d: (dialog_messages.append(d.message), d.accept()))

        btn = page.locator("#btn-a1-0")
        btn.click()
        page.wait_for_timeout(2000)

        # 應該有 alert 訊息
        assert len(dialog_messages) > 0
        assert "失敗" in dialog_messages[0]

        # 按鈕應恢復可點擊
        assert not btn.is_disabled()

    def test_already_confirmed_disabled(self, page, http_server):
        """已確認的按鈕載入時即 disabled"""
        _setup_viewer_with_mock(page, http_server, MOCK_ASSIGNMENTS)

        # a5 的 status1 = "已確認"
        btn = page.locator("#btn-a5-0")
        assert btn.is_disabled()
        assert "已確認" in btn.inner_text()
        assert "btn-success" in btn.get_attribute("class")


class TestViewerSpecialCards:
    """特殊卡片測試"""

    def test_unassigned_area_card(self, page, http_server):
        """無人打掃的區域顯示免掃訊息"""
        _setup_viewer_with_mock(page, http_server, MOCK_ASSIGNMENTS)

        cards = page.locator("#container .card")
        unassigned_card = cards.nth(2)  # 第 3 張 = 無人打掃

        assert "card-unassigned" in unassigned_card.get_attribute("class")
        assert "今日免掃" in unassigned_card.inner_text() or "無需清潔" in unassigned_card.inner_text()

    def test_gender_badge_on_buttons(self, page, http_server):
        """性別標示正確"""
        _setup_viewer_with_mock(page, http_server, MOCK_ASSIGNMENTS)

        # a1 的兩位女性
        btn0 = page.locator("#btn-a1-0")
        assert "btn-female" in btn0.get_attribute("class")

        # a5 的男性（已確認所以是 btn-success）
        btn_a5 = page.locator("#btn-a5-0")
        assert "btn-success" in btn_a5.get_attribute("class")
