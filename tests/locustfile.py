# tests/locustfile.py
"""
任務三：併發壓力測試
模擬情境：1 位管理員正在設定排班，同時 N 位打掃人員操作確認

使用方式：
  .venv\Scripts\locust -f tests\locustfile.py
  然後開啟 http://localhost:8089 設定使用者數量與 spawn rate

Host 設定為 GAS API URL 的 base（自動從 data.json 讀取）
"""
import json
import random
from pathlib import Path
from locust import HttpUser, task, between, events

# ─── 讀取 GAS API URL ───
_data_path = Path(__file__).resolve().parent.parent / "data" / "data.json"
with open(_data_path, "r", encoding="utf-8") as f:
    _data = json.load(f)

GAS_FULL_URL = _data.get("gasApiUrl", "")

# 從完整 URL 取得 path 部分（排除 host）
# 例如 https://script.google.com/macros/s/.../exec → /macros/s/.../exec
if GAS_FULL_URL:
    from urllib.parse import urlparse
    _parsed = urlparse(GAS_FULL_URL)
    GAS_PATH = _parsed.path
else:
    GAS_PATH = "/macros/s/PLACEHOLDER/exec"


# ─── 模擬排班管理員的 payload ───
ADMIN_PAYLOAD = {
    "date": "2026-03-17",
    "plannerName": "壓測負責人",
    "staffMeta": [
        {"name": "測試人員A", "gender": "male"},
        {"name": "測試人員B", "gender": "female"},
        {"name": "測試人員C", "gender": "male"},
    ],
    "assignments": [
        {
            "areaId": "a5",
            "areaName": "1樓_食堂",
            "staffIds": ["s02"],
            "staffNames": "測試人員A",
        },
        {
            "areaId": "a8",
            "areaName": "2樓_走廊、玄關、應接室",
            "staffIds": ["s04"],
            "staffNames": "測試人員B",
        },
    ],
}

# ─── 模擬確認請求的 area codes ───
AREA_CODES = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"]


class AdminUser(HttpUser):
    """
    管理員角色：每 5-10 秒發送一次排班 POST
    權重較低（1），模擬只有 1 位管理員
    """
    weight = 1
    wait_time = between(5, 10)

    @task
    def post_schedule(self):
        """發送排班資料（模式 A）"""
        self.client.post(
            GAS_PATH,
            data=json.dumps(ADMIN_PAYLOAD),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            name="POST /exec (Admin: 設定排班)",
        )

    @task(2)
    def get_admin_data(self):
        """以 admin 模式讀取排班資料"""
        self.client.get(
            GAS_PATH + "?type=admin",
            name="GET /exec?type=admin (Admin: 讀取資料)",
        )


class ViewerUser(HttpUser):
    """
    打掃人員角色：每 1-3 秒操作
    權重較高（10），模擬多位打掃人員同時操作
    """
    weight = 10
    wait_time = between(1, 3)

    @task(3)
    def get_schedule(self):
        """讀取今日排班資料（一般模式）"""
        self.client.get(
            GAS_PATH,
            name="GET /exec (Viewer: 載入排班)",
        )

    @task(1)
    def confirm_task(self):
        """確認打掃完成"""
        area = random.choice(AREA_CODES)
        person_index = random.randint(0, 3)
        payload = {
            "areaCode": area,
            "personIndex": person_index,
        }
        self.client.post(
            GAS_PATH,
            data=json.dumps(payload),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            name="POST /exec (Viewer: 確認打掃)",
        )


# ─── 事件鉤子：測試開始時輸出資訊 ───
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("=" * 60)
    print("  MDI 掃地排班系統 — 併發壓力測試")
    print(f"  目標 API: {GAS_FULL_URL}")
    print("  場景: 1 管理員排班 + N 打掃人員確認")
    print("=" * 60)
