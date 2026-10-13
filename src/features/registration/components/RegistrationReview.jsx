import { Pencil } from 'lucide-react';
import { FILE_FIELDS, hasNoIdentity, previousGrades } from '../registrationModel';

function ReviewGroup({ title, step, onEdit, rows }) {
  return <section className="reg-review-group"><div><h3>{title}</h3><button type="button" onClick={() => onEdit(step)}><Pencil size={14} /> Chỉnh sửa</button></div><dl>{rows.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}

export default function RegistrationReview({ values, config, files, onEdit }) {
  const school = config.schools.find(item => item.key === values.coSoHoc);
  const location = prefix => [values[`${prefix}Ward`], values[`${prefix}District`], values[`${prefix}Province`]].filter(Boolean).join(', ');
  return <div className="reg-review">
    <ReviewGroup title="Thông tin đăng ký & học sinh" step={0} onEdit={onEdit} rows={[
      ['Cơ sở đăng ký', school?.name], ['Lớp đăng ký', values.lopHoc], ['Năm học', config.currentSchoolYear], ['Họ và tên', values.hoVaTen],
      ['Ngày sinh', values.ngaySinh.split('-').reverse().join('/')], ['Giới tính', values.gioiTinh], ['Mã định danh', values.maDinhDanh], ['Số điện thoại', values.soDienThoai]
    ]} />
    {!!previousGrades(values.lopHoc).length && <ReviewGroup title="Thông tin học tập các lớp trước" step={0} onEdit={onEdit}
      rows={previousGrades(values.lopHoc).map(grade => [`Lớp ${grade}`, `Học lực: ${values[`hocLucLop${grade}`]}; hạnh kiểm: ${values[`hanhKiemLop${grade}`]}`])} />}
    <ReviewGroup title="Khai sinh & địa chỉ" step={1} onEdit={onEdit} rows={[
      ['Nơi sinh', [values.birthPlaceName, location('birth')].filter(Boolean).join(', ')], ['Đăng ký khai sinh', location('birthRegistration')], ['Quê quán', location('hometown')],
      ['Nơi ở hiện tại', [values.soNha, values.xaPhuong, values.tinhThanh].filter(Boolean).join(', ')], ['Thường trú', [values.soNhaHK, values.xaPhuongHK, values.tinhThanhHK].filter(Boolean).join(', ')]
    ]} />
    <ReviewGroup title="Gia đình" step={2} onEdit={onEdit} rows={[
      ['Họ tên cha', values.tenCha], ['Năm sinh cha', values.namSinhCha], ['Nghề nghiệp cha', values.ngheNghiepCha], ['Điện thoại cha', values.sdtCha],
      ['Họ tên mẹ', values.tenMe], ['Năm sinh mẹ', values.namSinhMe], ['Nghề nghiệp mẹ', values.ngheNghiepMe], ['Điện thoại mẹ', values.sdtMe],
      ['Tình trạng tạm trú', values.tinhTrangTamTru], ['Đăng ký đi xe', values.diXe]
    ]} />
    <ReviewGroup title="Hồ sơ đính kèm" step={3} onEdit={onEdit} rows={FILE_FIELDS.filter(spec => spec.key !== 'anhCanCuoc' || !hasNoIdentity(values.maDinhDanh)).map(spec => [spec.label, (files[spec.key] || []).map(file => file.name).join(', ')])} />
  </div>;
}
