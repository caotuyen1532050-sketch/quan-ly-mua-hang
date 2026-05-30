// =============================================
// App.js - Web Yêu Cầu Mua Hàng
// Supabase + Vanilla JS
// =============================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE = 'purchase_requests';

// ── State ──
let allData = [];
let filteredData = [];
let editingId = null;
let deleteId = null;
let barChart = null;
let doughnutChart = null;
let realtimeChannel = null;
let currentView = 'dashboard';
let activeDropdown = null;
let activeBadge = null;

// ── Status config ──
const STATUS_CONFIG = {
  'Chờ duyệt': { badge: 'badge-yellow', icon: '⏳' },
  'Đã duyệt':  { badge: 'badge-green',  icon: '✔️' },
  'Đã mua':    { badge: 'badge-green',  icon: '🛒' },
};

const PRIORITY_CONFIG = {
  'Cao':        { cls: 'priority-high',   icon: '🔺' },
  'Trung bình': { cls: 'priority-medium', icon: '🔸' },
  'Thường':     { cls: 'priority-medium', icon: '🔸' },
  'Thấp':       { cls: 'priority-low',    icon: '🔹' },
};

// ── DOM helpers ──
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('vi-VN').format(n || 0) + ' đ';
const fmtDate = d => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
const genId = () => 'YC-' + String(Math.floor(Math.random() * 9000) + 1000);

