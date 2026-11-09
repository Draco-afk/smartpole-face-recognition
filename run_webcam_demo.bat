@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0backend"
echo ใช้เว็บแคมเป็น CAM 1 (ตรวจจับใบหน้าจริงด้วย OpenCV) กล้อง 2-4 เป็นภาพจำลอง
echo ใบหน้าที่เว็บแคมเห็นจะถูกจำลองว่าเป็นบุคคลหมายเลข 1 ในรายชื่อเฝ้าระวัง (Blacklist) เพื่อสาธิตการแจ้งเตือน
.venv\Scripts\python simulator.py --webcam --webcam-as 1
