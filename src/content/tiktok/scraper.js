(() => {
    let cancelScraping = false; // ตัวแปรคอยเช็คสถานะยกเลิก

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

    function findNextButton() {
        const nextBtn = document.querySelector('.tiktok-pagination-item-right-arrow');
        if (nextBtn) {
            const isDisabled = nextBtn.className.includes('disabled') || nextBtn.getAttribute('aria-disabled') === 'true';
            if (!isDisabled) {
                return nextBtn;
            }
        }
        return null;
    }

    async function scrapeAllPages(maxPagesLimit) {
        const seenIds = new Set();
        let hasNextPage = true;
        let pageCount = 1;

        console.log(`[TikTok Scraper] เริ่มดึงข้อมูล ตั้งเป้าไว้ที่ ${maxPagesLimit} หน้า...`);

        // ลูปจะหยุดเมื่อ: ไม่มีปุ่มถัดไป OR ครบจำนวนหน้า OR ผู้ใช้กดยกเลิก (cancelScraping == true)
        while (hasNextPage && pageCount <= maxPagesLimit && !cancelScraping) {
            console.log(`[TikTok Scraper] กำลังสแกนหน้า ${pageCount}`);

            const currentProducts = extractProductsFromCurrentPage();
            const newProducts = [];

            currentProducts.forEach(product => {
                if (!seenIds.has(product.id)) {
                    seenIds.add(product.id);
                    newProducts.push(product);
                }
            });

            if (newProducts.length > 0) {
                chrome.runtime.sendMessage({
                    type: "TIKTOK_SCRAPE_CHUNK",
                    data: newProducts,
                    page: pageCount,
                    total: seenIds.size
                });
            }

            // ถ้าโดนสั่งยกเลิกระหว่างทาง ให้หักดิบออกจากลูปทันที
            if (cancelScraping) break;

            const nextBtn = findNextButton();

            // ถ้าเจอปุ่มถัดไป และยังไม่ถึงหน้าที่ผู้ใช้กำหนด
            if (nextBtn && pageCount < maxPagesLimit) {
                console.log(`[TikTok Scraper] เจอปุ่มถัดไป กำลังกดเปลี่ยนหน้า...`);
                nextBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
                nextBtn.click();
                pageCount++;
                await delay(2000);
            } else {
                console.log(`[TikTok Scraper] จบการดึงที่หน้า ${pageCount}`);
                hasNextPage = false;
            }
        }

        console.log(`[TikTok Scraper] ทำงานเสร็จสิ้น (กดยกเลิก: ${cancelScraping}) ได้สินค้า ${seenIds.size} รายการ`);
        return !cancelScraping; // ส่งกลับไปบอกว่า "เสร็จปกติ" (true) หรือ "โดนยกเลิก" (false)
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // คำสั่งเริ่มดึงข้อมูล
        if (message?.type === "START_PAGINATION_SCRAPE") {
            cancelScraping = false; // รีเซ็ตสถานะยกเลิกทุกครั้งที่เริ่มใหม่
            const maxPages = message.maxPages || 5;

            scrapeAllPages(maxPages).then((completedNormally) => {
                if (completedNormally) {
                    sendResponse({ status: "done" });
                } else {
                    sendResponse({ status: "cancelled" });
                }
            }).catch(error => {
                console.error("[TikTok Scraper] Error:", error);
                sendResponse({ status: "error", error: String(error) });
            });
            return true;
        }

        // คำสั่งยกเลิก
        if (message?.type === "CANCEL_PAGINATION_SCRAPE") {
            cancelScraping = true;
            sendResponse({ status: "cancelling" });
            return true;
        }
    });
})();