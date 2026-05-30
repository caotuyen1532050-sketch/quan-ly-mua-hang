-- =============================================
-- SETUP DATABASE: Web Yêu Cầu Mua Hàng
-- Chạy file này trong Supabase SQL Editor
-- =============================================

-- Tạo bảng purchase_requests
CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ma_yc TEXT NOT NULL,
  ngay_yc DATE DEFAULT CURRENT_DATE,
  phong_ban TEXT,
  nguoi_yc TEXT,
  ten_hang TEXT NOT NULL,
  don_vi TEXT DEFAULT 'Cái',
  so_luong NUMERIC DEFAULT 1,
  don_gia NUMERIC DEFAULT 0,
  thanh_tien NUMERIC GENERATED ALWAYS AS (so_luong * don_gia) STORED,
  muc_dich TEXT,
  uu_tien TEXT DEFAULT 'Trung bình',
  trang_thai TEXT DEFAULT 'Chờ duyệt',
  ghi_chu TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tạo trigger tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_purchase_requests_updated_at ON purchase_requests;
CREATE TRIGGER update_purchase_requests_updated_at
  BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Bật Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE purchase_requests;

-- Cấu hình Row Level Security (cho phép public access)
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON purchase_requests;
CREATE POLICY "Allow all" ON purchase_requests
  FOR ALL USING (true) WITH CHECK (true);

-- Dữ liệu mẫu
INSERT INTO purchase_requests (ma_yc, ngay_yc, phong_ban, nguoi_yc, ten_hang, don_vi, so_luong, don_gia, muc_dich, uu_tien, trang_thai, ghi_chu)
VALUES
  ('YC-001', '2026-05-01', 'Kỹ thuật', 'Nguyễn Văn A', 'Máy khoan điện Bosch', 'Cái', 2, 1500000, 'Phục vụ thi công công trình A', 'Cao', 'Đã duyệt', 'Ưu tiên mua ngay'),
  ('YC-002', '2026-05-05', 'Hành chính', 'Trần Thị B', 'Mực in Canon 325', 'Hộp', 5, 180000, 'In tài liệu văn phòng', 'Trung bình', 'Đã mua', ''),
  ('YC-003', '2026-05-10', 'Kho vận', 'Lê Văn C', 'Xe đẩy hàng 200kg', 'Cái', 1, 2200000, 'Vận chuyển hàng trong kho', 'Cao', 'Đang mua', 'Đang liên hệ nhà cung cấp'),
  ('YC-004', '2026-05-15', 'Kỹ thuật', 'Phạm Thị D', 'Dây điện 1.5mm cuộn 100m', 'Cuộn', 3, 350000, 'Đi dây điện công trình B', 'Trung bình', 'Chờ duyệt', ''),
  ('YC-005', '2026-05-20', 'Hành chính', 'Hoàng Văn E', 'Giấy A4 Double A', 'Ream', 10, 95000, 'Dùng cho văn phòng tháng 6', 'Thấp', 'Chờ duyệt', ''),
  ('YC-006', '2026-05-22', 'Kỹ thuật', 'Vũ Thị F', 'Máy hàn điện 200A', 'Cái', 1, 3800000, 'Thay thế máy hàn cũ bị hỏng', 'Cao', 'Từ chối', 'Chờ phê duyệt ngân sách'),
  ('YC-007', '2026-05-25', 'Kho vận', 'Đặng Văn G', 'Pallet gỗ 1200x800', 'Cái', 20, 120000, 'Lưu trữ hàng hóa kho mới', 'Trung bình', 'Chờ duyệt', ''),
  ('YC-008', '2026-05-27', 'Hành chính', 'Ngô Thị H', 'Bàn ghế văn phòng', 'Bộ', 2, 4500000, 'Trang bị phòng họp mới', 'Thấp', 'Đã duyệt', 'Chọn mẫu xong rồi');
