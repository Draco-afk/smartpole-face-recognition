@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
if not exist .venv (
  echo [1/3] สร้าง Python virtual environment...
  python -m venv .venv
  .venv\Scripts\python -m pip install -r requirements.txt
)
if not exist smartpole.db (
  echo [2/3] สร้างฐานข้อมูลตัวอย่าง...
  .venv\Scripts\python seed.py --force
)
if not exist "..\frontend\dist\index.html" (
  echo [3/3] Build หน้าเว็บ...
  pushd ..\frontend
  call npm install
  call npm run build
  popd
)
echo.
echo เปิดเว็บที่ http://localhost:8000  (กด Ctrl+C เพื่อหยุด)
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
