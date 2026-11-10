# TÓM TẮT TOÀN BỘ DỰ ÁN: WHAT-IF AI

> **Khẩu hiệu**: *"Simulate before you decide — Know before you act."* ("Mô phỏng trước khi quyết định — Hiểu rõ trước khi hành động.")  
> **Bối cảnh**: Hackathon **AI for Business Innovation 2026** (Đội 2 thành viên · Hạn nộp slide PDF: 23:59 ngày 13/11/2026 · Chung kết Pitch: 19/11/2026).  
> **Trạng thái hiện tại**: **Demo Freeze Ready (`Phase 0 – Phase 7` hoàn tất & kiểm thử thông suốt; `Phase 8` hoàn tất bản nháp slide, Q&A, storyboard video & 6 ảnh chụp giao diện)**.

---

## 1. Mục tiêu & Bài toán Doanh nghiệp

Các doanh nghiệp bán lẻ vừa và nhỏ (SME) thường xuyên đối mặt với các quyết định giá và khuyến mãi mang tính đánh đổi trực tiếp vào biên lợi nhuận:
1. **Dữ liệu phân tán & lộn xộn**: File POS/Excel có nhiều cách đặt tên cột khác nhau (tiếng Việt có dấu/không dấu, viết tắt ERP), định dạng số Việt Nam (`104.000`), đơn vị nghìn đồng hoặc dữ liệu cấp từng hóa đơn.
2. **Công cụ hiện tại chỉ nhìn lại quá khứ**: Bảng tính Excel và dashboard BI chỉ thống kê doanh số đã qua, không ước lượng được kịch bản phản thực (*nếu tăng giá +10% thì lợi nhuận kỳ vọng và rủi ro xấu nhất ra sao?*).
3. **Chatbot AI thông thường dễ bịa số (*hallucination*)**: Tự tính toán nhẩm thiếu cơ sở kinh tế lượng và làm rò rỉ dữ liệu kinh doanh thô ra bên ngoài.

**What-If AI** giải quyết khoảng trống này bằng nền tảng mô phỏng định lượng: nhận CSV bán hàng thô → chuẩn hóa & ánh xạ cột → ước lượng phân phối độ co giãn giá kèm khoảng tin cậy → chạy mô phỏng xác suất **Monte Carlo** (`base`, `optimistic`, `expected`, `pessimistic`, `p5–p50–p95`, độ co giãn hòa vốn $\varepsilon^*$) → tìm mức giá tối ưu ngược (**Reverse What-If**) dưới các ràng buộc về biên lợi nhuận, ngân sách và tồn kho.

---

## 2. Năm Nguyên tắc Bất biến (Golden Rules)

1. **Zero LLM Math (Tách biệt Ngôn ngữ & Toán học)**: LLM *không bao giờ* làm toán. Mọi con số tài chính và xác suất đều do Python (`pandas`, `numpy`, `scipy`, `statsmodels`) và Go (`math`, `sync`) tính tất định. LLM chỉ dùng để chuyển câu hỏi ngôn ngữ tự nhiên sang JSON chuẩn [`DecisionSpec`](../contracts/decision_spec.schema.json) và diễn giải kết quả — mọi con số trong câu trả lời đều bị hàm [`verify_explanation_numbers`](../ml-py/app/llm/explain.py) hậu kiểm bằng regex; nếu phát hiện số lạ, hệ thống tự động thay thế bằng template do code sinh.
2. **Bảo mật Dữ liệu Nghiêm ngặt**: Dữ liệu CSV upload chỉ nằm trong bộ nhớ phiên phía backend, không lưu vào `localStorage` trình duyệt và không gửi dữ liệu giao dịch thô lên LLM (bộ ánh xạ cột tối đa chỉ inspection header và tối đa 5 mẫu đã che chữ số dài thành `#`).
3. **Tái lập Tất định (Determinism)**: Cùng đầu vào + `seed`, engine Go trả về JSON giống nhau từng byte trên `GOMAXPROCS=1` lẫn `GOMAXPROCS=8+` nhờ hàm băm chỉ số [`splitmix64`](../engine-go/internal/sim/simulate.go).
4. **Minh bạch Nguồn Dữ liệu (`DataSourceBadge`)**: Mọi màn hình và bảng biểu đều gắn nhãn rõ ràng `SYNTHETIC` | `PUBLIC (M5/DUNNHUMBY)` | `YOUR DATA`. Tiền tệ trong engine luôn là số nguyên `VND`; dữ liệu USD ngoại tệ (M5/Dunnhumby) quy đổi minh họa theo [`config/fx.json`](../config/fx.json) (`25.000 ₫/$`) kèm chú thích.
5. **Trung thực Khoa học (Honest Claims)**: Mọi nơi đều công bố đây là **ước lượng quan sát có kiểm soát (*controlled observational estimate*)**, không phải chứng minh nhân quả tuyệt đối; mọi cảnh báo tin cậy và ca backtest thất bại đều được hiển thị công khai.

