(() => {
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function extractProductsFromCurrentPage() {
        const products = [];
        const rows = document.querySelectorAll('tr, .product-table-row, .product-tb-row');

        rows.forEach(row => {
            const text = row.textContent || "";
            const idMatch = text.match(/\b\d{17,20}\b/);

            if (idMatch) {
                const id = idMatch[0];
                const imgEl = row.querySelector('img');
                const imgUrl = imgEl ? imgEl.src : "";

                let name = "ไม่พบชื่อสินค้า";
                if (imgEl) {
                    const cell = imgEl.closest('td, th, [role="cell"], div') || imgEl.parentElement;
                    if (cell) {
                        name = cell.textContent.trim().replace(/\s+/g, ' ');
                    }
                }
                products.push({ id, name, imgUrl });
            }
        });

        return products;
    }

    // หาปุ่ม "ถัดไป" จากคลาสในรูปที่คุณส่งมา
    function findNextButton() {
        const nextBtn = document.querySelector('.tiktok-pagination-item-right-arrow');

        if (nextBtn) {
            // ตรวจสอบว่าปุ่มกดได้อยู่หรือไม่ (เมื่อถึงหน้าสุดท้าย TikTok มักจะใส่คลาส disabled เข้ามา)
            const isDisabled = nextBtn.className.includes('disabled') || nextBtn.getAttribute('aria-disabled') === 'true';
            if (!isDisabled) {
                return nextBtn;
            }
        }
        return null;
    }

    async function scrapeAllPages() {
        const seenIds = new Set();
        let hasNextPage = true;
        let pageCount = 1;
        const maxPages = 100;

        console.log("[TikTok Scraper] เริ่มการดึงข้อมูลแบบต่อเนื่อง...");

        while (hasNextPage && pageCount <= maxPages) {
            console.log(`[TikTok Scraper] กำลังสแกนหน้า ${pageCount}`);

            const currentProducts = extractProductsFromCurrentPage();
            const newProducts = [];

            // กรองเฉพาะ ID ที่ยังไม่เคยดึง
            currentProducts.forEach(product => {
                if (!seenIds.has(product.id)) {
                    seenIds.add(product.id);
                    newProducts.push(product);
                }
            });

            // ถ้าเจอสินค้าใหม่ ให้ส่งกลับไปแสดงผลที่ Side Panel ทันที
            if (newProducts.length > 0) {
                chrome.runtime.sendMessage({
                    type: "TIKTOK_SCRAPE_CHUNK",
                    data: newProducts,
                    page: pageCount,
                    total: seenIds.size
                });
            }

            // หาปุ่มและกดเปลี่ยนหน้า
            const nextBtn = findNextButton();

            if (nextBtn) {
                console.log(`[TikTok Scraper] เจอปุ่มถัดไป กำลังกดเปลี่ยนหน้า...`);
                nextBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
                nextBtn.click();
                pageCount++;
                // รอให้ตารางโหลดข้อมูลใหม่ (เพิ่มเป็น 2 วินาทีเพื่อให้ชัวร์ว่าเน็ตโหลดทัน)
                await delay(2000);
            } else {
                console.log(`[TikTok Scraper] ไม่เจอปุ่มถัดไป หรือมาถึงหน้าสุดท้ายแล้ว`);
                hasNextPage = false;
            }
        }

        console.log(`[TikTok Scraper] ดึงข้อมูลเสร็จสิ้นทั้งหมด ${seenIds.size} รายการ`);
        return true; // ส่งกลับไปบอกว่ากวาดจบแล้ว
    }

    // รับคำสั่งให้เริ่มดึง
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type === "START_PAGINATION_SCRAPE") {
            scrapeAllPages().then(() => {
                sendResponse({ status: "done" });
            }).catch(error => {
                console.error("[TikTok Scraper] Error:", error);
                sendResponse({ status: "error", error: String(error) });
            });
            return true;
        }
    });
})();