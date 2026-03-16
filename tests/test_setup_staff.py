# tests/test_setup_staff.py
"""
任務一（部分）：setup.html — 人員管理 CRUD 功能測試
"""
import pytest
from conftest import click_tab, get_toast_text, accept_dialog, dismiss_dialog


class TestStaffAdd:
    """新增人員相關測試"""

    def test_add_staff_success(self, setup_page):
        """正常流程：填寫完整資料後新增人員"""
        page = setup_page
        click_tab(page, "staff")

        # 記錄新增前的列數
        rows_before = page.locator("#staffTableBody tr").count()

        # 點擊新增按鈕
        page.click("#addStaffBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)

        # 填寫表單
        page.fill("#modalStaffName", "測試員工A")
        page.select_option("#modalStaffDept", "技術部")
        page.select_option("#modalStaffGender", "male")
        page.select_option("#modalStaffRole", "regular")
        page.select_option("#modalStaffDefault", "true")

        # 點擊新增
        page.click('#modalContent button:has-text("新增")')

        # 驗證：Modal 關閉
        assert not page.locator("#modalOverlay.active").is_visible()

        # 驗證：Toast 成功訊息
        toast = get_toast_text(page)
        assert "測試員工A" in toast

        # 驗證：表格多了一列
        rows_after = page.locator("#staffTableBody tr").count()
        assert rows_after == rows_before + 1

        # 驗證：表格中包含新人員
        assert page.locator("#staffTableBody").inner_text().__contains__("測試員工A")

    def test_add_staff_empty_name(self, setup_page):
        """防呆：姓名空白時不允許新增"""
        page = setup_page
        click_tab(page, "staff")

        page.click("#addStaffBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)

        # 不填姓名，直接點新增
        page.fill("#modalStaffName", "")
        page.click('#modalContent button:has-text("新增")')

        # 驗證：Toast 顯示錯誤
        toast = get_toast_text(page)
        assert "請輸入姓名" in toast

        # 驗證：Modal 仍然開啟
        assert page.locator("#modalOverlay.active").is_visible()

    def test_add_staff_with_floor_restriction(self, setup_page):
        """新增有樓層限制的人員"""
        page = setup_page
        click_tab(page, "staff")

        page.click("#addStaffBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)

        page.fill("#modalStaffName", "限樓層員工")
        page.select_option("#modalStaffFloor", "2")
        page.click('#modalContent button:has-text("新增")')

        toast = get_toast_text(page)
        assert "限樓層員工" in toast

        # 驗證：表格中顯示樓層限制標籤
        table_text = page.locator("#staffTableBody").inner_text()
        assert "限樓層員工" in table_text

    def test_add_staff_cancel(self, setup_page):
        """取消新增不會改變資料"""
        page = setup_page
        click_tab(page, "staff")

        rows_before = page.locator("#staffTableBody tr").count()

        page.click("#addStaffBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)
        page.fill("#modalStaffName", "不應出現")

        # 點擊取消
        page.click('#modalContent button:has-text("取消")')

        rows_after = page.locator("#staffTableBody tr").count()
        assert rows_after == rows_before


class TestStaffEdit:
    """編輯人員相關測試"""

    def test_edit_staff_name(self, setup_page):
        """編輯人員姓名"""
        page = setup_page
        click_tab(page, "staff")

        # 點擊第一個編輯按鈕
        edit_buttons = page.locator("#staffTableBody .btn-icon:not(.danger)")
        if edit_buttons.count() > 0:
            edit_buttons.first.click()
            page.wait_for_selector("#modalOverlay.active", timeout=3000)

            # 記錄原始名稱
            original_name = page.input_value("#modalStaffName")

            # 修改名稱
            page.fill("#modalStaffName", original_name + "_已編輯")
            page.click('#modalContent button:has-text("儲存")')

            # 驗證
            toast = get_toast_text(page)
            assert "已更新" in toast
            assert page.locator("#staffTableBody").inner_text().__contains__(original_name + "_已編輯")

            # 還原（再次編輯回來）
            edit_buttons = page.locator("#staffTableBody .btn-icon:not(.danger)")
            edit_buttons.first.click()
            page.wait_for_selector("#modalOverlay.active", timeout=3000)
            page.fill("#modalStaffName", original_name)
            page.click('#modalContent button:has-text("儲存")')


class TestStaffDelete:
    """刪除人員相關測試"""

    def test_delete_staff_confirm(self, setup_page):
        """確認刪除人員"""
        page = setup_page
        click_tab(page, "staff")

        # 先新增一個要刪除的人
        page.click("#addStaffBtn")
        page.wait_for_selector("#modalOverlay.active", timeout=3000)
        page.fill("#modalStaffName", "即將刪除")
        page.click('#modalContent button:has-text("新增")')
        page.wait_for_timeout(500)

        rows_before = page.locator("#staffTableBody tr").count()

        # 找到「即將刪除」那一列的刪除按鈕
        accept_dialog(page)
        delete_buttons = page.locator("#staffTableBody .btn-icon.danger")
        delete_buttons.last.click()

        page.wait_for_timeout(500)
        rows_after = page.locator("#staffTableBody tr").count()
        assert rows_after == rows_before - 1

    def test_delete_staff_cancel(self, setup_page):
        """取消刪除不會改變資料"""
        page = setup_page
        click_tab(page, "staff")

        rows_before = page.locator("#staffTableBody tr").count()
        if rows_before > 0:
            dismiss_dialog(page)
            page.locator("#staffTableBody .btn-icon.danger").first.click()
            page.wait_for_timeout(500)

            rows_after = page.locator("#staffTableBody tr").count()
            assert rows_after == rows_before