---

## 3. Kiến trúc Hệ thống 3 Tầng

Mọi giao tiếp giữa 3 service tuân theo hợp đồng schema đóng băng trong [`contracts/`](../contracts/) và [`docs/ARCHITECTURE.md`](ARCHITECTURE.md):

```
React UI (:5173, web/)
   │  HTTP (JSON, định dạng VND ở edge, zero browser math)
   ▼
Go Engine & Gateway (:8080, engine-go/)
   ├── /api/simulate, /api/optimize   ──► Chạy song song Monte Carlo & Grid Search bằng Go thuần
   └── /api/ingest/*, /elasticity/*, /backtest, /nlq/* ──► Reverse Proxy (strip upstream CORS)
                                                                 │
                                                                 ▼
                                                      Python ML Service (:8000, ml-py/)
```

* **`ml-py/` (Python + FastAPI `:8000`)**:
  * **Ingestion & Mapping (`app/ingest/`, `app/mapping/`)**: Đọc CSV nguyên gốc (`dtype=str` để không hỏng số dấu chấm kiểu Việt Nam), nhận diện định dạng ngày/số, tự động gộp dòng cấp hóa đơn về cấp ngày (`daily grain`), hỗ trợ thiếu `unit_cost` (nhập giả định `margin_pct`), ánh xạ cột tối ưu toàn cục bằng thuật toán Hungarian (`resolve_column_mappings`) và ghi nhớ mapping theo hash header.
  * **Econometrics & Backtest (`app/features/`, `app/elasticity/`, `app/backtest/`)**: Mô hình **Spec-C Poisson log-link GLM** với sai số chuẩn vững HC1 + **week-block bootstrap** ($\ge 300$ lượt), kiểm soát biến giả lịch Tết, siêu sale ngày đôi (`9.9`–`12.12`), kỳ lương (`payday`), cuối tuần, mùa vụ sin/cos, xu hướng và loại bỏ ngày hết hàng (`stock == 0`). Tự động phát tín hiệu cảnh báo `low_price_variation` (`sd(ln P) < 0.03`), `not_significant`, `few_observations`, `positive_elasticity`. Backtest tách chặt thời gian (`date < change_date`) trước khi dự báo holdout 14 ngày.
  * **NLQ Guardrails (`app/llm/`)**: Bộ parse câu hỏi tiếng Việt/Anh offline + optional LLM (`LLM_PROVIDER`, `LLM_API_KEY`), giới hạn thay đổi giá `[-50%, +100%]` và khung `7–90` ngày; câu hỏi sai SKU hoặc ngoài ngưỡng bị chặn về form nhập tay.
* **`engine-go/` (Go `:8080`)**:
  * **Simulator (`internal/sim/simulate.go`)**: Vẽ kịch bản `base`, `optimistic` (phân vị 10% độ nhạy $|e|$), `expected` (trung vị), `pessimistic` (phân vị 90% độ nhạy $|e|$), histogram 20 bin, `p5/p50/p95` và độ co giãn hòa vốn $e^*$. Trả `HTTP 422` khi đầu vào vi phạm biên, không bao giờ sinh `NaN`/`Inf`.
  * **Reverse Optimizer (`internal/optimize/grid.go`)**: Quét lưới điều chỉnh giá mặc định `[-30%, +30%]` theo bước `1%` cho 2 mục tiêu (`max_expected_profit`, `hit_target`) kèm ràng buộc `min_margin_pct`, `budget_vnd`, và `respect_stock`.
  * **Gateway (`cmd/engine/main.go`)**: Reverse proxy sang `ml-py` và strip header `Access-Control-*` từ upstream để trình duyệt chỉ nhận đúng một header `Access-Control-Allow-Origin`.
* **`web/` (React + TypeScript strict + Vite + Tailwind + Recharts `:5173`)**:
  * 6 màn hình theo đúng quy trình: `1. Upload Data` → `2. Confirm Columns` → `3. Assumptions` → `4. What-If Simulation` → `5. Reverse What-If` → `6. Validation`.
  * Mặc định gọi live Go Gateway (`:8080`), hỗ trợ chuyển tức thì sang **Offline Fixtures** (`VITE_USE_FIXTURES=1`, `?demo=1`, hoặc checkbox ngay trên UI) bằng ảnh chụp số liệu tính trước từ Go (`web/src/fixtures/precomputed_fixtures.json`).

---

## 4. Tổng hợp Kết quả Kiểm thử & Đo đạc Thực tế

