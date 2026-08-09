# Flow AI Side Panel Launcher

Chrome Extension แบบ Manifest V3 สำหรับเปิดแถบด้านข้างของ Chrome และเข้า Google Flow ผ่านปุ่ม **เริ่ม prompt**

## วิธีติดตั้ง

1. เปิด Chrome แล้วไปที่ `chrome://extensions`
2. เปิด **โหมดนักพัฒนาซอฟต์แวร์ (Developer mode)**
3. คลิก **โหลดส่วนขยายที่คลายการบีบอัดแล้ว (Load unpacked)**
4. เลือกโฟลเดอร์โปรเจกต์ที่มีไฟล์ `manifest.json`
5. ปักหมุดส่วนขยายไว้บนแถบเครื่องมือ
6. คลิกไอคอนส่วนขยายเพื่อเปิด **Side Panel**
7. กดปุ่ม **เริ่ม prompt** เพื่อเปิด Google Flow ในแท็บใหม่

> ต้องใช้ Chrome เวอร์ชัน 116 ขึ้นไป

## โครงสร้างโค้ด

```text
src/
├─ background/
│  └─ service-worker.js
├─ sidepanel/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
└─ content/
   ├─ core/
   │  ├─ runtime.js
   │  └─ dom.js
   └─ flow/
      ├─ config.js
      ├─ media.js
      └─ automation.js
```

ดูรายละเอียด dependency และแนวทางต่อยอดที่ `docs/ARCHITECTURE.md`

## เปลี่ยนเว็บไซต์ปลายทาง

แก้ค่า `FLOW_AI_URL` ในไฟล์ `src/background/service-worker.js`
