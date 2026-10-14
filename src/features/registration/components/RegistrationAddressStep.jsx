import { AddressFields, Field, LocationFields, Section } from './RegistrationFields';

export default function RegistrationAddressStep({ values, errors, onChange, directories, sameAddress, onSameAddressChange }) {
  const fieldProps = { values, errors, onChange };
  const birthDescription = 'Theo giấy khai sinh · Chính quyền 3 cấp cũ';

  return <div className="reg-address-sections">
    <Section framed title="Nơi sinh" description={birthDescription}>
      <LocationFields {...fieldProps} prefix="birth" directories={directories} />
      <Field {...fieldProps} name="birthPlaceName" label="Tên bệnh viện / nơi sinh" placeholder="Tên bệnh viện hoặc nơi sinh ghi trên giấy khai sinh" maxLength={200} />
    </Section>
    <Section framed title="Nơi đăng ký khai sinh" description={birthDescription}>
      <LocationFields {...fieldProps} prefix="birthRegistration" directories={directories} />
    </Section>
    <Section framed title="Quê quán" description={birthDescription}>
      <LocationFields {...fieldProps} prefix="hometown" directories={directories} />
    </Section>
    <Section framed title="Nơi ở hiện tại" description="Địa chỉ đang sinh sống · Chính quyền 2 cấp hiện tại">
      <AddressFields {...fieldProps} directories={directories} />
    </Section>
    <Section framed title="Địa chỉ thường trú" description="Theo thông tin thường trú · Chính quyền 2 cấp hiện tại">
      <label className="reg-checkbox"><input type="checkbox" checked={sameAddress} onChange={event => onSameAddressChange(event.target.checked)} /><span>Giống địa chỉ nơi ở hiện tại</span></label>
      <AddressFields {...fieldProps} household directories={directories} readOnly={sameAddress} />
    </Section>
  </div>;
}