Toàn bộ các con số sau đây đều là kết quả chạy thực tế đã được lưu log trong [docs/VALIDATION.md](VALIDATION.md), [docs/ENGINE.md](ENGINE.md) và thư mục [phases/](../phases/):

| Hạng mục | Phương pháp & Dữ liệu kiểm thử | Kết quả đo thực tế |
|---|---|---|
| **NLP Column Mapping** | 5 biến thể CSV lộn xộn trong `data/synthetic/out/messy_variants/` | **33 / 33 (100%)** chính xác offline, **0** trường hợp đoán sai tự tin cao (`>= 0.55`) |
| **Synthetic Ground-Truth Recovery (Spec-C)** | `starter_4_products`, `fashion_shop_12`, `grocery_fmcg_15`, `electronics_home_10`, `marketplace_large_40` | MAE **`0.048 – 0.118`** (`<= 0.15`), 90% CI Coverage **`80.0% – 100.0%`**, Spearman `r` đạt **`0.791 – 1.000`** |
| **Stress Test Biên & Nhiễu** | `hard_low_price_variation_8` (`sd=0.013`) & `hard_event_confounded_12` (`11.11` / `12.12`) | **8 / 8 (100%)** SKU tự động cảnh báo `low_price_variation`; giảm lệch nhiễu `11.11` từ `-5.9` (naive) về `-1.8` (giá trị thật `-1.5`) |
| **Out-of-Time Historical Backtest** | 19 sự kiện thay đổi giá (`\|ΔP\| >= 5%`, ngoài vùng Tết), train `< change_date`, đánh giá 14 ngày holdout | **18 / 19 (94.7%)** thắng naive baseline, coverage trung bình **88.7%** *(1 ca thua minh bạch: `grocery_fmcg_15 P04` ngày `2025-11-11` WAPE `0.206` vs naive `0.175`, coverage `100%`)* |
| **NLQ Guardrails** | 45 câu hỏi VN/EN tại `data/samples/nlq_questions.json` (offline fallback) | **30 / 30 (100%)** câu hợp lệ parse đúng, **15 / 15 (100%)** câu sai SKU / ngoài ngưỡng bị từ chối an toàn |
| **Hiệu năng Go Optimizer** | `go test -bench=BenchmarkOptimizeGrid_100x5000` (101 điểm giá × 5.000 sims) | **`38,776,681 ns/op` (`38.8 ms` / lần tối ưu)**, `~8.96 MB/op` |
| **Cross-Check Go vs Python** | Đối chiếu 3 SKU (`P01`, `P02`, `P03`) với `n_sims=10,000`, `seed=42` (`e2e/cross_check_py_go.py`) | Sai lệch P50: **`0.0219%` (`P01`), `0.0057%` (`P02`), `0.0114%` (`P03`)** (vượt xa chuẩn `< 0.5%`) |
| **End-to-End Live 3 Tầng** | Upload VN messy CSV → Map → Commit → Fit → Simulate → Optimize → NLQ (`e2e/demo_path.py`) | **PASS (0/7 CORS check + 7/7 bước)**: `P01 price=97,500 VND`, `exp_qty=2,100.8`, `opt 100.5M >= exp 99.3M >= pess 97.9M`, `e*=-2.425` |
| **Regression Test Suites** | `ml-py` (`pytest`), `engine-go` (`go vet` + `go test -race`), `web` (`tsc && vite build` + `vitest`) | Python: **20 passed, 1 skipped** (thiếu raw M5 CSV); Go: **PASS 3/3 packages**; Web: **4/4 tests PASS**, build sạch |

---

## 5. Tiến độ 9 Phase & Các Lỗi Thực tế Đã Xử lý

