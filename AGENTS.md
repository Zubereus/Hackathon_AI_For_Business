# AGENTS.md — Quy tắc bắt buộc cho mọi Coding Agent (Antigravity, Copilot, CLI)

Dự án: **What-If AI** — Nền tảng mô phỏng & tối ưu hóa quyết định giá bán lẻ bằng kinh tế lượng xác định và Monte Carlo.
Luồng sản phẩm E2E thống nhất: **Nạp CSV / Chọn dữ liệu mẫu → Ánh xạ cột (nếu cần) → Ngữ cảnh kinh doanh & Độ co giãn → Mô phỏng What-If (Đơn bước & Lộ trình đa pha) + Lời khuyên hành động → Tối ưu ngược (Reverse What-If) → Kiểm chứng mô hình**.

---

## 1. Quy tắc tối thượng: Non-LLM Calculation & Chống Hallucination

Vi phạm bất kỳ điều nào sau đây được xem là lỗi nghiêm trọng:

1. **Zero LLM Math (Tuyệt đối không để LLM tính toán)**:
   - LLM **CHỈ** được phép: (a) chuyển câu hỏi ngôn ngữ tự nhiên sang JSON chuẩn `DecisionSpec`, (b) hỗ trợ chấm điểm tên cột mơ hồ khi deterministic score chưa đủ rõ, và (c) diễn đạt lời khuyên từ các con số **đã được engine tính sẵn**.
   - Toàn bộ phép toán (hồi quy độ co giãn, bootstrap, doanh thu, biên lợi nhuận, xác suất thắng mốc gốc, Monte Carlo, tìm nghiệm hòa vốn $e^*$, tối ưu lưới) phải chạy bằng code tất định trong `ml-py` (`pandas`, `numpy`, `scipy`, `statsmodels`) và `engine-go` (`internal/sim`, `internal/optimize`).
   - Trình duyệt (`web/`) **không tính toán nghiệp vụ**; chỉ định dạng hiển thị (`formatVND`, `formatPct`, `formatNum`) và dựng biểu đồ từ JSON engine trả về.

2. **Chống Hallucination bằng Hậu kiểm Số học & Biên cứng (Fail-Closed Guardrails)**:
   - **`nlq/parse` (`ml-py/app/llm/parse.py`)**: Mọi câu hỏi đơn pha lẫn đa pha (`"15 ngày đầu giảm 30%, 15 ngày sau mỗi ngày tăng 1%"`) đều phải vượt qua schema Pydantic (`price_change` mỗi ngày trong `[-50%, +100%]`, tổng horizon `7–90` ngày, `product_id` phải tồn tại trong catalog). Ngoài biên hoặc thiếu SKU → trả về `{"error": ..., "fallback": "manual_form"}`, tuyệt đối không tự bịa SKU hay cắt gọt số liệu im lặng.
   - **`nlq/explain` & Advisory (`ml-py/app/llm/explain.py`)**: Mọi đoạn văn giải thích và khuyến nghị do LLM sinh ra **bắt buộc** phải đi qua [`verify_explanation_numbers`](ml-py/app/llm/explain.py). Nếu xuất hiện **bất kỳ con số nào** không khớp với input (`scenario_result` + `business_context`), hủy toàn bộ câu trả lời LLM ngay lập tức và dùng văn bản/khuyến nghị sinh bằng template tất định từ code.
   - **Lời khuyên gắn với ngữ cảnh kinh doanh thật**: Khuyến nghị hành động (`action_verdict`, `situation_summary`, `recommendations[]`) phải xuất phát trực tiếp từ dữ liệu thực của SKU (`base_margin_pct`, `min_margin_pct_in_plan`, `stockout_risk`, `stock_days_cover`, `demand_trend_pct`, `prob_beat_base`, `break_even_elasticity`, `warnings`), tuyệt đối không bịa phần trăm tiết kiệm hay hứa hẹn ROI giả định.

3. **Hoạt động Offline & Graceful Fallback**:
   - Toàn bộ ứng dụng phải chạy đầy đủ khi **không có `LLM_API_KEY` hoặc mất mạng**: bộ rule parser VN/EN + Hungarian mapper + template advisor chạy hoàn toàn offline. Frontend hỗ trợ chế độ Offline Fixtures sinh trước từ binary Go thật.

---

## 2. Minh bạch Nguồn dữ liệu, Bảo mật & Độ tin cậy

- **Gắn nhãn nguồn dữ liệu mọi nơi (`DataSourceBadge`)**: Mọi màn hình/biểu đồ phải hiển thị rõ `SYNTHETIC` | `PUBLIC (M5)` | `PUBLIC (DUNNHUMBY)` | `YOUR DATA`. Không bao giờ trình bày dữ liệu giả lập hoặc dữ liệu ngoại làm số liệu thực của doanh nghiệp Việt Nam.
- **Bảo mật dữ liệu (Zero Raw Row Exposure)**:
  - File CSV người dùng tải lên chỉ giữ trong bộ nhớ phiên backend (`pd.read_csv(..., dtype=str)` để bảo toàn dấu chấm nghìn kiểu Việt Nam `104.000`), **không** lưu vào `localStorage` trình duyệt, **không** ghi log dòng dữ liệu thô.
  - LLM mapping chỉ nhận tiêu đề cột và tối đa `5` giá trị mẫu đã che chuỗi số dài (`####`). API keys chỉ đặt trong `.env` (git-ignored).
