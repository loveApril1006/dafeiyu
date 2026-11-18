using System;using System.IO;using System.Drawing;using System.Windows.Forms;using System.Collections.Generic;
class GatewayForm:OceanForm {
 readonly string root;readonly bool preview;
 readonly TextBox http=new TextBox(),ws=new TextBox(),web=new TextBox(),token=new TextBox(),wsToken=new TextBox();
 readonly CheckBox clear=new CheckBox(),autoStart=new CheckBox();readonly TextBox launcher=new TextBox();readonly Label frameworkState=new Label(),status=new Label();
 readonly Button save=new OceanButton(),probe=new OceanButton(),connect=new OceanButton();bool busy,officialMode;
 internal GatewayForm(string path,bool screenshot=false){
  root=path;preview=screenshot;
  var canvas=OceanTheme.Canvas(this,1320,"大肥鱼 · 连接QQ");
  OceanTheme.Header(canvas,"连接 QQ","选择官方机器人，或接入自行安装的OneBot框架。");
  var official=new OceanButton{Text="腾讯官方QQ机器人 · AppID / AppSecret →"};OceanTheme.Place(canvas,official,18,190,766,42);OceanTheme.Button(official,true);
  official.Click+=async(s,e)=>{if(preview||busy)return;busy=true;official.Enabled=false;try{status.Text="正在准备QQ桥接后台，稍后打开官方QQ配置…";var result=await App.Run(Path.Combine(root,"Start-Bridge.ps1"),"-Root "+App.Quote(root),null);if(result.Item1!=0)throw new Exception(result.Item2.Trim());App.OpenConsole(root,"qq-official");status.Text="已打开官方QQ配置。填写凭据后保存、校验并应用；原OneBot接口会保留。";}catch(Exception error){status.Text=error.Message;}finally{busy=false;official.Enabled=true;}};
  var card=OceanTheme.Card(canvas,242,356,"OneBot v11 接口配置","\uE71B");
  var fields=new[]{http,ws,token,wsToken,web};var labels=new[]{"HTTP API 地址","正向 WS 地址","HTTP Token","WS Token","框架后台网址"};
  for(int i=0;i<fields.Length;i++){OceanTheme.Label(card,labels[i],24,65+i*45,140,28,10);OceanTheme.Input(card,fields[i],168,58+i*45,570,36);}
  token.UseSystemPasswordChar=wsToken.UseSystemPasswordChar=true;
  clear.Text="清除原来保存的两个Token（填入的新值优先）";clear.AutoSize=true;OceanTheme.Place(card,clear,168,287,570,28);
  OceanTheme.Label(card,"请使用正向通用 WebSocket 服务端；反向 WS 地址不适用于此入口。",24,323,720,24,9.5f,false,OceanTheme.Muted);
  var framework=OceanTheme.Card(canvas,616,176,"QQ框架随启动","\uE768");
  autoStart.Text="一键启动时，自动启动安装目录中的QQ框架";autoStart.Checked=true;autoStart.AutoSize=true;OceanTheme.Place(framework,autoStart,24,52,710,28);
  OceanTheme.Label(framework,"启动文件",24,91,100,28,10);OceanTheme.Input(framework,launcher,132,84,485,34);
  var choose=new OceanButton{Text="选择文件"};OceanTheme.Place(framework,choose,628,84,110,34);OceanTheme.Button(choose);
  choose.Click+=(s,e)=>{if(preview)return;using(var dialog=new OpenFileDialog()){dialog.Title="选择安装目录内QQ框架的正式启动文件";dialog.InitialDirectory=root;dialog.Filter="框架启动文件|*.exe;*.cmd;*.bat;*.ps1;*.mjs;*.js";if(dialog.ShowDialog(this)==DialogResult.OK){string file=Path.GetFullPath(dialog.FileName);if(!file.StartsWith(Path.GetFullPath(root).TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase)){status.Text="请选择大肥鱼安装目录内的QQ框架启动文件。";return;}launcher.Text=file;frameworkState.Text="入口已选择，保存后生效。留空时自动检测已知框架。";}}};
  OceanTheme.Place(framework,frameworkState,24,130,714,30);frameworkState.Font=OceanTheme.Font(9.5f);frameworkState.ForeColor=OceanTheme.Muted;frameworkState.Text="启动文件留空时自动检测；缺少时请先安装框架再重新检测。";
  OceanTheme.Place(canvas,save,18,812,238,48);save.Text="仅保存配置";OceanTheme.Button(save);
  OceanTheme.Place(canvas,probe,274,812,238,48);probe.Text="测试接口";OceanTheme.Button(probe);
  OceanTheme.Place(canvas,connect,530,812,254,48);connect.Text="保存并连接QQ";OceanTheme.Button(connect,true);
  save.Click+=async(s,e)=>await Run("save");probe.Click+=async(s,e)=>await Run("probe");connect.Click+=async(s,e)=>await Run("connect");
  var guide=new OceanButton{Text="查看接入说明"};OceanTheme.Place(canvas,guide,18,876,370,44);OceanTheme.Button(guide);
  guide.Click+=(s,e)=>{if(!preview){string file=Path.Combine(root,"QQ框架自行安装说明.txt");if(File.Exists(file))System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(file){UseShellExecute=true});}};
  var permissions=new OceanButton{Text="设置QQ回复白名单"};OceanTheme.Place(canvas,permissions,410,876,374,44);OceanTheme.Button(permissions);
  permissions.Click+=(s,e)=>{if(!preview)App.OpenConsole(root,"whitelist");};
  var installHint=new OceanButton{Text="复制给DeepSeek的安装说明"};OceanTheme.Place(canvas,installHint,18,936,370,44);OceanTheme.Button(installHint);
  installHint.Click+=(s,e)=>{if(!preview){Clipboard.SetText("请在目录 "+root+" 内安装我指定且有权使用的 OneBot v11 QQ框架。只从官方渠道获取并保留原始许可，不修改目录外的文件，不覆盖现有大肥鱼账号、密钥、记忆和记录。请先核对框架适用许可；安装完成后告诉我正式启动文件的位置、HTTP API和正向通用WebSocket的地址及认证设置。我会在大肥鱼连接QQ页面填入启动入口和接口，QQ账号由我本人登录。");status.Text="已复制安装说明。请自行粘贴到DeepSeek，指定框架并完成安装，再回本页检测。";}};
  var refresh=new OceanButton{Text="重新读取 / 检测框架"};OceanTheme.Place(canvas,refresh,410,936,374,44);OceanTheme.Button(refresh);refresh.Click+=async(s,e)=>await Run("read");

