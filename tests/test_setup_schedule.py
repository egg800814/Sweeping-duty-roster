# tests/test_setup_schedule.py
"""
任務一（部分）：setup.html — 每日排班流程、輪值設定、資料管理測試
"""
import pytest
from conftest import click_tab, get_toast_text, accept_dialog, GAS_API_URL


class TestScheduleTab:
    """每日排班分頁測試"""

    def test_date_defaults_to_today(self, setup_page):
        """日期預設為今天"""
        page = setup_page
        from datetime import date
        expected_date = page.evaluate("new Date().toISOString().slice(0, 10)")
        assert page.input_value("#scheduleDate") == expected_date

    def test_today_button(self, setup_page):
        """今天按鈕重設日期"""
        page = setup_page
        from datetime import date

        # 先改成其他日期
        page.fill("#scheduleDate", "2026-01-01")
        page.click("#todayBtn")
        expected_date = page.evaluate("new Date().toISOString().slice(0, 10)")
        assert page.input_value("#scheduleDate") == expected_date

    def test_select_all_staff(self, setup_page):
        """全選按鈕勾選所有人員"""
        page = setup_page
        page.click("#selectAllStaff")
        page.wait_for_timeout(300)

        total = page.locator("#staffCheckboxes .checkbox-item").count()
        checked = page.locator("#staffCheckboxes .checkbox-item.checked").count()
        assert checked == total

        # 統計數字應一致
        present = int(page.inner_text("#presentCount"))
        assert present == total

    def test_deselect_all_staff(self, setup_page):
        """全不選按鈕取消所有勾選"""
        page = setup_page
        page.click("#deselectAllStaff")
        page.wait_for_timeout(300)

        checked = page.locator("#staffCheckboxes .checkbox-item.checked").count()
        assert checked == 0
        assert int(page.inner_text("#presentCount")) == 0

    def test_select_default_staff(self, setup_page):
        """預設按鈕恢復預設出勤人員"""
        page = setup_page
        page.click("#selectDefaultStaff")
        page.wait_for_timeout(300)

        present = int(page.inner_text("#presentCount"))
        assert present > 0  # 應該有預設出勤的人

    def test_gender_count(self, setup_page):
        """男女人數統計正確"""
        page = setup_page
        page.click("#selectAllStaff")
        page.wait_for_timeout(300)

        total = int(page.inner_text("#presentCount"))
        male = int(page.inner_text("#maleCount"))
        female = int(page.inner_text("#femaleCount"))

        assert male + female == total
        assert male > 0
        assert female > 0

    def test_generate_no_staff_selected(self, setup_page):
        """未勾選人員時自動排班顯示錯誤"""
        page = setup_page
        page.click("#deselectAllStaff")
        page.wait_for_timeout(300)

        # Mock GAS API 避免實際請求
        page.route("**/script.google.com/**", lambda route: route.abort())

        page.click("#generateBtn")
        toast = get_toast_text(page)
        assert "請先勾選" in toast

    def test_generate_schedule_success(self, setup_page):
        """正常自動排班"""
        page = setup_page
        page.click("#selectDefaultStaff")
        page.wait_for_timeout(300)

        # Mock GAS sync 請求
        page.route("**/script.google.com/**", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"status":"success"}'
        ))

        page.click("#generateBtn")
        page.wait_for_timeout(1000)

        # 排班結果應出現
        result = page.locator("#scheduleResult")
        assert result.inner_text() != ""
        assert "排班結果" in result.inner_text()

        # 儲存、列印、追加按鈕顯示
        assert page.locator("#saveScheduleBtn").is_visible()
        assert page.locator("#printBtn").is_visible()
        assert page.locator("#addLateBtn").is_visible()

    def test_save_schedule(self, setup_page):
        """儲存排班"""
        page = setup_page
        page.click("#selectDefaultStaff")
        page.wait_for_timeout(300)

        page.route("**/script.google.com/**", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body='{"status":"success"}'
        ))

        page.click("#generateBtn")
        page.wait_for_timeout(1000)

        page.click("#saveScheduleBtn")
        toast = get_toast_text(page)
        assert "已儲存" in toast

    def test_holiday_toggle(self, setup_page):
        """隔天放假切換"""
        page = setup_page
        checkbox = page.locator("#holidayToggle")
        initial = checkbox.is_checked()

        page.click("#holidayLabel")
        page.wait_for_timeout(200)
        assert checkbox.is_checked() != initial

        # 再切回來
        page.click("#holidayLabel")
        page.wait_for_timeout(200)
        assert checkbox.is_checked() == initial

    def test_planner_banner_displayed(self, setup_page):
        """負責人橫幅顯示"""
        page = setup_page
        planner_name = page.inner_text("#plannerName")
        # 應顯示一個名字（非「載入中...」）
        assert planner_name != "載入中..."
        assert len(planner_name) > 0


class TestRotationTab:
    """輪值設定分頁測試"""

    def test_rotation_list_rendered(self, setup_page):
        """輪值列表正常渲染"""
        page = setup_page
        click_tab(page, "rotation")

        items = page.locator(".rotation-item")
        assert items.count() > 0

    def test_rotation_has_current_badge(self, setup_page):
        """本週標記存在"""
        page = setup_page
        click_tab(page, "rotation")

        current = page.locator(".rotation-item.current")
        assert current.count() == 1

    def test_advance_week(self, setup_page):
        """推進下一週"""
        page = setup_page
        click_tab(page, "rotation")

        # 記錄目前的本週索引
        current_before = page.locator(".rotation-item.current .rotation-index").inner_text()

        page.click("#advanceWeekBtn")
        page.wait_for_timeout(500)

        current_after = page.locator(".rotation-item.current .rotation-index").inner_text()
        assert current_before != current_after


class TestSettingsTab:
    """資料管理分頁測試"""

    def test_gas_url_displayed(self, setup_page):
        """GAS URL 輸入框顯示目前的 URL"""
        page = setup_page
        click_tab(page, "settings")

        value = page.input_value("#gasApiUrlInput")
        assert value.startswith("https://script.google.com/")

    def test_gas_url_invalid_format(self, setup_page):
        """設定無效 URL 格式時顯示錯誤"""
        page = setup_page
        click_tab(page, "settings")

        page.fill("#gasApiUrlInput", "http://invalid-url.com")
        page.click("#saveGasUrlBtn")

        status = page.inner_text("#gasUrlStatus")
        assert "格式錯誤" in status

    def test_gas_url_reset(self, setup_page):
        """重設 GAS URL"""
        page = setup_page
        click_tab(page, "settings")

        page.click("#resetGasUrlBtn")
        toast = get_toast_text(page)
        assert "重設" in toast

    def test_export_json(self, setup_page):
        """匯出 JSON 觸發下載"""
        page = setup_page
        click_tab(page, "settings")

        with page.expect_download() as download_info:
            page.click("#exportBtn")

        download = download_info.value
        assert download.suggested_filename.startswith("cleaning_backup_")
        assert download.suggested_filename.endswith(".json")
