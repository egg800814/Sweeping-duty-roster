# tests/test_setup_area.py
"""
任務一（部分）：setup.html — 區域管理 CRUD 功能測試
"""
import pytest
from conftest import click_tab, get_toast_text, accept_dialog, dismiss_dialog


class TestAreaAdd:
    """新增區域相關測試"""

    def test_add_area_success(self, setup_page):
        """正常流程：填寫完整資料後新增區域"""
        page = setup_page
        click_tab(page, "areas")

        rows_before = page.locator("#areaTableBody tr").count()

        page.click("#addAreaBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)

        page.fill("#modalAreaName", "測試會議室Z")
        page.select_option("#modalAreaFloor", "2")
        page.select_option("#modalAreaPriority", "optional")
        page.select_option("#modalAreaGender", "none")
        page.fill("#modalAreaMin", "1")
        page.fill("#modalAreaMax", "3")

        page.click('#modalContent button:has-text("新增")')

        # 驗證
        toast = get_toast_text(page)
        assert "測試會議室Z" in toast

        rows_after = page.locator("#areaTableBody tr").count()
        assert rows_after == rows_before + 1

    def test_add_area_empty_name(self, setup_page):
        """防呆：區域名稱空白時不允許新增"""
        page = setup_page
        click_tab(page, "areas")

        page.click("#addAreaBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)

        page.fill("#modalAreaName", "")
        page.click('#modalContent button:has-text("新增")')

        toast = get_toast_text(page)
        assert "請輸入區域名稱" in toast

        # Modal 仍然開啟
        assert page.locator("#modalOverlay.active").is_visible()

    def test_add_area_with_holiday_boost(self, setup_page):
        """新增假日前加人的區域"""
        page = setup_page
        click_tab(page, "areas")

        page.click("#addAreaBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)

        page.fill("#modalAreaName", "假日加強區")
        page.select_option("#modalAreaHoliday", "true")
        page.click('#modalContent button:has-text("新增")')

        toast = get_toast_text(page)
        assert "假日加強區" in toast

    def test_add_area_cancel(self, setup_page):
        """取消新增不會改變資料"""
        page = setup_page
        click_tab(page, "areas")

        rows_before = page.locator("#areaTableBody tr").count()

        page.click("#addAreaBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)
        page.fill("#modalAreaName", "不應出現區域")
        page.click('#modalContent button:has-text("取消")')

        rows_after = page.locator("#areaTableBody tr").count()
        assert rows_after == rows_before


class TestAreaEdit:
    """編輯區域相關測試"""

    def test_edit_area_name(self, setup_page):
        """編輯區域名稱"""
        page = setup_page
        click_tab(page, "areas")

        edit_buttons = page.locator("#areaTableBody .btn-icon:not(.danger)")
        if edit_buttons.count() > 0:
            edit_buttons.first.click()
            page.wait_for_selector("#modalOverlay.active", timeout=3000)

            original_name = page.input_value("#modalAreaName")
            page.fill("#modalAreaName", original_name + "_修改")
            page.click('#modalContent button:has-text("儲存")')

            toast = get_toast_text(page)
            assert "已更新" in toast

            # 還原
            edit_buttons = page.locator("#areaTableBody .btn-icon:not(.danger)")
            edit_buttons.first.click()
            page.wait_for_selector("#modalOverlay.active", timeout=3000)
            page.fill("#modalAreaName", original_name)
            page.click('#modalContent button:has-text("儲存")')

    def test_edit_area_priority(self, setup_page):
        """編輯區域優先級"""
        page = setup_page
        click_tab(page, "areas")

        edit_buttons = page.locator("#areaTableBody .btn-icon:not(.danger)")
        if edit_buttons.count() > 0:
            edit_buttons.first.click()
            page.wait_for_selector("#modalOverlay.active", timeout=3000)

            page.select_option("#modalAreaPriority", "flexible")
            page.click('#modalContent button:has-text("儲存")')

            toast = get_toast_text(page)
            assert "已更新" in toast


class TestAreaDelete:
    """刪除區域相關測試"""

    def test_delete_area_confirm(self, setup_page):
        """確認刪除區域"""
        page = setup_page
        click_tab(page, "areas")

        # 先新增一個要刪除的區域
        page.click("#addAreaBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)
        page.fill("#modalAreaName", "待刪除區域")
        page.click('#modalContent button:has-text("新增")')
        page.wait_for_timeout(500)

        rows_before = page.locator("#areaTableBody tr").count()

        accept_dialog(page)
        page.locator("#areaTableBody .btn-icon.danger").last.click()
        page.wait_for_timeout(500)

        rows_after = page.locator("#areaTableBody tr").count()
        assert rows_after == rows_before - 1

    def test_delete_area_cancel(self, setup_page):
        """取消刪除不會改變資料"""
        page = setup_page
        click_tab(page, "areas")

        rows_before = page.locator("#areaTableBody tr").count()
        if rows_before > 0:
            dismiss_dialog(page)
            page.locator("#areaTableBody .btn-icon.danger").first.click()
            page.wait_for_timeout(500)

            rows_after = page.locator("#areaTableBody tr").count()
            assert rows_after == rows_before