// ── Toast ──
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type} fade-in`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Navigation ──
function navigate(page) {
  currentView = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  let targetPage = page;
  if (page === 'approved') {
    targetPage = 'list';
    document.body.classList.add('view-approved');
  } else {
    document.body.classList.remove('view-approved');
  }

  const p = document.getElementById('page-' + targetPage);
  const n = document.getElementById('nav-' + page);
  if (p) p.classList.add('active');
  if (n) n.classList.add('active');
  
  const topbarTitleText = {
    dashboard: '📊 Dashboard Tổng Quan',
    list: '📋 Danh Sách Yêu Cầu Mua Hàng',
    approved: '✅ Danh Sách Hàng Đã Duyệt',
  }[page] || 'Trang chủ';

  $('topbarTitle').textContent = topbarTitleText;

  // Update section title text dynamically for printing
  const listTitleText = {
    list: '📋 Danh Sách Yêu Cầu Mua Hàng',
    approved: '✅ Danh Sách Hàng Đã Duyệt',
  }[page];
  const listTitleEl = $('listTitleText');
  if (listTitleEl && listTitleText) {
    listTitleEl.textContent = listTitleText;
  }

  if (targetPage === 'dashboard') renderDashboard();
  if (targetPage === 'list') {
    applyFilters();
  }

  // Close sidebar on mobile after navigating
  const sidebar = $('sidebar');
  if (sidebar) {
    sidebar.classList.remove('open');
  }
}

// ── Mobile Sidebar Toggle ──
function toggleSidebar(e) {
  if (e) e.stopPropagation();
  const sidebar = $('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
}

// ── Load Data from Supabase ──
async function loadData() {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allData = data || [];
    populateColumnFilters();
    filteredData = [...allData];
    applyFilters();
    renderDashboard();
    updateRealtimeDot(true);
  } catch (err) {
    console.error(err);
    toast('Lỗi kết nối Supabase: ' + err.message, 'error');
    updateRealtimeDot(false);
  }
}

function populateColumnFilters() {
  const fields = ['ngay_yc', 'nguoi_yc', 'ten_hang', 'don_vi', 'uu_tien', 'muc_dich'];
  fields.forEach(field => {
    const dropdown = document.querySelector(`.custom-filter-dropdown[data-field="${field}"]`);
    if (!dropdown) return;

    const listEl = dropdown.querySelector('.filter-options-list');
    if (!listEl) return;

    // Get current active value
    const currentActiveOption = listEl.querySelector('.filter-option.active');
    const currentVal = currentActiveOption ? currentActiveOption.getAttribute('data-value') : '';

    let uniqueVals = [];
    if (field === 'uu_tien') {
      uniqueVals = ['Cao', 'Trung bình', 'Thấp'];
    } else {
      uniqueVals = Array.from(new Set(allData.map(r => {
        if (field === 'ngay_yc') return fmtDate(r.ngay_yc);
        return r[field] || '';
      }).filter(v => v !== ''))).sort();
    }

    listEl.innerHTML = `<div class="filter-option${currentVal === '' ? ' active' : ''}" data-value="">Hủy lọc</div>` + 
      uniqueVals.map(val => `<div class="filter-option${currentVal === val ? ' active' : ''}" data-value="${val}">${val}</div>`).join('');

    // Attach click event listeners
    listEl.querySelectorAll('.filter-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        listEl.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        applyFilters();
      });
    });
  });
}

function updateRealtimeDot(online) {
  const dot = document.querySelector('.realtime-dot');
  const txt = document.querySelector('.realtime-text');
  if (dot) dot.style.background = online ? 'var(--green)' : 'var(--red)';
  if (txt) txt.textContent = online ? 'Realtime: Đang kết nối' : 'Offline';
}

// ── Realtime Subscription ──
function subscribeRealtime() {
  realtimeChannel = db.channel('purchase_requests_changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: TABLE
    }, () => {
      loadData();
      toast('🔄 Dữ liệu được cập nhật!', 'info');
    })
    .subscribe();
}

function clearAllFilters() {
  document.querySelectorAll('.custom-filter-dropdown').forEach(dropdown => {
    dropdown.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('active'));
    const defaultOpt = dropdown.querySelector('.filter-option[data-value=""]');
    if (defaultOpt) defaultOpt.classList.add('active');
  });
  applyFilters();
}

// ── Filters ──
function applyFilters() {
  const selectFilters = {};
  document.querySelectorAll('.custom-filter-dropdown').forEach(dropdown => {
    const field = dropdown.dataset.field;
    const activeOpt = dropdown.querySelector('.filter-option.active');
    const val = activeOpt ? activeOpt.getAttribute('data-value') : '';
    if (val) selectFilters[field] = val;
    
    // Toggle active visual highlight state on search icon
    const icon = dropdown.querySelector('.filter-icon');
    if (icon) {
      if (val) {
        icon.classList.add('active');
      } else {
        icon.classList.remove('active');
      }
    }
  });

  let status = '';
  if ($('nav-list')?.classList.contains('active')) {
    status = 'Chờ duyệt';
  } else if ($('nav-approved')?.classList.contains('active')) {
    status = 'Đã duyệt';
  }

  filteredData = allData.filter(r => {
    const matchStatus = !status || r.trang_thai === status;

    const matchSelectFilters = Object.keys(selectFilters).every(field => {
      let cellVal = '';
      if (field === 'ngay_yc') cellVal = fmtDate(r.ngay_yc);
      else cellVal = String(r[field] || '');
      return cellVal === selectFilters[field];
    });

    return matchStatus && matchSelectFilters;
  });

  renderTable();
  const total = allData.filter(r => !status || r.trang_thai === status).length;
  const shown = filteredData.length;
  if ($('countBadge')) $('countBadge').textContent = shown + ' yêu cầu';

  // Show/hide filter active details and clear button inside the separate active-filters-bar
  const isFiltered = Object.keys(selectFilters).length > 0;
  const activeFiltersBar = $('activeFiltersBar');
  if (isFiltered) {
    if (activeFiltersBar) activeFiltersBar.style.display = 'flex';
    const parts = [];
    Object.keys(selectFilters).forEach(field => {
      const labels = { ngay_yc: 'Ngày YC', nguoi_yc: 'Người YC', ten_hang: 'Tên Hàng', don_vi: 'ĐVT', uu_tien: 'Ưu tiên', muc_dich: 'Mục đích' };
      parts.push(`${labels[field] || field}: <strong>${selectFilters[field]}</strong>`);
    });
    const infoTextEl = $('filterInfoText');
    if (infoTextEl) {
      infoTextEl.innerHTML = parts.join(' · ') + ' — Hiển thị <strong>' + shown + '</strong>/' + total + ' yêu cầu';
    }
  } else {
    if (activeFiltersBar) activeFiltersBar.style.display = 'none';
  }
}

// ── Dashboard ──
function renderDashboard() {
  const total = allData.length;
  const pending = allData.filter(r => r.trang_thai === 'Chờ duyệt').length;
  const approved = allData.filter(r => r.trang_thai === 'Đã duyệt').length;
  const totalVal = allData.reduce((s, r) => s + (r.thanh_tien || 0), 0);

  $('kpiTotal').textContent = total;
  $('kpiPending').textContent = pending;
  $('kpiApproved').textContent = approved;
  $('kpiValue').textContent = new Intl.NumberFormat('vi-VN', {
    notation: total > 0 && totalVal > 1e9 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(totalVal) + ' đ';

  // Cập nhật huy hiệu thông báo số lượng chờ duyệt ở sidebar
  const navBadge = $('navPendingBadge');
  if (navBadge) {
    if (pending > 0) {
      navBadge.textContent = pending;
      navBadge.style.display = 'inline-block';
    } else {
      navBadge.style.display = 'none';
    }
  }

  // Cập nhật huy hiệu thông báo số lượng đã duyệt ở sidebar
  const navAppBadge = $('navApprovedBadge');
  if (navAppBadge) {
    if (approved > 0) {
      navAppBadge.textContent = approved;
      navAppBadge.style.display = 'inline-block';
    } else {
      navAppBadge.style.display = 'none';
    }
  }

  renderCharts(pending, approved);
}

function renderCharts(pending, approved) {
  // Doughnut
  const dCtx = $('doughnutChart')?.getContext('2d');
  if (dCtx) {
    if (doughnutChart) doughnutChart.destroy();
    doughnutChart = new Chart(dCtx, {
      type: 'doughnut',
      data: {
        labels: ['Chờ duyệt', 'Đã duyệt'],
        datasets: [{
          data: [pending, approved],
          backgroundColor: ['#d29922', '#3fb950'],
          borderColor: '#1c2128',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 11 }, padding: 12, boxWidth: 12 } }
        },
        cutout: '65%'
      }
    });
  }

  // Bar chart by month
  const monthData = {};
  allData.forEach(r => {
    if (r.ngay_yc) {
      const m = new Date(r.ngay_yc).toLocaleDateString('vi-VN', { month: 'short', year: '2-digit' });
      monthData[m] = (monthData[m] || 0) + 1;
    }
  });
  const labels = Object.keys(monthData).slice(-6);
  const values = labels.map(l => monthData[l]);

  const bCtx = $('barChart')?.getContext('2d');
  if (bCtx) {
    if (barChart) barChart.destroy();
    barChart = new Chart(bCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Số yêu cầu',
          data: values,
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { color: '#1e2e4b' }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: '#1e2e4b' }, ticks: { color: '#94a3b8', precision: 0 } }
        }
      }
    });
  }
}

// ── Update Summary Totals (dynamic preview including checked checkboxes) ──
function updateSummaryTotals() {
  const selectFilters = {};
  document.querySelectorAll('.custom-filter-dropdown').forEach(dropdown => {
    const field = dropdown.dataset.field;
    const activeOpt = dropdown.querySelector('.filter-option.active');
    const val = activeOpt ? activeOpt.getAttribute('data-value') : '';
    if (val) selectFilters[field] = val;
  });

  const columnFilteredData = allData.filter(r => {
    return Object.keys(selectFilters).every(field => {
      let cellVal = '';
      if (field === 'ngay_yc') cellVal = fmtDate(r.ngay_yc);
      else cellVal = String(r[field] || '');
      return cellVal === selectFilters[field];
    });
  });

  // Requested amount = total amount of pending requests matching active filters
  const totalRequestedAmount = columnFilteredData
    .filter(r => r.trang_thai === 'Chờ duyệt')
    .reduce((sum, item) => sum + (item.thanh_tien || 0), 0);

  // Approved amount: in approved list view, show the total sum of all approved items matching filters.
  // In the pending list view, show the sum of currently selected/checked rows.
  let totalApprovedAmount = 0;
  if (currentView === 'approved') {
    totalApprovedAmount = columnFilteredData
      .filter(r => r.trang_thai === 'Đã duyệt')
      .reduce((sum, item) => sum + (item.thanh_tien || 0), 0);
  } else {
    document.querySelectorAll('.row-checkbox:checked').forEach(cb => {
      const id = cb.dataset.id;
      const r = allData.find(x => x.id === id);
      if (r) {
        totalApprovedAmount += (r.thanh_tien || 0);
      }
    });
  }

  const summaryAmountEl = $('summaryTotalAmount');
  const summaryApprovedEl = $('summaryApprovedAmount');
  if (summaryAmountEl) summaryAmountEl.textContent = fmt(totalRequestedAmount);
  if (summaryApprovedEl) summaryApprovedEl.textContent = fmt(totalApprovedAmount);
}

// ── Render Table ──
function renderTable() {
  const tbody = $('tableBody');
  if (!tbody) return;

  if ($('selectAll')) $('selectAll').checked = false;

  updateSummaryTotals();

  if (filteredData.length === 0) {
    let emptyTitle = 'Không có dữ liệu';
    let emptySub = 'Thêm yêu cầu mua hàng mới hoặc thay đổi bộ lọc';

    // Kiểm tra bộ lọc tìm kiếm/cột có đang hoạt động hay không
    let hasActiveFilters = false;
    document.querySelectorAll('.custom-filter-dropdown').forEach(dropdown => {
      const activeOpt = dropdown.querySelector('.filter-option.active');
      const val = activeOpt ? activeOpt.getAttribute('data-value') : '';
      if (val) hasActiveFilters = true;
    });

    if (!hasActiveFilters) {
      const isListView = $('nav-list')?.classList.contains('active');
      const isApprovedView = $('nav-approved')?.classList.contains('active');
      
      const hasPending = allData.some(r => r.trang_thai === 'Chờ duyệt');
      const hasApproved = allData.some(r => r.trang_thai === 'Đã duyệt');

      if (isListView && hasApproved && !hasPending) {
        emptyTitle = '🎉 Tất cả yêu cầu đã được duyệt!';
        emptySub = 'Không còn yêu cầu nào chờ duyệt. Dữ liệu đã chuyển sang tab <strong>🟢 Danh Sách Đã Duyệt</strong> ở menu bên trái.';
      } else if (isApprovedView && hasPending && !hasApproved) {
        emptyTitle = '🟢 Chưa có yêu cầu nào được duyệt';
        emptySub = 'Vui lòng kiểm tra và duyệt các yêu cầu mua hàng tại tab <strong>📋 Danh Sách YC Mua Hàng</strong>.';
      }
    }

    tbody.innerHTML = `<tr class="empty-row"><td colspan="13">
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>${emptyTitle}</h3>
        <p>${emptySub}</p>
      </div>
    </td></tr>`;
    
    updateSelectedCount();
    return;
  }

  tbody.innerHTML = filteredData.map((r, i) => {
    const sc = STATUS_CONFIG[r.trang_thai] || { badge: 'badge-yellow', icon: '⚪' };
    const pc = PRIORITY_CONFIG[r.uu_tien] || { cls: '', icon: '' };
    return `
    <tr class="fade-in">
      <td class="muted" style="font-size:11px">${i + 1}</td>
      <td class="muted editable-cell" onclick="startInlineEdit(this, '${r.id}', 'ngay_yc', 'date')">${fmtDate(r.ngay_yc)}</td>
      <td class="muted editable-cell" onclick="startInlineEdit(this, '${r.id}', 'nguoi_yc', 'text')">${r.nguoi_yc || '—'}</td>
      <td class="editable-cell item-name-cell" onclick="startInlineEdit(this, '${r.id}', 'ten_hang', 'text')">${r.ten_hang || '—'}</td>
      <td class="muted editable-cell" style="text-align:right" onclick="startInlineEdit(this, '${r.id}', 'so_luong', 'number')">${Number(r.so_luong||0).toLocaleString('vi-VN')}</td>
      <td class="muted editable-cell" onclick="startInlineEdit(this, '${r.id}', 'don_vi', 'text')">${r.don_vi || '—'}</td>
      <td class="currency editable-cell" style="text-align:right" onclick="startInlineEdit(this, '${r.id}', 'don_gia', 'number')">${fmt(r.don_gia)}</td>
      <td class="currency" style="text-align:right;color:var(--accent)">${fmt(r.thanh_tien)}</td>
      <td><span class="badge-priority clickable ${pc.cls}" data-id="${r.id}" data-priority="${r.uu_tien || ''}" onclick="showPriorityDropdown(this, event)">${pc.icon} ${r.uu_tien || '—'}</span></td>
      <td class="status-cell">
        <div class="status-dropdown-wrapper">
          <span class="badge ${sc.badge} clickable" onclick="toggleStatus('${r.id}', '${r.trang_thai || 'Chờ duyệt'}')">${sc.icon} ${r.trang_thai || '—'}</span>
          <div class="status-dropdown-list">
            ${r.trang_thai === 'Chờ duyệt' 
              ? `<div class="status-option" onclick="updateStatus('${r.id}', 'Đã duyệt')">✔️ Đã duyệt</div>`
              : `<div class="status-option" onclick="updateStatus('${r.id}', 'Chờ duyệt')">⏳ Chờ duyệt</div>`
            }
          </div>
        </div>
      </td>
      <td class="editable-cell" onclick="startInlineEdit(this, '${r.id}', 'muc_dich', 'text')">${r.muc_dich || '—'}</td>
      <td>
        <div class="action-group">
          <button class="btn btn-sm btn-edit btn-icon" title="Chỉnh sửa" onclick="openEditModal('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button class="btn btn-sm btn-delete btn-icon" title="Xóa" onclick="confirmDelete('${r.id}', '${(r.ten_hang||'').replace(/'/g,"\\'")}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
        </div>
      </td>
      <td style="text-align:center; padding:0 !important;"><label class="checkbox-label-wrapper"><input type="checkbox" class="row-checkbox" data-id="${r.id}" title="Chọn mục này" onchange="updateSelectedCount()" /></label></td>
    </tr>`;
  }).join('');

  updateSelectedCount();
}

// ── Bulk Approval Helpers ──
function toggleSelectAll(master) {
  const checkboxes = document.querySelectorAll('.row-checkbox');
  checkboxes.forEach(cb => cb.checked = master.checked);
  updateSelectedCount();
}

function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('.row-checkbox:checked');
  const count = checkboxes.length;
  
  // Calculate selected sum
  let selectedSum = 0;
  checkboxes.forEach(cb => {
    const id = cb.dataset.id;
    const r = allData.find(x => x.id === id);
    if (r) {
      selectedSum += (r.thanh_tien || 0);
    }
  });

  // Update floating selected box
  const floatBox = $('floatingSelectedBox');
  const floatCount = $('floatingSelectedCount');
  const floatAmount = $('floatingSelectedAmount');
  if (floatBox && floatCount && floatAmount) {
    if (count > 0) {
      floatCount.textContent = count;
      floatAmount.textContent = fmt(selectedSum);
      floatBox.style.display = 'flex';
    } else {
      floatBox.style.display = 'none';
    }
  }
  
  const btnApprove = $('btnBulkApprove');
  const countApprove = $('selectedCount');
  const btnUnapprove = $('btnBulkUnapprove');
  const countUnapprove = $('selectedCountUnapprove');

  const isListView = $('nav-list')?.classList.contains('active');
  const isApprovedView = $('nav-approved')?.classList.contains('active');

  if (btnApprove && countApprove) {
    if (count > 0 && isListView) {
      btnApprove.style.display = 'inline-block';
      countApprove.textContent = count;
    } else {
      btnApprove.style.display = 'none';
    }
  }

  if (btnUnapprove && countUnapprove) {
    if (count > 0 && isApprovedView) {
      btnUnapprove.style.display = 'inline-block';
      countUnapprove.textContent = count;
    } else {
      btnUnapprove.style.display = 'none';
    }
  }

  const btnDelete = $('btnBulkDelete');
  const countDelete = $('selectedCountDelete');
  if (btnDelete && countDelete) {
    if (count > 0) {
      btnDelete.style.display = 'inline-block';
      countDelete.textContent = count;
    } else {
      btnDelete.style.display = 'none';
    }
  }

  // Handle clickable status & tooltips on the summary boxes
  const boxReq = $('summaryBoxReq');
  const boxApp = $('summaryBoxApp');
  if (boxReq && boxApp) {
    if (count > 0) {
      if (isListView) {
        boxApp.classList.add('clickable');
        boxApp.title = `Nhấp vào đây để Duyệt ${count} yêu cầu đang chọn`;
        boxReq.classList.remove('clickable');
        boxReq.title = "";
      } else if (isApprovedView) {
        boxReq.classList.add('clickable');
        boxReq.title = `Nhấp vào đây để Hủy duyệt ${count} yêu cầu đang chọn`;
        boxApp.classList.remove('clickable');
        boxApp.title = "";
      }
    } else {
      boxReq.classList.remove('clickable');
      boxReq.title = "";
      boxApp.classList.remove('clickable');
      boxApp.title = "";
    }
  }

  updateSummaryTotals();
}

function scrollToBulkActions() {
  const target = $('btnBulkApprove') || $('btnBulkUnapprove') || $('activeFiltersBar') || $('listTitleText');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function handleReqBoxClick() {
  const isApprovedView = $('nav-approved')?.classList.contains('active');
  const checkboxes = document.querySelectorAll('.row-checkbox:checked');
  if (isApprovedView && checkboxes.length > 0) {
    bulkUnapprove();
  }
}

function handleAppBoxClick() {
  const isListView = $('nav-list')?.classList.contains('active');
  const checkboxes = document.querySelectorAll('.row-checkbox:checked');
  if (isListView && checkboxes.length > 0) {
    bulkApprove();
  }
}

async function bulkApprove() {
  const checkboxes = document.querySelectorAll('.row-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
  if (ids.length === 0) return;

  if (!confirm(`Bạn có chắc chắn muốn duyệt ${ids.length} yêu cầu đã chọn?`)) {
    return;
  }

  const btn = $('btnBulkApprove');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang duyệt...';
  }

  try {
    const { error } = await db.from(TABLE).update({ trang_thai: 'Đã duyệt' }).in('id', ids);
    if (error) throw error;

    toast(`Đã duyệt thành công ${ids.length} yêu cầu!`, 'success');
    await loadData();
  } catch (err) {
    toast('Lỗi duyệt số lượng lớn: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `✅ Duyệt đã chọn (0)`;
      btn.style.display = 'none';
    }
  }
}

async function bulkUnapprove() {
  const checkboxes = document.querySelectorAll('.row-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
  if (ids.length === 0) return;

  if (!confirm(`Bạn có chắc muốn hủy duyệt ${ids.length} yêu cầu đã chọn?`)) {
    return;
  }

  const btn = $('btnBulkUnapprove');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang hủy duyệt...';
  }

  try {
    const { error } = await db.from(TABLE).update({ trang_thai: 'Chờ duyệt' }).in('id', ids);
    if (error) throw error;

    toast(`Đã hủy duyệt thành công ${ids.length} yêu cầu!`, 'success');
    await loadData();
  } catch (err) {
    toast('Lỗi hủy duyệt: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `⏳ Hủy duyệt đã chọn (0)`;
      btn.style.display = 'none';
    }
  }
}

async function bulkDelete() {
  const checkboxes = document.querySelectorAll('.row-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
  if (ids.length === 0) return;

  if (!confirm(`Bạn có chắc chắn muốn xóa ${ids.length} yêu cầu đã chọn?`)) {
    return;
  }

  const btn = $('btnBulkDelete');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang xóa...';
  }

  try {
    const { error } = await db.from(TABLE).delete().in('id', ids);
    if (error) throw error;

    toast(`Đã xóa thành công ${ids.length} yêu cầu!`, 'success');
    await loadData();
  } catch (err) {
    toast('Lỗi xóa: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `🗑️ Xóa đã chọn (0)`;
      btn.style.display = 'none';
    }
  }
}


// ── Toggle Status Directly ──
function toggleStatus(id, currentStatus) {
  const newStatus = currentStatus === 'Chờ duyệt' ? 'Đã duyệt' : 'Chờ duyệt';
  updateStatus(id, newStatus);
}

function closeStatusDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
    activeBadge = null;
  }
}

async function updateStatus(id, newStatus) {
  closeStatusDropdown();
  try {
    const { error } = await db.from(TABLE).update({ trang_thai: newStatus }).eq('id', id);
    if (error) throw error;
    // Cập nhật local data ngay lập tức
    const idx = allData.findIndex(r => r.id === id);
    if (idx !== -1) allData[idx].trang_thai = newStatus;
    
    // Áp dụng bộ lọc để dòng vừa chọn tự động ẩn khỏi danh sách hiện tại
    applyFilters();
    renderDashboard();
    
    const sc = STATUS_CONFIG[newStatus] || { icon: '' };
    toast(`${sc.icon} Đã cập nhật trạng thái đơn hàng!`, 'success');
  } catch (err) {
    toast('Lỗi cập nhật: ' + err.message, 'error');
  }
}

// ── Inline Priority Dropdown ──
const PRIORITY_OPTIONS = [
  { value: 'Cao', icon: '🔺' },
  { value: 'Trung bình', icon: '🔸' },
  { value: 'Thấp', icon: '🔹' },
];

let activePriorityDropdown = null;
let activePriorityBadge = null;

function showPriorityDropdown(badge, event) {
  if (event) event.stopPropagation();

  if (activePriorityDropdown && activePriorityBadge === badge) {
    closePriorityDropdown();
    return;
  }
  closePriorityDropdown();

  const id = badge.dataset.id;
  const currentPriority = badge.dataset.priority;

  const dropdown = document.createElement('div');
  dropdown.className = 'priority-dropdown';
  
  const rect = badge.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + 6}px`;
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.zIndex = '9999';

  PRIORITY_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'priority-dropdown-item' + (opt.value === currentPriority ? ' current' : '');
    btn.innerHTML = `${opt.icon} ${opt.value}${opt.value === currentPriority ? ' <strong>✓</strong>' : ''}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      updatePriority(id, opt.value);
    });
    dropdown.appendChild(btn);
  });

  document.body.appendChild(dropdown);
  activePriorityDropdown = dropdown;
  activePriorityBadge = badge;
}

function closePriorityDropdown() {
  if (activePriorityDropdown) {
    activePriorityDropdown.remove();
    activePriorityDropdown = null;
    activePriorityBadge = null;
  }
}

async function updatePriority(id, newPriority) {
  closePriorityDropdown();
  try {
    const { error } = await db.from(TABLE).update({ uu_tien: newPriority }).eq('id', id);
    if (error) throw error;
    // Cập nhật local data ngay lập tức
    const idx = allData.findIndex(r => r.id === id);
    if (idx !== -1) allData[idx].uu_tien = newPriority;
    const fidx = filteredData.findIndex(r => r.id === id);
    if (fidx !== -1) filteredData[fidx].uu_tien = newPriority;
    renderTable();
    renderDashboard();
    toast(`🔺 Đã cập nhật mức ưu tiên thành "${newPriority}"`, 'success');
  } catch (err) {
    toast('Lỗi cập nhật: ' + err.message, 'error');
  }
}

// ── Inline Cell Editing ──
let activeInlineEditCell = null;

function startInlineEdit(cell, id, field, type) {
  // If already editing, do nothing
  if (activeInlineEditCell === cell) return;
  if (cell.classList.contains('editing')) return;
  
  // Close any existing edit
  cancelAllInlineEdits();
  
  activeInlineEditCell = cell;
  const originalValue = allData.find(r => r.id === id)?.[field] || '';
  
  cell.classList.add('editing');
  
  const input = document.createElement('input');
  input.type = type;
  if (type === 'number') {
    input.step = field === 'so_luong' ? '0.01' : '1000';
    input.min = '0';
  }
  input.value = originalValue;
  
  // Save original HTML to restore if needed
  cell.dataset.originalHtml = cell.innerHTML;
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  if (type !== 'date') {
    input.select();
  }
  
  let isFinished = false;
  
  const finishEdit = async () => {
    if (isFinished) return;
    isFinished = true;
    
    const newValue = type === 'number' ? parseFloat(input.value) || 0 : input.value.trim();
    if (newValue === originalValue || (type === 'number' && Number(newValue) === Number(originalValue))) {
      cell.innerHTML = cell.dataset.originalHtml;
      cell.classList.remove('editing');
      if (activeInlineEditCell === cell) activeInlineEditCell = null;
      return;
    }
    
    // Save to database
    try {
      const updateData = { [field]: newValue };
      
      const { error } = await db.from(TABLE).update(updateData).eq('id', id);
      if (error) throw error;
      
      // Update local data
      const idx = allData.findIndex(r => r.id === id);
      if (idx !== -1) {
        allData[idx] = { ...allData[idx], ...updateData };
        allData[idx].thanh_tien = (allData[idx].so_luong || 0) * (allData[idx].don_gia || 0);
      }
      const fidx = filteredData.findIndex(r => r.id === id);
      if (fidx !== -1) {
        filteredData[fidx] = { ...filteredData[fidx], ...updateData };
        filteredData[fidx].thanh_tien = (filteredData[fidx].so_luong || 0) * (filteredData[fidx].don_gia || 0);
      }
      
      toast('Đã cập nhật trực tiếp thành công!', 'success');
      renderTable();
      renderDashboard();
    } catch (err) {
      toast('Lỗi cập nhật: ' + err.message, 'error');
      cell.innerHTML = cell.dataset.originalHtml;
    } finally {
      cell.classList.remove('editing');
      if (activeInlineEditCell === cell) activeInlineEditCell = null;
    }
  };
  
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      input.blur();
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      isFinished = true;
      cell.innerHTML = cell.dataset.originalHtml;
      cell.classList.remove('editing');
      if (activeInlineEditCell === cell) activeInlineEditCell = null;
    }
  });
  
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!isFinished) {
        finishEdit();
      }
    }, 150);
  });
}

function cancelAllInlineEdits() {
  if (activeInlineEditCell) {
    activeInlineEditCell.innerHTML = activeInlineEditCell.dataset.originalHtml;
    activeInlineEditCell.classList.remove('editing');
    activeInlineEditCell = null;
  }
}

// ── Add / Edit Modal ──
function openAddModal() {
  editingId = null;
  $('modalTitle').textContent = '➕ Thêm Yêu Cầu Mua Hàng';
  $('formModal').reset();
  $('fieldMaYc').value = genId();
  $('fieldNgayYc').value = new Date().toISOString().split('T')[0];
  $('modalOverlay').classList.add('open');
}

async function openEditModal(id) {
  editingId = id;
  const r = allData.find(x => x.id === id);
  if (!r) return;
  $('modalTitle').textContent = '✏️ Chỉnh Sửa Yêu Cầu';
  $('fieldMaYc').value = r.ma_yc || '';
  $('fieldNgayYc').value = r.ngay_yc || '';
  $('fieldNguoiYc').value = r.nguoi_yc || '';
  $('fieldTenHang').value = r.ten_hang || '';
  $('fieldDonVi').value = r.don_vi || 'Cái';
  $('fieldSoLuong').value = r.so_luong || 1;
  $('fieldDonGia').value = r.don_gia || 0;
  $('fieldMucDich').value = r.muc_dich || '';
  $('fieldUuTien').value = r.uu_tien || 'Trung bình';
  $('fieldTrangThai').value = r.trang_thai || 'Chờ duyệt';
  $('fieldGhiChu').value = r.ghi_chu || '';
  $('modalOverlay').classList.add('open');
}

function closeModal() {
  $('modalOverlay').classList.remove('open');
  editingId = null;
}

async function saveForm() {
  const payload = {
    ma_yc: $('fieldMaYc').value.trim(),
    ngay_yc: $('fieldNgayYc').value,
    nguoi_yc: $('fieldNguoiYc').value.trim(),
    ten_hang: $('fieldTenHang').value.trim(),
    don_vi: $('fieldDonVi').value,
    so_luong: parseFloat($('fieldSoLuong').value) || 0,
    don_gia: parseFloat($('fieldDonGia').value) || 0,
    muc_dich: $('fieldMucDich').value.trim(),
    uu_tien: $('fieldUuTien').value,
    trang_thai: $('fieldTrangThai').value,
    ghi_chu: $('fieldGhiChu').value.trim(),
  };

  if (!payload.ten_hang) { toast('Vui lòng nhập tên hàng!', 'error'); return; }

  const btn = $('btnSave');
  btn.disabled = true;
  btn.textContent = 'Đang lưu...';

  try {
    let error;
    if (editingId) {
      ({ error } = await db.from(TABLE).update(payload).eq('id', editingId));
    } else {
      ({ error } = await db.from(TABLE).insert([payload]));
    }
    if (error) throw error;
    toast(editingId ? 'Cập nhật thành công!' : 'Thêm yêu cầu thành công!', 'success');
    closeModal();
    await loadData();
  } catch (err) {
    toast('Lỗi: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lưu';
  }
}

// ── Delete ──
function confirmDelete(id, name) {
  deleteId = id;
  $('deleteItemName').textContent = name;
  $('deleteOverlay').classList.add('open');
}

function closeDeleteModal() {
  $('deleteOverlay').classList.remove('open');
  deleteId = null;
}

async function doDelete() {
  if (!deleteId) return;
  const btn = $('btnConfirmDelete');
  btn.disabled = true;
  btn.textContent = 'Đang xóa...';
  try {
    const { error } = await db.from(TABLE).delete().eq('id', deleteId);
    if (error) throw error;
    toast('Đã xóa yêu cầu!', 'success');
    closeDeleteModal();
    await loadData();
  } catch (err) {
    toast('Lỗi: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Xóa';
  }
}

// ── Export CSV ──
function exportCSV() {
  const headers = ['Mã YC', 'Ngày YC', 'Phòng Ban', 'Người YC', 'Tên Hàng', 'ĐVT', 'Số Lượng', 'Đơn Giá', 'Thành Tiền', 'Mục Đích', 'Ưu Tiên', 'Trạng Thái', 'Ghi Chú'];
  const rows = filteredData.map(r => [
    r.ma_yc, r.ngay_yc, r.phong_ban, r.nguoi_yc, r.ten_hang,
    r.don_vi, r.so_luong, r.don_gia, r.thanh_tien,
    r.muc_dich, r.uu_tien, r.trang_thai, r.ghi_chu
  ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`));

  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yeu-cau-mua-hang-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Xuất file CSV thành công!', 'success');
}