- **Trung thực khoa học (Honest Claims)**:
  - Độ co giãn là *ước lượng quan sát có kiểm soát (controlled observational estimate)*, không phải chứng minh nhân quả tuyệt đối.
  - Phải giữ nguyên cảnh báo `low_price_variation`, `not_significant`, `few_observations`, `positive_elasticity` và các ca thất bại trong `docs/VALIDATION.md` / tab Kiểm chứng.

---

## 3. Tính Tất định, Tiền tệ & Đồng bộ Hợp đồng

- **Determinism**: Mọi mô phỏng đều nhận `seed`; Go sử dụng [`splitmix64`](engine-go/internal/sim/simulate.go) độc lập theo chỉ số nên cùng request + `seed` cho ra output giống nhau từng byte ở `GOMAXPROCS=1` lẫn `8+`, khớp công thức tham chiếu Python trong sai số `< 0.5%`.
- **Tiền tệ (VND)**: Mọi giá và chi phí trong engine là số nguyên `VND`; chỉ tách dấu chấm hàng nghìn ở tầng UI (`1234567 -> "1.234.567 ₫"`). Ngoại tệ quy đổi qua `config/fx.json` kèm chú thích *"illustrative conversion"*.
- **Contracts First**: `contracts/*.schema.json` và `docs/ARCHITECTURE.md` là hợp đồng chung giữa `ml-py/app/schemas/contracts.py`, `engine-go/internal/sim/types.go`, và `web/src/types.ts`. Mọi thay đổi trường dữ liệu phải giữ tương thích ngược (ưu tiên trường optional) và cập nhật đồng bộ cả 3 nơi + test hợp đồng.

---

## 4. Quy chuẩn Code, Giao diện E2E & Song ngữ (`VI | EN`)

- **Ngôn ngữ mã nguồn**: Python 3.12+ (type hints, Google-style docstrings, `ruff`, `pytest`, Pydantic v2); Go 1.22+ (`gofmt`, `go vet`, table-driven + `-race` tests); React + TypeScript strict + Vite + Tailwind CSS + Recharts (không cài UI framework nặng hơn).
- **Thiết kế Giao diện E2E (`web/`)**:
  - Thiết kế theo tinh thần **1 workspace vận hành thống nhất (Operate mode)** — hạn chế chia cắt người dùng qua quá nhiều màn hình/bước rời rạc; cung cấp sẵn dữ liệu mẫu khởi động nhanh kèm thao tác Upload CSV / Ánh xạ cột / Chỉnh giả định ngay trong luồng chính.
  - Hỗ trợ song ngữ đầy đủ **Tiếng Việt & English (`VI | EN`)** quản lý tập trung tại `web/src/i18n.ts`; ngôn ngữ lời khuyên backend (`/api/nlq/explain`) phải đồng bộ theo ngôn ngữ giao diện hoặc ngôn ngữ câu hỏi của người dùng.
  - CSS dựa trên design tokens (`--paper`, `--surface`, `--ink`, `--accent`, `--good`, `--warn`, `--bad`), hỗ trợ cả Light/Dark mode, không phụ thuộc màu sắc đơn lẻ để truyền đạt cảnh báo.
- **Quy trình làm việc của Agent**:
  1. Đọc `AGENTS.md` và `docs/ARCHITECTURE.md` trước khi sửa code.
  2. Nêu ngắn gọn kế hoạch file sẽ sửa và bộ test sẽ chạy trước khi cài đặt lớn.
  3. Không thêm dependency mới khi chưa thật sự cần thiết và ghi rõ lý do.
  4. Sau lần chỉnh sửa cuối cùng, **bắt buộc chạy lại** toàn bộ kiểm thử liên quan (`pytest`, `go vet && go test -race`, `npm run build && npm test`, `e2e/demo_path.py`, `e2e/cross_check_py_go.py`) và chỉ báo cáo kết quả thực tế đã quan sát.

---

## 5. Cấu trúc & Lệnh chuẩn (Windows PowerShell / Make)

- `ml-py/`: FastAPI ML (`uvicorn app.main:app --host 127.0.0.1 --port 8000`, `python -m pytest -q`)
- `engine-go/`: Go Monte Carlo, Reverse Optimizer & Reverse Proxy (`go run ./cmd/engine`, `go test -race ./...`)
- `web/`: React + TS App (`npm run dev`, `npm run build`, `npm test`)
- `e2e/`: Live 3-tier verification (`python -u e2e/demo_path.py`, `python e2e/cross_check_py_go.py`)
- `contracts/`, `docs/`, `data/synthetic/`, `slides/`
