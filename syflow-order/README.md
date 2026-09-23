# SyFlow Order | 한국어 / English

Browser-only compound procurement demo for GitHub Pages. Open `index.html` from a web server. No Python, API keys, external JavaScript libraries, or server processing are required. CSV inputs stay in the browser.

## 한국어

1. 샘플로 결과를 확인하고 오른쪽 위에서 언어를 선택합니다.
2. CSV 양식을 내려받아 실제 견적을 입력합니다. 모든 금액은 KRW입니다.
3. 순도, 수량, 납기 및 최대 구매 채널 수를 설정한 뒤 최적화합니다.
4. 구매 목록을 CSV로 내려받습니다. 같은 채널·출고 그룹의 고정비는 한 번만 합산하세요.

화학 구조, 입체화학, 염/용매화물은 담당자가 검토해야 합니다. `exact_confirmed` 견적만 선택됩니다. 샘플의 12개 후보와 절감액은 가상입니다. 실제 71개 품목 주문의 절감액을 의미하지 않습니다.

## English

Download the quote template, enter vendor offers in KRW, upload it, set purchase constraints and optimize. Fixed channel fees and supplier-group fees are each paid once per selected channel or group. The exported rows repeat these fee fields for traceability; do not sum them per row.

Structure, stereochemistry, salt and solvate matching require manual review. Only `exact_confirmed` rows are eligible. All 12 sample candidates, offers and savings are fictional. The contextual 71 items, nine suppliers and approximate logistics estimate came from the source inquiry; this app does not estimate savings for that real order.

The static version uses branch-and-bound over supplier groups, in a Web Worker. It stops after 10 seconds or 250,000 nodes. An exhaustive result is marked optimal. A time-limited result is clearly marked as feasible without proof of optimality, or as a search limit if no feasible result was found. The browser MVP allows up to 10,000 rows, 2,000 candidates and 100 supplier groups; large instances can hit the search limit.

Tax, currency conversion, quantity discounts, minimum orders, automatic chemical verification and live vendor inventory are not included. Tests: `node test-optimizer.js`. The test suite compares 50 small generated problems against exhaustive assignment enumeration, plus the Python demo's known sample result.