// ── Import Excel ──
function triggerExcelImport() {
  const fileInput = $('excelFileInput');
  if (fileInput) fileInput.click();
}

function mapExcelRow(row) {
  const findValue = (aliases) => {
    for (const key of Object.keys(row)) {
      const normalizedKey = key.trim().toLowerCase();
      if (aliases.some(alias => normalizedKey === alias.toLowerCase())) {
        return row[key];
      }
    }
    return null;
  };

  const ten_hang = findValue(["Tên Hàng / Vật Tư", "Tên Hàng", "Vật Tư", "Tên vật tư", "Tên sản phẩm", "ten_hang", "ten hang", "ten vat tu", "Tên vật tư/hàng hóa"]);
  if (!ten_hang) return null; // Bỏ qua dòng nếu không có tên hàng

  // Xử lý Ngày YC
  let rawDate = findValue(["Ngày YC", "Ngày Yêu Cầu", "Ngày", "ngay_yc", "ngay yc", "ngay", "ngay yeu cau", "Ngày yêu cầu"]);
  let ngay_yc = null;
  if (rawDate) {
    if (typeof rawDate === 'number') {
      // Xử lý số ngày của Excel (Excel Date Code)
      const date = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
      ngay_yc = date.toISOString().split('T')[0];
    } else {
      // Thử phân tích chuỗi DD/MM/YYYY
      const parts = String(rawDate).split('/');
      if (parts.length === 3) {
        const dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          ngay_yc = parsedDate.toISOString().split('T')[0];
        }
      } else {
        const parsedDate = new Date(rawDate);
        if (!isNaN(parsedDate.getTime())) {
          ngay_yc = parsedDate.toISOString().split('T')[0];
        }
      }
    }
  }
  if (!ngay_yc) ngay_yc = new Date().toISOString().split('T')[0];

  let rawPriority = findValue(["Ưu Tiên", "Độ ưu tiên", "uu_tien", "uu tien", "uu tien"]) || "Trung bình";
  if (rawPriority === "Thường") rawPriority = "Trung bình";
  if (rawPriority === "Khẩn cấp") rawPriority = "Cao";

  return {
    ma_yc: findValue(["Mã YC", "Mã Yêu Cầu", "ma_yc", "ma yc", "ma", "Mã yêu cầu"]) || genId(),
    ngay_yc: ngay_yc,
    nguoi_yc: findValue(["Người YC", "Người Yêu Cầu", "nguoi_yc", "nguoi yc", "nguoi yeu cau", "Người yêu cầu"]) || "",
    ten_hang: ten_hang,
    don_vi: findValue(["Đơn Vị Tính", "ĐVT", "Đơn vị", "don_vi", "don vi", "dvt", "Đơn vị tính"]) || "Cái",
    so_luong: parseFloat(findValue(["Số Lượng", "Qty", "so_luong", "so luong", "so luong", "Số lượng"])) || 1,
    don_gia: parseFloat(findValue(["Đơn Giá", "Giá", "don_gia", "don gia", "gia", "don gia", "Đơn giá dự kiến"])) || 0,
    uu_tien: rawPriority,
    trang_thai: "Chờ duyệt",
    muc_dich: findValue(["Mục Đích Sử Dụng", "Mục đích", "Lý do", "muc_dich", "muc dich", "muc dich su dung", "Ghi chú/Mục đích"]) || "",
    ghi_chu: findValue(["Ghi Chú", "ghi_chu", "ghi chu", "ghi chu", "Ghi chú/Mục đích"]) || ""
  };
}

