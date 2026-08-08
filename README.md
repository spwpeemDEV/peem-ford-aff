# Flow AI Side Panel Launcher

Chrome Extension แบบ Manifest V3 สำหรับเปิดแถบด้านข้างของ Chrome และเข้า Google Flow ผ่านปุ่ม **เริ่ม prompt**

## วิธีติดตั้ง

1. เปิด Chrome แล้วไปที่ `chrome://extensions`
2. เปิด **โหมดนักพัฒนาซอฟต์แวร์ (Developer mode)**
3. คลิก **โหลดส่วนขยายที่คลายการบีบอัดแล้ว (Load unpacked)**
4. เลือกโฟลเดอร์ `flow-ai-launcher`
5. ปักหมุดส่วนขยายไว้บนแถบเครื่องมือ
6. คลิกไอคอนส่วนขยายเพื่อเปิด **Side Panel**
7. กดปุ่ม **เริ่ม prompt** เพื่อเปิด Google Flow ในแท็บใหม่

> ต้องใช้ Chrome เวอร์ชัน 116 ขึ้นไป

## โครงสร้างโค้ด

- `flow-runtime.js` เก็บ stage, progress และประวัติสถานะของ workflow
- `flow-dom.js` รวมการค้นหา element, selector และวิธีคลิกมาตรฐาน
- `flow-media.js` ตรวจจับ asset ใหม่และเลือกรูป AI แยกจากรูปอ้างอิง
- `flow-content.js` ทำหน้าที่เรียงลำดับขั้นตอน Image → Video
- `background.js` จัดการแท็บ งานที่รอดำเนินการ และ Chrome Debugger
- `sidepanel.js` รับข้อมูลจากผู้ใช้และแสดงสถานะล่าสุด

ลำดับการโหลดโมดูลกำหนดใน `manifest.json` โดยโหลด runtime และ helper ก่อน
`flow-content.js` เสมอ

## เปลี่ยนเว็บไซต์ปลายทาง

แก้ค่า `FLOW_AI_URL` ในไฟล์ `sidepanel.js`
