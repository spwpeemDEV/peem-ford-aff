# Flow AI Launcher Architecture

## เป้าหมาย

โครงสร้างนี้แยก Chrome Extension ตาม runtime และความรับผิดชอบ เพื่อให้เพิ่ม
workflow, selector, model หรือ UI ใหม่ได้โดยไม่ต้องแก้ทุกส่วนพร้อมกัน

## Entry points

- `manifest.json` เป็น composition root ของ Chrome Extension
- `src/background/service-worker.js` ดูแล lifecycle ของงาน แท็บ และ Chrome Debugger
- `src/sidepanel/index.html` เป็นหน้ารับข้อมูลจากผู้ใช้
- `src/content/flow/automation.js` เป็นตัวเรียงลำดับ Image → Video บนหน้า Flow

## Content-script layers

Content scripts ของ Manifest V3 โหลดตามลำดับนี้:

```text
core/runtime.js
       ↓
core/dom.js
       ↓
flow/config.js
       ↓
flow/media.js
       ↓
flow/automation.js
```

### `core/runtime.js`

เก็บชื่อ stage, progress แบบเพิ่มขึ้นทางเดียว และประวัติสถานะ ไม่ควรมี selector
หรือ logic ที่ผูกกับหน้า Google Flow

### `core/dom.js`

เก็บ primitive สำหรับ DOM เช่น visibility, label matching, semantic lookup และ
การคลิกมาตรฐาน ส่วนนี้ควรใช้ซ้ำได้กับทุก workflow

### `flow/media.js`

รับ dependency จาก DOM layer ผ่าน factory แล้วทำหน้าที่ตรวจ asset ใหม่ ให้คะแนน
thumbnail และป้องกันไม่ให้เลือกรูปอ้างอิงเดิมไปสร้างวิดีโอ

### `flow/config.js`

รวม timeout, delay, model และข้อความที่ใช้จับ control ของ Flow การเปลี่ยนค่ารุ่น
โมเดลหรือปรับจังหวะ workflow ควรเริ่มแก้จากไฟล์นี้

### `flow/automation.js`

เป็น orchestration layer และ composition root ของ content script รวมขั้นตอนสร้าง
โปรเจกต์ ตั้งค่า Image อัปโหลดรูป ใส่ prompt รอผล และสร้าง Video

## Side Panel

- `index.html` เก็บ semantic markup และ ID ที่ `app.js` ใช้
- `styles.css` เก็บ design tokens และ responsive UI
- `app.js` ตรวจ input สร้าง job และแสดง progress จาก content script

ห้ามใส่ selector ของหน้า Flow ไว้ใน Side Panel เพราะทั้งสองส่วนทำงานคนละหน้า

## แนวทางต่อยอด

1. Selector ใหม่ควรอยู่ใน `content/flow` หรือแยก `selectors.js` เมื่อมีจำนวนมาก
2. DOM primitive ใหม่ที่ไม่ผูกกับ Flow ให้อยู่ใน `content/core/dom.js`
3. เพิ่ม stage ใหม่ใน `content/core/runtime.js` ก่อนใช้ใน automation
4. Workflow ใหม่ควรแยกไฟล์ เช่น `flow/image-workflow.js` และ
   `flow/video-workflow.js` แล้วให้ `automation.js` เป็นผู้เรียก
5. ทุก action ควรตรวจผลหลังคลิกและคืนค่าที่สื่อความหมาย แทนการคืน `true` อย่างเดียว
6. แก้ลำดับ content scripts ใน `manifest.json` เมื่อเพิ่ม dependency ใหม่

## ขอบเขตข้อมูล

Side Panel เก็บ job ชั่วคราวใน `chrome.storage.local` ส่วน service worker เก็บการ
จับคู่ job กับ tab ใน `chrome.storage.session` และลบข้อมูลเมื่อจบ ยกเลิก หรือหมดอายุ