  OceanTheme.Label(canvas,"1. 自行或通过DeepSeek安装框架到本目录；缺少时可复制安装说明。\n2. 其他框架首次选择正式启动文件。开启HTTP API、正向通用WS和事件上报，填入实际地址和Token。\n3. 勾选随启动，点击“保存并连接QQ”；首次需在框架中本人登录QQ，等接口就绪后再连接。\n4. 在后台设置允许回复的私聊/群聊；模型未连接时，再点启动页的“一键启动”。",25,1000,750,118,10,false,OceanTheme.Muted);
  OceanTheme.Place(canvas,status,25,1130,750,144);status.Font=OceanTheme.Font(10);
  status.Text="Token留空保留原值；未单独设置WS Token时沿用HTTP Token。\n“测试接口”不会发送QQ消息。“保存并连接”会重载本机QQ桥接。";
  http.Text="http://127.0.0.1:3000";ws.Text="ws://127.0.0.1:3001";
  OceanTheme.Frame(this,"大肥鱼 · 连接QQ");Shown+=async(s,e)=>{if(!preview)await Run("read");};FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
 }
 async System.Threading.Tasks.Task<Dictionary<string,object>> Execute(string script,string args){
  var result=await App.Run(Path.Combine(root,script),args,null);
  if(result.Item1!=0){try{var failed=App.Object(result.Item2);throw new InvalidOperationException(App.Value(failed,"error",result.Item2.Trim()));}catch(InvalidOperationException){throw;}catch{throw new Exception(result.Item2.Trim());}}
  return App.Object(result.Item2);
 }
 async System.Threading.Tasks.Task Run(string action){
  if(preview||busy)return;busy=true;save.Enabled=probe.Enabled=connect.Enabled=false;string input=null;bool saved=false;
  try{
   string args="-Root "+App.Quote(root)+" -Action "+(action=="connect"?"save":action);
   if(action=="save"||action=="connect"){
    var directory=App.PrivateControlDirectory(Path.Combine(root,"runtime-control/gateway-input"));
    input=App.PrivateInput(new Dictionary<string,object>{{"httpUrl",http.Text.Trim()},{"wsUrl",ws.Text.Trim()},{"webUrl",web.Text.Trim()},{"accessToken",token.Text.Trim()},{"wsAccessToken",wsToken.Text.Trim()},{"clearTokens",clear.Checked},{"autoStart",autoStart.Checked},{"launcherPath",launcher.Text.Trim()}},directory);args+=" -SettingsFile "+App.Quote(input);
   }
   status.Text=action=="connect"?"正在保存接口、检查登录并连接QQ桥接…":"正在读取或检查QQ接口…";
   var data=await Execute("Manage-Gateway.ps1",args);
   officialMode=App.Value(data,"mode")=="official";
   if(officialMode){status.Text="当前使用腾讯官方QQ机器人。请点击顶部官方QQ入口填写凭据、测试并连接；原OneBot设置已保留。";return;}
   if(action=="read"||action=="save"||action=="connect"){
    http.Text=App.Value(data,"httpUrl",http.Text);ws.Text=App.Value(data,"wsUrl",ws.Text);web.Text=App.Value(data,"webUrl");autoStart.Checked=App.Flag(data,"autoStart");launcher.Text=App.Value(data,"launcherPath");frameworkState.Text=App.Value(data,"frameworkMessage")+(App.Value(data,"detectedLauncher").Length>0?"："+App.Value(data,"detectedLauncher"):"");token.Clear();wsToken.Clear();clear.Checked=false;saved=action!="read";
    status.Text=action=="save"?"配置已保存，点击“保存并连接QQ”应用到桥接。":"配置已读取；已有Token保持隐藏，留空保存会保留。";
   }
   if(action=="connect"){
    data=await Execute("Connect-QQBridge.ps1","-Root "+App.Quote(root)+" -Restart");
    if(!App.Flag(data,"ok"))throw new Exception(App.Value(data,"error","QQ桥接尚未就绪"));
    status.Text="QQ接口：已连接；QQ桥接：已连接。\n模型："+(App.Flag(data,"dshReady")?"已连接":"未连接，请回启动页点“一键启动”")+"。\n回复权限："+(App.Flag(data,"authorized")?"已有允许回复的会话；请确认你的测试账号在名单内":"尚未配置，请点击上方“设置QQ回复白名单”")+"。\n"+(App.Flag(data,"dshReady")&&App.Flag(data,"authorized")?"可以从已授权账号发一条消息验证实际收发。":"连接成功不代表已经满足自动回复条件，请按上面的提示完成设置。");
   }else if(action=="probe")status.Text=App.Flag(data,"ok")?"HTTP和正向WS已连到同一个QQ账号。\n下一步点“保存并连接QQ”，让大肥鱼的桥接建立实际连接。":App.Value(data,"error","框架尚未就绪");
  }catch(Exception error){status.Text=(saved?"配置已保存，连接尚未完成：\n":"操作未完成：\n")+error.Message;}
  finally{if(input!=null){try{File.Delete(input);Directory.Delete(Path.GetDirectoryName(input),false);}catch{}}busy=false;save.Enabled=probe.Enabled=connect.Enabled=!officialMode;}
 }
}
