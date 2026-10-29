# 🚗 Sổ Xe

Ứng dụng web (không cần cài đặt, không cần máy chủ) giúp quản lý xe máy / ô tô: chi phí, bảo dưỡng, đăng kiểm, dẫn đường và cảnh báo khi lái xe. Giao diện tiếng Việt, dùng tốt trên điện thoại.

Dữ liệu lưu ngay trong trình duyệt của bạn (localStorage). Có sao lưu `.json`, xuất `.csv` và đồng bộ Google Drive (tùy chọn).

## Tính năng

| Tab | Nội dung |
|---|---|
| **Tổng quan** | Chi phí xăng, bảo dưỡng, sửa chữa, phí; thống kê, biểu đồ 6 tháng, tiêu hao nhiên liệu thực tế |
| **Bảo dưỡng** | Lịch theo dõi từng hạng mục (nhớt, lọc, bugi, phanh, lốp…) theo km và theo thời gian; cảnh báo *quá hạn / sắp đến hạn*; lịch sử phiếu |
| **Nhập phiếu** | Chọn ảnh phiếu hoặc quét bằng camera, app tự đọc ngày, số km, biển số, các hạng mục và số tiền (OCR tiếng Việt, chạy trên máy); luôn có bước kiểm tra lại trước khi lưu |
| **Thêm xe bằng giấy đăng ký** | Chụp / chọn ảnh giấy đăng ký (cà vẹt), app tự điền biển số, số khung, số máy, nhãn hiệu, số loại, màu sơn, năm sản xuất, dung tích, số chỗ, chủ xe, ngày đăng ký lần đầu; có thể lưu kèm ảnh |
| **Đăng kiểm** | Chụp / chọn ảnh giấy chứng nhận hoặc tem kiểm định, app đọc ngày kiểm định, hạn, số seri, trung tâm, phí; lưu lịch sử, tự cập nhật hạn cảnh báo, tùy chọn ghi phí vào chi phí xe |
| **Báo cáo** | Báo cáo chi phí theo tháng và theo năm: so với kỳ trước, theo loại, theo hạng mục, theo xe, bảng 12 tháng; xuất `.csv`, in / lưu PDF |
| **Cảnh báo** | Hạng mục cần thay hoặc kiểm tra, **đăng kiểm**, **bảo hiểm TNDS** (cảnh báo trước 30 ngày) |
| **Bản đồ** | Tìm địa điểm, dẫn đường từng bước bằng giọng nói tiếng Việt, **cây xăng gần nhất**, quán ăn / cà phê quanh đây, **điểm yêu thích theo khu vực** |
| **Lái xe** | Tốc độ hiện tại, giới hạn tốc độ, cảnh báo vượt tốc độ, cảnh báo gần **camera giám sát**, cảnh báo **lệch làn** (thử nghiệm), giọng nói |
| **Xe & dữ liệu** | Quản lý xe, hạn đăng kiểm / bảo hiểm, sao lưu, Google Drive, tra cứu phạt nguội (mở csgt.vn) |

## Chạy thử

Chỉ cần mở `index.html`. Để dùng **camera, GPS, giọng nói** thì phải mở qua **https**, ví dụ bằng GitHub Pages:

1. Vào **Settings → Pages** của repo.
2. Chọn *Deploy from a branch* → nhánh `main` → thư mục `/ (root)` → Save.
3. Mở địa chỉ `https://<tên-tài-khoản>.github.io/<tên-repo>/` bằng điện thoại.

## Dịch vụ bên ngoài được dùng

| Việc | Dịch vụ | Ghi chú |
|---|---|---|
| Bản đồ | OpenStreetMap + Leaflet | |
| Tìm địa chỉ, tên khu vực | Nominatim (OSM) | chỉ gọi khi bạn bấm tìm hoặc lưu điểm |
| Tìm đường | OSRM (máy chủ demo công cộng) | không đảm bảo ổn định; nếu cần dùng lâu dài nên tự dựng máy chủ |
| Cây xăng, quán ăn, giới hạn tốc độ, camera | Overpass API (OSM) | dữ liệu do cộng đồng đóng góp |
| Đọc chữ trên phiếu | Tesseract.js (tải về, chạy trên máy) | lần đầu tải dữ liệu tiếng Việt khoảng vài MB |
| Đồng bộ Drive (tùy chọn) | Google Identity Services | cần Client ID riêng, chỉ dùng thư mục dữ liệu riêng của app |

Ảnh phiếu và video lệch làn **không** bị gửi đi đâu.

## Giới hạn cần biết

- **OCR không hoàn hảo** (kể cả giấy đăng ký, giấy đăng kiểm): đặc biệt dễ nhầm số khung / số máy (0 với O, 1 với I). Luôn đối chiếu với giấy thật trước khi lưu. Chữ in mờ, chữ viết tay, phiếu nhăn có thể đọc sai. Luôn kiểm tra lại các dòng trước khi lưu.
- **Camera giám sát / phạt nguội**: dữ liệu camera lấy từ OpenStreetMap và các điểm bạn tự báo nên *không đầy đủ*. App không tra được phạt nguội thay bạn; hãy dùng csgt.vn.
- **Giới hạn tốc độ**: lấy từ nhãn `maxspeed` trên OSM, nhiều đường chưa có, khi đó dùng mức bạn đặt tay. Hãy luôn theo biển báo thực tế.
- **Lệch làn** là tính năng thử nghiệm dựa trên phân tích ảnh đơn giản: cần gắn điện thoại cố định nhìn thẳng về phía trước, vạch kẻ rõ. Có thể báo nhầm hoặc bỏ sót, và không nhận biết xi-nhan.
- **Mốc bảo dưỡng mặc định** chỉ mang tính tham khảo chung; hãy chỉnh theo sổ bảo dưỡng của hãng xe (nút "Chỉnh chu kỳ").
- Không thao tác điện thoại khi đang lái xe.
- Thông báo nhắc việc chỉ hiện khi bạn mở app (không chạy nền).

## Cấu trúc

```
index.html        giao diện
css/style.css
js/logic.js       logic thuần: chu kỳ bảo dưỡng, cảnh báo, đọc phiếu OCR, báo cáo, hình học
js/app.js         dữ liệu, tổng quan, bảo dưỡng, báo cáo, sao lưu
js/scan.js        quét phiếu bằng ảnh / camera
js/geo.js         GPS, giọng nói, Overpass
js/map.js         bản đồ, tìm đường, điểm yêu thích
js/drive.js       tốc độ, camera giám sát, lệch làn
js/gdrive.js      đồng bộ Google Drive
```

## Dữ liệu từ bản cũ

App tự đọc dữ liệu của bản Sổ Xe trước (`soxe.v1` / `soxe.v2`) khi mở lần đầu trên cùng trình duyệt và tên miền.
