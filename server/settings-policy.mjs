export const SETTINGS_VIEWS = [
  ['model','Mô hình','authority'],['chat','Trò chuyện','authority'],['appearance','Giao diện','limited'],
  ['workspace','Không gian làm việc','authority'],['safety','An toàn','authority'],['memory','Bộ nhớ & Ngữ cảnh','authority'],
  ['voice','Giọng nói','authority'],['advanced','Nâng cao','authority'],['notifications','Thông báo','limited'],
  ['billing','Thanh toán','limited'],['providers','Nhà cung cấp','authority'],['gateway','Gateway','limited'],
  ['keybinds','Phím tắt','limited'],['keys','API Keys','authority'],['plugins','Plugins','limited'],
  ['sessions','Trò chuyện lưu trữ','limited'],['about','Giới thiệu','limited'],
].map(([id,label,mode])=>({id,label,mode,note:mode==='limited'?'Tính năng này phụ thuộc Hermes Desktop/Electron; Pocket chỉ hiển thị trạng thái an toàn.':''}));

const ROUTES = new Map([
  ['GET /pocket/settings/snapshot','snapshot'],
  ['GET /pocket/settings/config','config.get'],['GET /pocket/settings/defaults','config.defaults'],
  ['GET /pocket/settings/schema','config.schema'],['PUT /pocket/settings/config','config.save'],
  ['GET /pocket/settings/env','env.list'],['PUT /pocket/settings/env','env.set'],['DELETE /pocket/settings/env','env.delete'],
  ['GET /pocket/settings/providers/custom','providers.custom.list'],['POST /pocket/settings/providers/custom','providers.custom.save'],
]);

export function settingsRoute(method,path){
  const action=ROUTES.get(`${method.toUpperCase()} ${path}`);
  if(action)return{action};
  const match=path.match(/^\/pocket\/settings\/providers\/custom\/([^/]+)(?:\/(activate))?$/);
  if(match&&method.toUpperCase()==='DELETE'&&!match[2])return{action:'providers.custom.delete',id:decodeURIComponent(match[1])};
  if(match&&method.toUpperCase()==='POST'&&match[2])return{action:'providers.custom.activate',id:decodeURIComponent(match[1])};
  return null;
}

export function validEnvKey(key){return /^[A-Z][A-Z0-9_]{1,127}$/.test(String(key||''));}