* **Phase 0 – Foundation (`phases/PHASE_0_foundation.md`)**: Thiết lập repo 3 tầng, đóng băng schemas và fixtures chuẩn trong `contracts/`.
* **Phase 1 – Data Layer (`phases/PHASE_1_data_layer.md`)**: Sinh dữ liệu bán lẻ Việt Nam v2 (`make_synthetic_data_v2.py`), lịch VN (`calendar_vn.py`), cùng loader cho dữ liệu công khai `PUBLIC_M5` và `PUBLIC_DUNNHUMBY` (ẩn danh hộ gia đình).
* **Phase 2 – Ingestion & NLP Mapping (`phases/PHASE_2_ingestion_mapping.md`)**: Profiler, từ điển đồng nghĩa đa ngôn ngữ, gán Hungarian và transformation về schema ngày.
* **Phase 3 – Elasticity & Backtest (`phases/PHASE_3_elasticity_backtest.md`)**: Cài đặt Spec-C GLM + Bootstrap, sinh báo cáo thực nghiệm `docs/VALIDATION.md`.
* **Phase 4 – Go Engine (`phases/PHASE_4_go_engine.md`)**: Engine Go stateless đạt benchmark `38.8 ms`, test golden + `GOMAXPROCS` determinism (`docs/ENGINE.md`).
* **Phase 5 – React UI (`phases/PHASE_5_react_frontend.md`)**: Hoàn thiện 6 màn hình giao diện, component `DataSourceBadge` và ảnh chụp màn hình 1440×1080 tại `slides/screens/`.
* **Phase 6 – LLM Layer (`phases/PHASE_6_llm_layer.md`)**: Xây `LLMClient`, `parse_question`, `explain_scenario` + bẫy post-check chống bịa số.
* **Phase 7 – Integration & QA (`phases/PHASE_7_integration.md`)**: Chuyển mặc định từ fixture sang live Go API (`:8080`), viết `e2e/demo_path.py`, `e2e/cross_check_py_go.py`, `docs/DEMO.md`, `docs/LIMITS.md`, và **sửa 7 lỗi tích hợp thực tế** phát hiện trong quá trình kiểm thử (parse unit `"VND"`/`"vi_VN"`, lỗi Pandas làm lệch 1000x số `"104.000"` khi thiếu `dtype=str`, lỗi key `"qty"` khiến explainer in `"0 units"`, lỗi `?demo=1` không bật fixture sau khi đổi mặc định live API, và lỗi Go reverse proxy nhân đôi header `Access-Control-Allow-Origin`).
* **Phase 8 – Slides & Pitch (`phases/PHASE_8_slides_pitch.md`)**: Hoàn thiện bản nháp 13 slide tối giản (`slides/DECK_OUTLINE.md`), 10 câu Q&A phản biện (`slides/QA_PREP.md`) và kịch bản video/nộp bài (`slides/NOTES.md`).

---

## 6. Giới hạn Phương pháp Luận (`docs/LIMITS.md`)

* **Không chứng minh nhân quả tuyệt đối**: Hệ số co giãn ước lượng từ biến thiên giá quan sát trong quá khứ; thử nghiệm A/B vẫn là chuẩn vàng khi triển khai thực tế.
* **Chưa mô hình hóa co giãn chéo & phản ứng đối thủ**: MVP giả định từng SKU độc lập (chưa đo cannibalization giữa hai sản phẩm thay thế hoặc chiến tranh giá từ đối thủ).
* **Đòi hỏi biến động giá tối thiểu**: SKU giữ nguyên giá lịch sử (`sd(ln P) < 0.03` kích hoạt cảnh báo `low_price_variation` khi fit model; ngưỡng lọc item M5 là `>= 0.04`) thay vì mô phỏng mù quáng; hàm cầu co giãn không đổi chỉ phù hợp vùng biến động giá hợp lý `[-50%, +100%]`.
* **Dữ liệu ngoại kiểm chứng phương pháp**: Walmart M5 / Dunnhumby chỉ dùng để kiểm thử độ ổn định kỹ thuật của pipeline, không đại diện cho thị hiếu người tiêu dùng Việt Nam.

---

## 7. Hướng dẫn Chạy nhanh & Các Bước Con người Cần Hoàn tất

### Chạy hệ thống Live (3 cửa sổ PowerShell tại thư mục gốc)
```powershell
# Terminal 1 (Python ML :8000)
cd ml-py; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2 (Go Engine & Gateway :8080)
cd engine-go; go run ./cmd/engine

# Terminal 3 (React Frontend :5173)
cd web; npm run dev
```
Truy cập `http://localhost:5173` (hoặc chế độ chạy không cần backend tại `http://localhost:5173/?demo=1` / `$env:VITE_USE_FIXTURES="1"`).

### 4 Việc nhóm (con người) cần hoàn tất trước khi nộp bài
1. **Xác nhận quy chế đội thi ngay**: Kiểm tra với Ban tổ chức (**Ms. Tiên `0908885090` / Ms. Phúc `0914327437`**) về quy định đội 3–5 người cho nhóm hiện tại 2 thành viên.
2. **Biên tập & xuất PDF bộ slide (`<= 15` trang, tiếng Anh)**: Thay `[TeamName]`, tên thành viên và chỉnh văn phong từ `slides/DECK_OUTLINE.md`, chèn ảnh `slides/screens/*.png`, xuất PDF đặt vào thư mục `AI4Biz_<TeamName>_2026`.
3. **Quay video demo `<= 2:00` & diễn tập bấm giờ `<= 13:00`**: Theo đúng kịch bản `docs/DEMO.md` và `slides/NOTES.md`.
4. **Commit & gắn tag đóng băng bản nộp**: Sau khi rà soát lần cuối, commit toàn bộ mã nguồn sạch lên git và gắn tag `git tag v0.1-submission`.
