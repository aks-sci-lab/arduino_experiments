// 시험 도우미: 변인 카드('골라야 다음', js/report-ai.js)에서 바꿀 것·예상 방향을 첫 칸으로 골라 둠 → 그 뒤 단계로 갈 수 있음
// 이미 고른 것은 그대로. 카드가 없는 화면(폰 측정·발표용·변인 카드 없는 실험)이면 false
module.exports = async function pickVars(page) {
    const ok = await page.evaluate(() => {
        const box = [...document.querySelectorAll('.rai-inline.rai-vc')].find(b => !b.hidden);
        if (!box || !window.LabUI || !LabUI.steps || !LabUI.steps()) return false;
        LabUI.steps().show(box.closest('.step-panel').dataset.step);
        return true;
    });
    if (!ok) return false;
    const box = page.locator('.rai-inline.rai-vc:not([hidden])').first();
    if (!(await box.locator('input[data-vc="change"]:checked').count())) await box.locator('input[data-vc="change"]').first().check();
    if (!(await box.locator('input[data-vc="predict"]:checked').count())) await box.locator('input[data-vc="predict"]').first().check();
    return true;
};
