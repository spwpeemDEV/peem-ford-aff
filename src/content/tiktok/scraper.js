(() => {
    let cancelScraping = false; // ตัวแปรคอยเช็คสถานะยกเลิก
    const MAX_SAFETY_PAGES = 100;
    const PAGE_SIGNATURE_STABLE_MS = 900;
    const PAGE_SETTLE_DELAY_MS = 1800;
    let activeScrapeId = 0;

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
            const isDisabled = nextBtn.disabled
                || nextBtn.hasAttribute('disabled')
                || String(nextBtn.className || '').includes('disabled')
                || nextBtn.getAttribute('aria-disabled') === 'true'
                || nextBtn.getAttribute('data-disabled') === 'true';
            if (!isDisabled) {
                return nextBtn;
            }
        }
        return null;
    }

    function getCurrentPageSignature() {
        const productIds = extractProductsFromCurrentPage()
            .map(product => product.id)
            .sort()
            .join(',');
        const activePage = document.querySelector(
            '[aria-current="page"], .tiktok-pagination-item-active, .tiktok-pagination-item.active',
        );
        const pageLabel = activePage?.textContent?.trim() || '';
        return `${pageLabel}|${productIds}`;
    }

    async function waitForPageChange(previousSignature, scrapeId, timeoutMs = 12000) {
        const startedAt = Date.now();
        let candidateSignature = '';
        let candidateStableSince = 0;

        while (scrapeId === activeScrapeId && !cancelScraping && Date.now() - startedAt < timeoutMs) {
            await delay(300);
            const currentSignature = getCurrentPageSignature();

            if (currentSignature === previousSignature) {
                candidateSignature = '';
                candidateStableSince = 0;
                continue;
            }

            // TikTok มักเปลี่ยนเลขหน้าก่อนที่แถวสินค้าจะ render ครบ
            // จึงรอให้ signature ของหน้าใหม่คงที่ก่อนอ่านข้อมูล
            if (currentSignature !== candidateSignature) {
                candidateSignature = currentSignature;
                candidateStableSince = Date.now();
                continue;
            }

            if (Date.now() - candidateStableSince >= PAGE_SIGNATURE_STABLE_MS) {
                await delay(PAGE_SETTLE_DELAY_MS);
                return scrapeId === activeScrapeId && !cancelScraping;
            }
        }

        return false;
    }

    async function scrapeAllPages(maxPagesLimit, scrapeEveryPage = false, scrapeId) {
        const seenIds = new Set();
        const visitedPageSignatures = new Set();
        let pagesWithoutNewProducts = 0;
        let hasNextPage = true;
        let pageCount = 1;

        console.log(
            scrapeEveryPage
                ? "[TikTok Scraper] เริ่มดึงข้อมูลทุก pagination..."
                : `[TikTok Scraper] เริ่มดึงข้อมูล ตั้งเป้าไว้ที่ ${maxPagesLimit} หน้า...`,
        );

        // ลูปจะหยุดเมื่อ: ไม่มีปุ่มถัดไป OR ครบจำนวนหน้า OR ผู้ใช้กดยกเลิก (cancelScraping == true)
        while (
            hasNextPage
            && pageCount <= (scrapeEveryPage ? MAX_SAFETY_PAGES : maxPagesLimit)
            && !cancelScraping
            && scrapeId === activeScrapeId
        ) {
            console.log(`[TikTok Scraper] กำลังสแกนหน้า ${pageCount}`);

            const pageSignature = getCurrentPageSignature();
            if (visitedPageSignatures.has(pageSignature)) {
                console.warn('[TikTok Scraper] ตรวจพบหน้าซ้ำ จึงหยุดการดึงข้อมูล');
                break;
            }
            visitedPageSignatures.add(pageSignature);

            const currentProducts = extractProductsFromCurrentPage();
            const newProducts = [];

            currentProducts.forEach(product => {
                if (!seenIds.has(product.id)) {
                    seenIds.add(product.id);
                    newProducts.push(product);
                }
            });

            // เมื่อดึงแบบทุกหน้า หาก pagination ยังเปลี่ยนแต่ไม่มีสินค้าใหม่
            // ต่อเนื่อง แปลว่าถึงท้ายรายการแล้ว (กันปุ่มถัดไปค้าง/วนหน้าเดิม)
            if (scrapeEveryPage && pageCount > 1 && currentProducts.length > 0 && newProducts.length === 0) {
                pagesWithoutNewProducts++;
                if (pagesWithoutNewProducts >= 2) {
                    console.warn('[TikTok Scraper] ไม่พบสินค้าใหม่ต่อเนื่อง จึงหยุดการดึงข้อมูล');
                    hasNextPage = false;
                }
            } else if (newProducts.length > 0) {
                pagesWithoutNewProducts = 0;
            }

            if (newProducts.length > 0) {
                chrome.runtime.sendMessage({
                    type: "TIKTOK_SCRAPE_CHUNK",
                    data: newProducts,
                    page: pageCount,
                    total: seenIds.size
                });
            }

            // ถ้าโดนสั่งยกเลิกระหว่างทาง ให้หักดิบออกจากลูปทันที
            if (cancelScraping || scrapeId !== activeScrapeId || !hasNextPage) break;

            const nextBtn = findNextButton();

            // ถ้าเจอปุ่มถัดไป และยังไม่ถึงหน้าที่ผู้ใช้กำหนด
            if (nextBtn && (scrapeEveryPage || pageCount < maxPagesLimit)) {
                console.log(`[TikTok Scraper] เจอปุ่มถัดไป กำลังกดเปลี่ยนหน้า...`);
                nextBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
                nextBtn.click();

                const pageChanged = await waitForPageChange(pageSignature, scrapeId);
                if (!pageChanged) {
                    console.warn('[TikTok Scraper] หน้าถัดไปไม่เปลี่ยนหรือหมดรายการแล้ว จึงหยุดการดึงข้อมูล');
                    hasNextPage = false;
                } else {
                    pageCount++;
                }
            } else {
                console.log(`[TikTok Scraper] จบการดึงที่หน้า ${pageCount}`);
                hasNextPage = false;
            }
        }

        console.log(`[TikTok Scraper] ทำงานเสร็จสิ้น (กดยกเลิก: ${cancelScraping}) ได้สินค้า ${seenIds.size} รายการ`);
        return !cancelScraping && scrapeId === activeScrapeId; // ส่งกลับไปบอกว่า "เสร็จปกติ" (true) หรือ "โดนยกเลิก" (false)
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // คำสั่งเริ่มดึงข้อมูล
        if (message?.type === "START_PAGINATION_SCRAPE") {
            cancelScraping = false; // รีเซ็ตสถานะยกเลิกทุกครั้งที่เริ่มใหม่
            const scrapeId = ++activeScrapeId;
            const scrapeEveryPage = Boolean(message.allPages);
            const maxPages = Number(message.maxPages) || 5;

            scrapeAllPages(maxPages, scrapeEveryPage, scrapeId).then((completedNormally) => {
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
            activeScrapeId++;
            sendResponse({ status: "cancelling" });
            return true;
        }
    });
})();
