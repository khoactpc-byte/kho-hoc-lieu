export const TEACHER_EXPORT_SCHOOLS = { NAN:'THCS Nguyễn An Ninh',TQK:'THCS Trần Quang Khải' };
export const teacherAccountRevision = account => JSON.stringify([account.username,account.updatedAt??null,account.schoolCode]);

export function reconcileIssuedTeacherPasswords(cache,accounts) {
  const next=new Map();
  for(const account of accounts) {
    const known=cache.get(account.username),revision=teacherAccountRevision(account);
    if(known&&(known.revision==null||known.revision===revision))next.set(account.username,{...known,revision});
  }
  return next;
}

export function buildTeacherCredentialRows(accounts,passwords) {
  if(!accounts.length)throw new Error('Chọn ít nhất một giáo viên để xuất.');
  const rows=[['STT','Giáo viên','Tên đăng nhập','Mật khẩu','Cơ sở','Khối được dạy','Môn được dạy','Trạng thái']];
  accounts.forEach((account,index)=>{
    const password=Object.hasOwn(passwords,account.id)?passwords[account.id]:'';
    if(typeof password!=='string'||!password)throw new Error(`Chưa nhập mật khẩu cho ${account.fullName||account.username}.`);
    if(password.length>256)throw new Error('Mật khẩu tối đa 256 ký tự.');
    rows.push([String(index+1),account.fullName,account.username,password,TEACHER_EXPORT_SCHOOLS[account.schoolCode]||account.schoolCode,(account.grades||[]).join(', '),(account.subjects||[]).join(', '),account.isActive===false?'Đã khóa':'Đang hoạt động']);
  });
  return rows;
}

const xml = value => {
  const text=String(value??'');
  for(const char of text) {
    const code=char.codePointAt(0);
    if((code<32&&![9,10,13].includes(code))||(code>=0xd800&&code<=0xdfff)||code===0xfffe||code===0xffff)throw new Error('Dữ liệu có ký tự không hỗ trợ trong Excel. Kiểm tra lại trước khi xuất.');
  }
  return text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char])).replace(/\r/g,'&#13;');
};
const crcTable=Uint32Array.from({length:256},(_,index)=>{let c=index;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;};
const le16=value=>[value&255,(value>>>8)&255];
const le32=value=>[...le16(value),...le16(value>>>16)];
function zipWorkbook(files) {
  const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;
  for(const [name,content] of files) {
    const filename=encoder.encode(name),bytes=encoder.encode(content),checksum=crc32(bytes);
    const header=new Uint8Array([...le32(0x04034b50),...le16(20),...le16(0),...le16(0),...le16(0),...le16(33),...le32(checksum),...le32(bytes.length),...le32(bytes.length),...le16(filename.length),...le16(0)]);
    parts.push(header,filename,bytes);
    directory.push(new Uint8Array([...le32(0x02014b50),...le16(20),...le16(20),...le16(0),...le16(0),...le16(0),...le16(33),...le32(checksum),...le32(bytes.length),...le32(bytes.length),...le16(filename.length),...le16(0),...le16(0),...le16(0),...le16(0),...le32(0),...le32(offset)]),filename);
    offset+=header.length+filename.length+bytes.length;
  }
  const size=directory.reduce((sum,part)=>sum+part.length,0);
  return new Blob([...parts,...directory,new Uint8Array([...le32(0x06054b50),...le16(0),...le16(0),...le16(files.length),...le16(files.length),...le32(size),...le32(offset),...le16(0)])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

export function buildTeacherCredentialWorkbook(accounts,passwords) {
  const rows=buildTeacherCredentialRows(accounts,passwords);
  // Every cell is explicitly text: leading zeroes, spaces and passwords that
  // start with = or + survive unchanged and never become Excel formulas.
  const sheetRows=rows.map((row,index)=>`<row r="${index+1}"${index===0?' ht="30" customHeight="1"':''}>${row.map((value,column)=>`<c r="${String.fromCharCode(65+column)}${index+1}" t="inlineStr" s="${index===0?1:0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('');
  const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zipWorkbook([
    ['[Content_Types].xml',`${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels',`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`${declaration}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tài khoản giáo viên" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',`${declaration}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0369A1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml',`${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:H${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols>${[7,27,22,25,30,18,36,20].map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:H${rows.length}"/></worksheet>`]
  ]);
}

export function downloadTeacherCredentials(accounts,passwords,{documentObject=document,urlObject=URL,now=new Date()}={}) {
  const blob=buildTeacherCredentialWorkbook(accounts,passwords),url=urlObject.createObjectURL(blob);
  const date=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
  const link=documentObject.createElement('a');link.href=url;link.download=`danh-sach-mat-khau-giao-vien-${date.year}-${date.month}-${date.day}.xlsx`;
  documentObject.body.append(link);
  try{link.click();}finally{link.remove();setTimeout(()=>urlObject.revokeObjectURL(url),1000);}
}