async function importExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  toast("Đang phân tích file Excel...", "info");

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet);

      if (jsonRows.length === 0) {
        toast("File Excel không có dữ liệu!", "error");
        return;
      }

      const payload = jsonRows.map(mapExcelRow).filter(row => row !== null);

      if (payload.length === 0) {
        toast("Không tìm thấy dòng hợp lệ nào (Cột 'Tên Hàng' là bắt buộc)!", "error");
        return;
      }

      toast(`Đang tải ${payload.length} dòng lên Supabase...`, "info");

      const { error } = await db.from(TABLE).insert(payload);
      if (error) throw error;

      toast(`Nhập thành công ${payload.length} yêu cầu từ Excel!`, "success");
      await loadData();
    } catch (err) {
      console.error(err);
      toast("Lỗi nhập Excel: " + err.message, "error");
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  navigate('dashboard');
  await loadData();
  subscribeRealtime();

  // Close modal on backdrop click
  $('modalOverlay')?.addEventListener('click', e => {
    if (e.target === $('modalOverlay')) closeModal();
  });
  $('deleteOverlay')?.addEventListener('click', e => {
    if (e.target === $('deleteOverlay')) closeDeleteModal();
  });

  // Đóng status / priority dropdown & mobile sidebar khi click ra ngoài
  document.addEventListener('click', e => {
    if (activeDropdown && !e.target.closest('.status-dropdown') && !e.target.closest('.badge.clickable')) {
      closeStatusDropdown();
    }
    if (activePriorityDropdown && !e.target.closest('.priority-dropdown') && !e.target.closest('.badge-priority.clickable')) {
      closePriorityDropdown();
    }
    
    // Mobile sidebar click outside logic
    const sidebar = $('sidebar');
    const toggleBtn = $('sidebarToggle');
    if (sidebar && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && e.target !== toggleBtn) {
        sidebar.classList.remove('open');
      }
    }
  });
  
  // Đóng dropdown khi scroll trang
  window.addEventListener('scroll', () => {
    closeStatusDropdown();
    closePriorityDropdown();
  }, { passive: true });


});
