@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0backend"
echo จำลองระบบ AI ส่งข้อมูลจากกล้อง 3 ตัว (เปิด start.bat ไว้ก่อน)
.venv\Scripts\python simulator.py --fast
