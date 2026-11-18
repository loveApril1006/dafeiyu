using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Drawing;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class App {
  static Dictionary<string,HubForm> hubs=new Dictionary<string,HubForm>(StringComparer.OrdinalIgnoreCase);
  internal static HubForm Hub(string root,int page=0,bool start=false,bool preview=false){
    string key=Path.GetFullPath(root).TrimEnd('\\');HubForm form;
    if(!hubs.TryGetValue(key,out form)||form.IsDisposed){form=new HubForm(key,preview);hubs[key]=form;form.FormClosed+=(s,e)=>hubs.Remove(key);}
    form.SelectPage(page,start);return form;
  }
  internal static void OpenHub(string root,int page=0,bool start=false){var form=Hub(root,page,start);form.Show();form.BringToFront();form.Activate();}
  internal static void OpenConsole(string root,string view="models"){Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -STA -ExecutionPolicy Bypass -File "+Quote(Path.Combine(root,"Open-Console.ps1"))+" -Root "+Quote(root)+" -View "+Quote(view)){UseShellExecute=false,CreateNoWindow=true});}
  internal static JavaScriptSerializer Json=new JavaScriptSerializer();
  internal static string Root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
  internal static bool IsInstalledRoot(string root){
    return File.Exists(Path.Combine(root,"dafeiyu-install.json"))||File.Exists(Path.Combine(root,"xiaoge-install.json"))||File.Exists(Path.Combine(root,"Start-All.ps1"))||
      (File.Exists(Path.Combine(root,"Start-Stack.ps1"))&&File.Exists(Path.Combine(root,"qq-bridge/config.json")));
  }
  internal static bool OpensHome(string root,string[] args){
    if(args.Contains("--install"))return false;
    return args.Any(a=>a=="--home"||a=="--start"||a=="--settings"||a=="--backends")||IsInstalledRoot(root);
  }
  internal static bool IsAppControlFailure(string text){
    if(String.IsNullOrEmpty(text))return false;
    return new[]{"An Application Control policy has blocked this file","0x800711c7","0x11c7","智能应用控制","应用控制策略已阻止","应用程序控制策略已阻止"}.Any(value=>text.IndexOf(value,StringComparison.OrdinalIgnoreCase)>=0);
  }
  internal static bool IsAppControlFailure(Exception error){
    for(int depth=0;error!=null&&depth<16;depth++,error=error.InnerException){
      var native=error as System.ComponentModel.Win32Exception;
      if((native!=null&&native.NativeErrorCode==4551)||IsAppControlFailure(error.Message))return true;
    }
    return false;
  }
  internal static string DefaultInstallDirectory(){
    var ready=new List<DriveInfo>();
    foreach(var drive in DriveInfo.GetDrives())try{if(drive.IsReady&&drive.DriveType==DriveType.Fixed)ready.Add(drive);}catch{}
    return ChooseInstallDirectory(Path.GetPathRoot(Root),ready.OrderByDescending(d=>d.AvailableFreeSpace).Select(d=>d.Name).ToArray(),Path.GetPathRoot(Environment.SystemDirectory),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
  }
  internal static string ChooseInstallDirectory(string ownDrive,string[] fixedDrives,string systemDrive,string localData){
    var preferred=fixedDrives.Where(d=>!d.Equals(systemDrive,StringComparison.OrdinalIgnoreCase)).ToArray();
    string chosen=preferred.FirstOrDefault(d=>d.Equals(ownDrive,StringComparison.OrdinalIgnoreCase))??preferred.FirstOrDefault();
    return chosen!=null?Path.Combine(chosen,"DafeiyuFull"):Path.Combine(localData,"DafeiyuFull");
  }
  internal static string InstallDirectory(string value){
    if(String.IsNullOrWhiteSpace(value))throw new Exception("请选择安装目录；只有C盘也可以安装。");
    string full=Path.GetFullPath(value).TrimEnd('\\'),drive=Path.GetPathRoot(full);
    if(drive.StartsWith("\\\\"))throw new Exception("请选择本机磁盘上的安装目录。");
    if(full.Equals(drive.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new Exception("请选择独立文件夹，不能直接安装到磁盘根目录。");
    for(var current=new DirectoryInfo(full);current!=null;current=current.Parent)if(current.Exists&&(current.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("安装路径不能经过目录链接，请选择磁盘上的实际文件夹。");
    return full;
  }
  internal static string InstallControlDirectory(string target){
    string drive=Path.GetPathRoot(InstallDirectory(target));
    string parent=drive.Equals(Path.GetPathRoot(Environment.SystemDirectory),StringComparison.OrdinalIgnoreCase)?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"XiaogeInstallTemp"):Path.Combine(drive,"XiaogeInstallTemp");
    string fallback=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Xiaoge","InstallTemp");
    return InstallControlDirectoryCandidates(new[]{
      Path.Combine(Path.GetTempPath(),"XiaogeInstallControl"),
      fallback,
      Path.Combine(App.Root,".xiaoge-install-control"),
      parent
    });
  }
  internal static string InstallControlDirectoryAt(string preferred,string fallback){
    return InstallControlDirectoryCandidates(new[]{preferred,fallback});
  }
  internal static string InstallControlDirectoryCandidates(IEnumerable<string> candidates){
    var failures=new List<string>();
    foreach(string parent in candidates.Distinct(StringComparer.OrdinalIgnoreCase)){
      try{return PrivateControlDirectory(parent);}
      catch(Exception e){
        if(!(e is UnauthorizedAccessException)&&!(e is System.Security.SecurityException)&&!(e is IOException)&&!(e is NotSupportedException)&&!(e is InvalidOperationException))throw;
        failures.Add(parent+"："+e.GetType().Name+" / 0x"+e.HResult.ToString("X8")+" / "+e.Message);
      }
    }
    throw new InvalidOperationException("安装临时目录不可写；具体失败如下（可复制给维护者）：\r\n"+String.Join("\r\n",failures)+"\r\n未更改原安装位置。");
  }
  internal static string PrivateControlDirectory(string parent){
    string directory=InstallDirectory(Path.Combine(parent,Guid.NewGuid().ToString("N")));
    var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
    bool created=false;string step="创建空目录";
    try{
      Directory.CreateDirectory(directory);created=true;
      step="设置私有权限";Directory.SetAccessControl(directory,acl);
      step="验证私有权限";VerifyPrivateControlDirectory(directory);
      step="验证写入";string probe=Path.Combine(directory,"write-check.tmp");
      using(var stream=new FileStream(probe,FileMode.CreateNew,FileAccess.Write,FileShare.None)){stream.WriteByte(1);}
      File.Delete(probe);return directory;
    }catch(Exception error){
      if(created)try{Directory.Delete(directory,false);}catch{}
      throw new IOException(step+"失败："+error.Message,error);
    }
  }
  internal static void VerifyPrivateControlDirectory(string directory){
    var actual=Directory.GetAccessControl(directory);bool fullControl=false;
    if(!actual.AreAccessRulesProtected)throw new IOException("临时目录仍继承外部权限，未写入安装密码。");
    foreach(FileSystemAccessRule rule in actual.GetAccessRules(true,true,typeof(SecurityIdentifier))){
      if(!rule.IdentityReference.Equals(WindowsIdentity.GetCurrent().User))throw new IOException("临时目录存在其他用户权限，未写入安装密码。");
      if(rule.AccessControlType==AccessControlType.Allow&&(rule.FileSystemRights&FileSystemRights.FullControl)==FileSystemRights.FullControl)fullControl=true;
    }
    if(!fullControl)throw new IOException("当前用户没有临时目录完整权限，未写入安装密码。");
  }
  internal static string Quote(string text){if(text.IndexOfAny(new[]{'"','\r','\n'})>=0)throw new Exception("路径含有无效字符");return "\""+text.TrimEnd('\\')+"\"";}
  internal static string PrivateInput(object data,string directory=null){
    string file=Path.Combine(directory??Path.GetTempPath(),"xiaoge-"+Guid.NewGuid().ToString("N")+".json");
    if(directory!=null){
      VerifyPrivateControlDirectory(directory);
      using(var stream=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(stream,new UTF8Encoding(false)))writer.Write(Json.Serialize(data));
      return file;
    }
    var acl=new FileSecurity();acl.SetAccessRuleProtection(true,false);acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,AccessControlType.Allow));
    using(var stream=new FileStream(file,FileMode.CreateNew,FileSystemRights.FullControl,FileShare.None,4096,FileOptions.None,acl))using(var writer=new StreamWriter(stream,new UTF8Encoding(false)))writer.Write(Json.Serialize(data));return file;
  }
  internal static Task<Tuple<int,string>> Run(string script,string args,Action<string> line,string temporaryDirectory=null){
    var completion=new TaskCompletionSource<Tuple<int,string>>();var output=new StringBuilder();var sync=new object();var info=new ProcessStartInfo("powershell.exe","-NoProfile -STA -ExecutionPolicy Bypass -File "+Quote(script)+" "+args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};info.EnvironmentVariables["PYTHONUTF8"]="1";
    if(temporaryDirectory!=null){info.EnvironmentVariables["TEMP"]=temporaryDirectory;info.EnvironmentVariables["TMP"]=temporaryDirectory;}
    var p=new Process{StartInfo=info,EnableRaisingEvents=true};DataReceivedEventHandler receive=(s,e)=>{if(e.Data==null)return;lock(sync)output.AppendLine(e.Data);if(line!=null)line(e.Data);};p.OutputDataReceived+=receive;p.ErrorDataReceived+=receive;
    p.Exited+=async(s,e)=>{int code=p.ExitCode;await Task.Delay(200);string text;lock(sync)text=output.ToString();completion.TrySetResult(Tuple.Create(code,text));p.Dispose();};try{p.Start();p.BeginOutputReadLine();p.BeginErrorReadLine();}catch(Exception ex){p.Dispose();completion.TrySetException(ex);}return completion.Task;
  }
  internal static Dictionary<string,object> Object(string text){string json=text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries).LastOrDefault(x=>x.TrimStart().StartsWith("{"));if(json==null)throw new Exception(text.Trim().Length>0?text.Trim():"设置程序没有返回结果");return Json.Deserialize<Dictionary<string,object>>(json);}
  internal static string Value(Dictionary<string,object> data,string key,string fallback=""){object value;return data.TryGetValue(key,out value)?Convert.ToString(value):fallback;}
  internal static bool Flag(Dictionary<string,object> data,string key){object value;return data.TryGetValue(key,out value)&&Convert.ToBoolean(value);}
  internal static void OpenFolder(string folder){Process.Start(new ProcessStartInfo(folder){UseShellExecute=true});}
  internal static void OpenQQ(string root){if(File.Exists(Path.Combine(root,"external-qq-gateway.json"))){Gateway(root);return;}Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -STA -ExecutionPolicy Bypass -File "+Quote(Path.Combine(root,"Open-QQ.ps1"))+" -Root "+Quote(root)){UseShellExecute=false,CreateNoWindow=true});}
  internal static void Gateway(string root,bool preview=false){using(var form=new GatewayForm(root,preview))form.ShowDialog();}
  internal static string AIUrl(string root){
    string file=Path.Combine(root,"logs/engine.log"),text;
    if(!File.Exists(file))throw new Exception("聊天引擎尚未就绪，请先点击启动，稍候再登录AI账号。");
    // Start-Process keeps stdout open for writing. Allow that writer and log rotation.
    using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){
      if(stream.Length>1048576)stream.Seek(-1048576,SeekOrigin.End);
      using(var reader=new StreamReader(stream,Encoding.UTF8,true))text=reader.ReadToEnd();
    }
    var matches=System.Text.RegularExpressions.Regex.Matches(text,@"(?m)^\s*dsh web: (http://127\.0\.0\.1:17860/\?token=[A-Za-z0-9_-]{16,})\s*$");
    if(matches.Count==0)throw new Exception("聊天引擎尚未就绪，请先点击启动，稍候再登录AI账号。");
    return matches[matches.Count-1].Groups[1].Value;
  }
  internal static void OpenAI(string root){Process.Start(new ProcessStartInfo(AIUrl(root)){UseShellExecute=true});}
  internal static void Preview(Form form,string path){form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-12000,-12000);form.Show();Application.DoEvents();using(var image=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(image,new Rectangle(Point.Empty,form.Size));image.Save(path,System.Drawing.Imaging.ImageFormat.Png);}form.Close();}
  [STAThread] static void Main(string[] args){
    Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);OceanTheme.PreviewMode=args.Any(a=>a=="--preview"||a.EndsWith("-preview",StringComparison.Ordinal));
    if(args.Length==2&&args[0]=="--preview"){Preview(new Installer(),args[1]);return;}
    if(args.Length==2&&args[0]=="--authorization-preview"){Preview(new InstallPasswordForm(),args[1]);return;}
    if(args.Length==2&&args[0]=="--app-control-preview"){Preview(new AppControlHelpForm(),args[1]);return;}
    if(args.Length==2&&args[0]=="--settings-preview"){Preview(new SettingsForm(Root,true),args[1]);return;}
    if(args.Length==2&&args[0]=="--backends-preview"){Preview(new BackendsForm(Root,true),args[1]);return;}
    if(args.Length==2&&args[0]=="--gateway-preview"){Preview(new GatewayForm(Root,true),args[1]);return;}
    if(args.Length==2&&args[0]=="--hub-settings-preview"){Preview(Hub(Root,1,false,true),args[1]);return;}
    if(args.Length==2&&args[0]=="--hub-backends-preview"){Preview(Hub(Root,2,false,true),args[1]);return;}
    if(args.Length==2&&args[0]=="--hub-preview"){Preview(Hub(Root,0,false,true),args[1]);return;}
    if(OpensHome(Root,args)||Path.GetFileNameWithoutExtension(Application.ExecutablePath)=="大肥鱼完整版后台管理"){
      int page=args.Contains("--settings")?1:args.Contains("--backends")?2:0;
      Application.Run(Hub(Root,page,args.Contains("--start")));return;
    }
    Application.Run(new Installer());
  }
}

class AppControlHelpForm:Form {
  internal const string SettingsPath="Windows 安全中心 → 应用和浏览器控制 → 智能应用控制设置";
  internal const string RetryInstruction="处理完成后，重新运行安装器，选择原安装目录重新安装。";
  internal static string Instructions {
    get{return "Windows 应用控制阻止了安装所需的运行组件，本次安装尚未完成。\r\n\r\n请打开："+SettingsPath+"\r\n\r\n查看 Windows 拦截提示，根据系统提示自行决定是否调整设置。\r\n关闭会降低整机对不受信任应用的保护，部分系统关闭后无法直接重新开启，请先阅读 Windows 提示。\r\n\r\n"+RetryInstruction+"\r\n单位管理的电脑或设置无法修改时，请联系管理员。";}
  }
  internal AppControlHelpForm(){
    Text="大肥鱼安装 · Windows 应用控制提示";ClientSize=new Size(630,490);Font=new Font("Microsoft YaHei UI",10);StartPosition=FormStartPosition.CenterParent;FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;BackColor=Color.FromArgb(248,250,255);
    Controls.Add(new Label{Text="Windows 阻止了安装所需的组件",Location=new Point(26,22),Size=new Size(578,34),Font=new Font(Font.FontFamily,16,FontStyle.Bold)});
    Controls.Add(new Label{Text="本次安装尚未完成。请先检查系统拦截提示，再重新安装。",Location=new Point(28,68),Size=new Size(574,26)});
    var panel=new Panel{Location=new Point(28,110),Size=new Size(574,94),BackColor=Color.FromArgb(232,240,255)};
    panel.Controls.Add(new Label{Text="请打开以下设置",Location=new Point(14,10),Size=new Size(544,23),ForeColor=Color.FromArgb(49,83,157)});
    panel.Controls.Add(new Label{Text="Windows 安全中心 → 应用和浏览器控制 →\r\n智能应用控制设置",Location=new Point(14,36),Size=new Size(544,48),Font=new Font(Font.FontFamily,11,FontStyle.Bold)});Controls.Add(panel);
    Controls.Add(new Label{Text="查看 Windows 的拦截提示，根据系统提示自行决定是否调整设置。",Location=new Point(28,222),Size=new Size(574,43)});
    Controls.Add(new Label{Text="关闭会降低整机对不受信任应用的保护；部分系统关闭后无法直接重新开启，请先阅读 Windows 提示。",Location=new Point(28,271),Size=new Size(574,57),ForeColor=Color.FromArgb(135,81,20)});
    Controls.Add(new Label{Text=RetryInstruction,Location=new Point(28,343),Size=new Size(574,44),Font=new Font(Font.FontFamily,10,FontStyle.Bold)});
    Controls.Add(new Label{Text="单位管理的电脑或设置无法修改时，请联系管理员。原始错误保留在安装日志中。",Location=new Point(28,390),Size=new Size(574,40),ForeColor=Color.DimGray});
    var copy=new OceanButton{Text="复制处理步骤",Location=new Point(324,440),Size=new Size(132,34)};copy.Click+=(s,e)=>Clipboard.SetText(Instructions);Controls.Add(copy);
    var close=new OceanButton{Text="知道了",Location=new Point(470,440),Size=new Size(132,34),BackColor=Color.FromArgb(56,106,210),ForeColor=Color.White,DialogResult=DialogResult.OK};Controls.Add(close);AcceptButton=close;CancelButton=close;
  }
}

static class InstallAuthorization {
  internal static bool Verify(string password){
    if(String.IsNullOrEmpty(password)||password.Length>256)return false;
    byte[] expected=Convert.FromBase64String("jpSi1tbOkAMoTQfpfVOjQfRQ578Br8gxjW6MaBxY0pQ="),actual;
    using(var derive=new Rfc2898DeriveBytes(password,Convert.FromBase64String("yjqb2mYvtqHMpv4SuvVtmQ=="),120000))actual=derive.GetBytes(expected.Length);
    int difference=0;for(int i=0;i<expected.Length;i++)difference|=expected[i]^actual[i];Array.Clear(actual,0,actual.Length);return difference==0;
  }
}

class InstallPasswordForm:Form {
  TextBox password=new TextBox();Label message=new Label();
  internal string Password{get{return password.Text;}}
  internal void ClearPassword(){password.Clear();}
  internal InstallPasswordForm(){
    Text="大肥鱼完整版 · 安装授权";ClientSize=new Size(470,235);Font=new Font("Microsoft YaHei UI",10);StartPosition=FormStartPosition.CenterParent;FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;BackColor=Color.FromArgb(248,250,255);
    Controls.Add(new Label{Text="请输入安装授权密码",Font=new Font(Font.FontFamily,14,FontStyle.Bold),AutoSize=true,Location=new Point(24,21)});
    Controls.Add(new Label{Text="密码区分大小写，请向安装包提供者获取。",AutoSize=true,Location=new Point(24,59)});
    password.UseSystemPasswordChar=true;password.MaxLength=256;password.SetBounds(24,91,422,30);Controls.Add(password);
    message.SetBounds(24,132,422,30);message.ForeColor=Color.Firebrick;Controls.Add(message);
    var confirm=new OceanButton{Text="验证并安装",Location=new Point(218,180),Size=new Size(110,34)};
    confirm.Click+=(s,e)=>{if(!InstallAuthorization.Verify(password.Text)){message.Text="密码不正确，请重新输入。";password.Clear();password.Focus();return;}DialogResult=DialogResult.OK;Close();};Controls.Add(confirm);
    var cancel=new OceanButton{Text="取消",DialogResult=DialogResult.Cancel,Location=new Point(340,180),Size=new Size(106,34)};Controls.Add(cancel);AcceptButton=confirm;CancelButton=cancel;Shown+=(s,e)=>password.Focus();
  }
}

class BackendsForm:OceanForm {
  readonly string root;readonly bool preview;TextBox bridgeKey=new TextBox(),qqKey=new TextBox();Label status=new Label();bool backendBusy;Timer poll=new Timer();Dictionary<string,Label> serviceLabels=new Dictionary<string,Label>();Dictionary<string,TextBox> addressBoxes=new Dictionary<string,TextBox>();Dictionary<string,Button> startButtons=new Dictionary<string,Button>(),stopButtons=new Dictionary<string,Button>();
  internal BackendsForm(string path,bool screenshot){
    root=path;preview=screenshot;Text="大肥鱼完整版 · 后台管理与密码";ClientSize=new Size(700,610);Font=new Font("Microsoft YaHei UI",10);StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;BackColor=Color.FromArgb(248,250,255);
    Controls.Add(new Label{Text="后台网址与登录凭据",Font=new Font(Font.FontFamily,18,FontStyle.Bold),AutoSize=true,Location=new Point(26,20)});
    Controls.Add(new Label{Text="从这里打开后台、复制登录凭据，或分别启动和关闭服务。",AutoSize=true,Location=new Point(28,66)});
    Row("桥接控制台 / 模型与账号","http://127.0.0.1:3100/",bridgeKey,107,()=>OpenConsole());
    ServiceRow("bridge",214);
    Row("QQ框架后台","http://127.0.0.1:5099/",qqKey,280,()=>App.OpenQQ(root));
    ServiceRow("qq",387);
    var show=new CheckBox{Text="显示登录令牌和密码",AutoSize=true,Location=new Point(28,446)};show.CheckedChanged+=(s,e)=>{bridgeKey.UseSystemPasswordChar=qqKey.UseSystemPasswordChar=!show.Checked;};Controls.Add(show);
    status.Text="可分别启动、关闭两个后台。关闭会保存状态；QQ连接会暂时断开。";status.SetBounds(28,482,644,60);Controls.Add(status);
    Button("查看登录信息文件",28,560,202,()=>{string file=Path.Combine(root,"后台登录信息.txt");if(!File.Exists(file))throw new Exception("登录信息文件尚未生成，请检查安装是否完成。");Process.Start(new ProcessStartInfo(file){UseShellExecute=true});});
    Button("安装文件夹",249,560,202,()=>App.OpenFolder(root));Button("刷新凭据与状态",470,560,202,()=>{LoadKeys();var task=ControlBackend("status","bridge");});LoadKeys();
    poll.Interval=6000;poll.Tick+=async(s,e)=>await ControlBackend("status","bridge");Shown+=async(s,e)=>{if(!preview){await ControlBackend("status","bridge");poll.Start();}};FormClosed+=(s,e)=>{poll.Stop();poll.Dispose();};OceanTheme.Backends(this);
  }
  void Button(string text,int x,int y,int width,Action action){var button=new OceanButton{Text=text,Location=new Point(x,y),Size=new Size(width,32)};button.Click+=(s,e)=>{try{if(!preview)action();}catch(Exception ex){status.Text=ex.Message;}};Controls.Add(button);}
  void Row(string title,string url,TextBox key,int y,Action open){Controls.Add(new Label{Text=title,AutoSize=true,Font=new Font(Font,FontStyle.Bold),Location=new Point(28,y)});var address=new TextBox{Text=url,ReadOnly=true,Location=new Point(28,y+30),Size=new Size(430,29)};addressBoxes[title.Contains("QQ")?"qq":"bridge"]=address;Controls.Add(address);Button("打开后台",474,y+29,198,open);key.SetBounds(28,y+68,430,29);key.ReadOnly=true;key.UseSystemPasswordChar=true;Controls.Add(key);Button("复制登录凭据",474,y+67,198,()=>{if(String.IsNullOrEmpty(key.Text))throw new Exception("尚未生成登录凭据，请检查安装。");Clipboard.SetText(key.Text);status.Text="已复制对应后台的登录凭据，打开网页后粘贴即可。";});}
  void LoadKeys(){try{if(preview){bridgeKey.Text="preview-console-token-0123456789";qqKey.Text="PreviewOnly!123";return;}string infoFile=Path.Combine(root,"安装信息.json");var info=File.Exists(infoFile)?App.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(infoFile,Encoding.UTF8)):new Dictionary<string,object>();qqKey.Text=App.Value(info,"qqWebPassword");var cfg=App.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"qq-bridge/config.json"),Encoding.UTF8));bridgeKey.Text=App.Value(cfg,"consoleToken").Trim();string tokenFile=Path.Combine(root,"qq-bridge/state/console-token");if(bridgeKey.Text.Length==0&&File.Exists(tokenFile))bridgeKey.Text=File.ReadAllText(tokenFile,Encoding.UTF8).Trim();if(bridgeKey.Text.Length==0)bridgeKey.Text=App.Value(info,"consoleToken");}catch(Exception ex){status.Text="无法读取本机凭据："+ex.Message;}}
  void ServiceRow(string service,int y){var label=new Label{Text=preview?"状态：运行中":"状态：检测中…",Location=new Point(28,y+7),Size=new Size(430,28)};serviceLabels[service]=label;Controls.Add(label);var start=new OceanButton{Text="启动",Location=new Point(474,y),Size=new Size(94,34)};var stop=new OceanButton{Text="关闭",Location=new Point(578,y),Size=new Size(94,34)};start.Click+=async(s,e)=>await ControlBackend("start",service);stop.Click+=async(s,e)=>await ControlBackend("stop",service);startButtons[service]=start;stopButtons[service]=stop;Controls.Add(start);Controls.Add(stop);}
  async Task ControlBackend(string action,string service){if(preview||backendBusy||IsDisposed)return;backendBusy=true;foreach(var b in startButtons.Values.Concat(stopButtons.Values))b.Enabled=false;if(action!="status")status.Text=action=="start"?"正在启动后台，请稍候…":"正在保存状态并关闭后台…";try{var result=await App.Run(Path.Combine(root,"Manage-Backends.ps1"),"-Root "+App.Quote(root)+" -Action "+action+" -Service "+service,null);if(IsDisposed)return;var data=App.Object(result.Item2);if(!App.Flag(data,"ok"))throw new Exception(App.Value(data,"error","操作失败"));foreach(string name in new[]{"bridge","qq"}){var state=(Dictionary<string,object>)data[name];serviceLabels[name].Text="状态："+App.Value(state,"label");if(App.Flag(state,"external")){addressBoxes[name].Text=App.Value(state,"url","请在QQ框架连接中填写");startButtons[name].Enabled=false;stopButtons[name].Enabled=false;continue;}addressBoxes[name].Text="http://127.0.0.1:"+App.Value(state,"port",name=="qq"?"5099":"3100")+"/";startButtons[name].Enabled=!App.Flag(state,"running")||!App.Flag(state,"ready");stopButtons[name].Enabled=App.Flag(state,"running")&&!App.Flag(state,"foreign");}if(action!="status")status.Text=action=="start"?"本套后台操作已完成；外部QQ框架请自行启动。":"后台已关闭。再次点击“启动”即可恢复。";}catch(Exception ex){if(!IsDisposed){status.Text=ex.Message;foreach(var b in startButtons.Values.Concat(stopButtons.Values))b.Enabled=true;}}finally{backendBusy=false;}}
  void OpenConsole(){if(String.IsNullOrEmpty(bridgeKey.Text))throw new Exception("尚未生成控制台令牌，请先完成安装。");Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -STA -ExecutionPolicy Bypass -File "+App.Quote(Path.Combine(root,"Open-Console.ps1"))+" -Root "+App.Quote(root)){UseShellExecute=false,CreateNoWindow=true});status.Text="正在检查并打开本安装的控制台；尚未启动时会显示提示。";}
}

class ModelPanel:Panel {
  internal ComboBox kind=new ComboBox();internal TextBox endpoint=new TextBox(),model=new TextBox(),key=new TextBox();Label hint=new Label();readonly string[] codes={"deepseek","siliconflow","custom","account"};internal string Kind{get{return codes[Math.Max(0,kind.SelectedIndex)];}}
  internal ModelPanel(){Size=new Size(606,234);Font=new Font("Microsoft YaHei UI",10);Label("模型服务",0,8);kind.DropDownStyle=ComboBoxStyle.DropDownList;kind.Items.AddRange(new object[]{"DeepSeek 官方 API","硅基流动 API","自定义兼容接口","DeepSeek 账号登录"});kind.SetBounds(110,2,496,31);Controls.Add(kind);Label("接口地址",0,55);endpoint.SetBounds(110,48,496,29);Controls.Add(endpoint);Label("模型名称",0,101);model.SetBounds(110,94,496,29);Controls.Add(model);Label("API 密钥",0,147);key.SetBounds(110,140,405,29);key.UseSystemPasswordChar=true;Controls.Add(key);var show=new CheckBox{Text="显示",AutoSize=true,Location=new Point(526,143)};show.CheckedChanged+=(s,e)=>key.UseSystemPasswordChar=!show.Checked;Controls.Add(show);hint.ForeColor=Color.DimGray;hint.SetBounds(110,180,496,49);Controls.Add(hint);
    kind.SelectedIndexChanged+=(s,e)=>{key.Clear();bool account=Kind=="account";endpoint.Enabled=key.Enabled=show.Enabled=!account;endpoint.Text=Kind=="siliconflow"?"https://api.siliconflow.cn/v1":account?"":"https://api.deepseek.com";model.Text=Kind=="siliconflow"?"moonshotai/Kimi-K2.7-Code":"deepseek-flash";hint.Text=account?"无需API密钥。优先复用本机Harness已登录账号，也可手动登录。":"安装后可从“大肥鱼完整版设置”修改。留空保留此平台已存密钥。";};kind.SelectedIndex=0;}
  void Label(string text,int x,int y){Controls.Add(new Label{Text=text,AutoSize=true,Location=new Point(x,y)});}
  internal Dictionary<string,object> Data(string owner,bool qq){return new Dictionary<string,object>{{"kind",Kind},{"baseUrl",endpoint.Text.Trim()},{"model",model.Text.Trim()},{"apiKey",Kind=="account"?"":key.Text.Trim()},{"owner",owner.Trim()},{"qqEnabled",qq}};}
  internal void LoadData(Dictionary<string,object> data){kind.SelectedIndex=Math.Max(0,Array.IndexOf(codes,App.Value(data,"kind","deepseek")));endpoint.Text=App.Value(data,"baseUrl",endpoint.Text);model.Text=App.Value(data,"model",model.Text);key.Clear();hint.Text=App.Flag(data,"hasKey")?"此平台已有密钥，已隐藏；留空保存会保留原密钥。":Kind=="account"?"账号模式无需密钥。":"尚未设置密钥；可以粘贴后测试连接。";}
}

static class ReleaseNotice {
  internal const string Copyright="qq-bridge 与 dsh-pet 的著作权归各自原作者所有。";
  internal const string Usage="本整合版仅添加功能与插件；严禁倒卖和商业使用，仅供个人娱乐。";
  internal const string Text="版权与使用声明\nqq-bridge 著作权归 Derpyu520 及 qq-bridge / QSH 贡献者所有。\ndsh-pet 著作权归 PC2005-cloud 所有，依 MIT 许可使用。\n本整合版仅在功能层面添加插件并进行使用集成，不主张上述项目的著作权，亦非原作者官方发行。\n本整合版严禁倒卖和商业使用，仅供个人娱乐。\n新版发行包不内置QQ框架；请自行从框架官方下载安装、接受协议并登录，再填写OneBot v11接口连接。本程序不会自动下载、注入或部署框架。\n第三方软件、插件、模型与素材的权利和使用条件遵循各自原始许可及协议；自行下载不代表获得商业或再分发授权；本声明不改变原作者的授权。";
}

class Installer:OceanForm {
  ComboBox knownInstallations=new ComboBox();Label installMode=new Label();bool discoveryReady,syncingDiscovery;
  void InitializeInstallDetection(){
    if(discoveryReady)return;discoveryReady=true;
    foreach(Control c in Controls)if(c.Top>=334)c.Top+=86;
    knownInstallations.SetBounds(138,322,496,30);knownInstallations.DropDownStyle=ComboBoxStyle.DropDownList;
    Controls.Add(new Label{Text="安装方式",AutoSize=true,Location=new Point(28,327)});Controls.Add(knownInstallations);
    knownInstallations.Items.Add("新安装（选择空目录）");foreach(var item in InstallationDiscovery.Discover())knownInstallations.Items.Add(item);
    installMode.SetBounds(138,360,496,45);installMode.ForeColor=Color.FromArgb(30,104,80);Controls.Add(installMode);
    knownInstallations.SelectedIndexChanged+=(s,e)=>{if(syncingDiscovery)return;var item=knownInstallations.SelectedItem as ExistingInstallation;folder.Text=item!=null?item.Root:App.DefaultInstallDirectory();RefreshInstallMode();};
    folder.TextChanged+=(s,e)=>RefreshInstallMode();knownInstallations.SelectedIndex=knownInstallations.Items.Count>1?1:0;
    AutoScrollMinSize=new Size(0,1014);RefreshInstallMode();
  }
  void RefreshInstallMode(){
    if(!discoveryReady)return;var found=InstallationDiscovery.Inspect(folder.Text);bool updating=found.Installed&&found.Error.Length==0;
    var selected=knownInstallations.SelectedItem as ExistingInstallation;
    if(updating&&(selected==null||!selected.Root.Equals(found.Root,StringComparison.OrdinalIgnoreCase))){int index=-1;for(int i=1;i<knownInstallations.Items.Count;i++)if(((ExistingInstallation)knownInstallations.Items[i]).Root.Equals(found.Root,StringComparison.OrdinalIgnoreCase)){index=i;break;}if(index<0)index=knownInstallations.Items.Add(found);syncingDiscovery=true;knownInstallations.SelectedIndex=index;syncingDiscovery=false;}
    else if(!updating&&selected!=null){syncingDiscovery=true;knownInstallations.SelectedIndex=0;syncingDiscovery=false;}
    installMode.Text=found.Error.Length>0?found.Error:updating?(found.Resume?"检测到中断更新：先恢复，再保留数据更新。":"已检测到旧安装：保留原账号、模型配置、记忆和记录更新。无需重新填写密钥。"):"未检测到已有安装：首次安装并生成这台电脑的独立配置。";
    fields.Enabled=!busy&&!updating;qq.Enabled=!busy&&!updating;owner.Enabled=!busy&&!updating&&qq.Checked;
    knownInstallations.Enabled=!busy;install.Enabled=!busy&&found.Error.Length==0;install.Text=updating?"保留数据更新 / 修复":"开始首次安装";
  }

  TextBox folder=new TextBox(),owner=new TextBox(),log=new TextBox();CheckBox qq=new CheckBox();ModelPanel fields=new ModelPanel();Button install=new OceanButton(),browse=new OceanButton(),settings=new OceanButton(),login=new OceanButton(),stop=new OceanButton();Label status=new Label();ProgressBar bar=new ProgressBar();bool busy,closeAfterStop;string installFailure="",cancelSignal="";
  protected override void OnLoad(EventArgs e){
    base.OnLoad(e);Controls.Remove(qq);
    foreach(Control c in Controls)if(c is Label&&c.Text=="安装需要授权密码；QQ框架请自行下载安装并登录。")c.Visible=false;
    Controls.Add(new Label{Text="QQ框架需自行从官方下载安装、启动并登录。",AutoSize=true,ForeColor=Color.DimGray,Location=new Point(28,385)});
    Controls.Add(new Label{Text="主动联系仅发给管理员；可现在填写QQ，也可装后在后台设置。",AutoSize=true,ForeColor=Color.DimGray,Location=new Point(28,462)});
    ApplyReleaseNotice();
    InitializeInstallDetection();
    OceanTheme.Installer(this,folder,knownInstallations,installMode,fields,qq,owner,browse,install,stop,bar,status,log,settings,login);
  }
  bool noticeApplied;
  void ApplyReleaseNotice(){
    if(noticeApplied)return;noticeApplied=true;SuspendLayout();
    const int offset=188;
    foreach(Control control in Controls)if(control.Top>=90)control.Top+=offset;
    var box=new GroupBox{Text="使用声明与后续维护",Location=new Point(28,86),Size=new Size(606,180)};
    var message=new TextBox{Text=ReleaseNotice.Text.Replace("\n",Environment.NewLine),Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,BorderStyle=BorderStyle.None,BackColor=BackColor,Font=new Font(Font.FontFamily,9.5f),Location=new Point(12,24),Size=new Size(582,144),TabStop=true};
    box.Controls.Add(message);Controls.Add(box);
    AutoScroll=true;AutoScrollMinSize=new Size(0,928);
    ClientSize=new Size(662,Math.Min(928,Math.Max(540,Screen.FromControl(this).WorkingArea.Height-90)));
    ResumeLayout(true);CenterToScreen();
  }
  internal Installer(){Text="大肥鱼完整版 v31 海洋主题 · 新安装 / 保留数据更新";ClientSize=new Size(662,740);Font=new Font("Microsoft YaHei UI",10);StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;BackColor=Color.FromArgb(248,250,255);Controls.Add(new Label{Text="安装大肥鱼完整版",Font=new Font(Font.FontFamily,18,FontStyle.Bold),AutoSize=true,Location=new Point(26,18)});Controls.Add(new Label{Text="含全部功能；采用配置基线，新用户填写自己的账号与密钥。",AutoSize=true,Location=new Point(28,60)});Controls.Add(new Label{Text="安装位置",AutoSize=true,Location=new Point(28,105)});folder.SetBounds(138,98,390,29);folder.Text=App.DefaultInstallDirectory();Controls.Add(folder);browse.Text="选择…";browse.SetBounds(538,97,96,31);browse.Click+=(s,e)=>{using(var d=new FolderBrowserDialog()){d.Description="选择安装目录（优先非C盘，只有C盘也可安装）";if(d.ShowDialog()==DialogResult.OK)folder.Text=d.SelectedPath;}};Controls.Add(browse);fields.Location=new Point(28,146);Controls.Add(fields);qq.Text="启用 QQ（框架自行下载安装）";qq.Checked=true;qq.AutoSize=true;qq.Location=new Point(138,385);qq.CheckedChanged+=(s,e)=>owner.Enabled=qq.Checked;Controls.Add(qq);Controls.Add(new Label{Text="管理员 QQ",AutoSize=true,Location=new Point(28,431)});owner.SetBounds(138,424,220,29);Controls.Add(owner);Controls.Add(new Label{Text="安装需要授权密码；QQ框架请自行下载安装并登录。",AutoSize=true,ForeColor=Color.DimGray,Location=new Point(138,462)});install.Text="开始一键安装";install.SetBounds(28,500,402,44);install.Font=new Font(Font.FontFamily,12,FontStyle.Bold);install.BackColor=Color.FromArgb(56,106,210);install.ForeColor=Color.White;install.Click+=async(s,e)=>await Install();Controls.Add(install);stop.Text="停止安装";stop.SetBounds(442,500,192,44);stop.Enabled=false;stop.Click+=(s,e)=>RequestStop(false);Controls.Add(stop);bar.SetBounds(28,560,606,12);Controls.Add(bar);status.Text="优先安装到非C盘；只有C盘也可安装。\n新安装采用本包默认设置；覆盖更新保留原设置、账号与记录。";status.SetBounds(28,587,606,42);Controls.Add(status);log.Multiline=true;log.ReadOnly=true;log.ScrollBars=ScrollBars.Vertical;log.SetBounds(28,635,606,46);Controls.Add(log);settings.Text="打开大肥鱼完整版设置";settings.SetBounds(28,694,194,31);settings.Enabled=false;settings.Click+=(s,e)=>App.OpenHub(folder.Text,1);Controls.Add(settings);login.Text="启动 / 登录QQ";login.SetBounds(234,694,194,31);login.Enabled=false;login.Click+=(s,e)=>{try{App.OpenQQ(folder.Text);}catch(Exception ex){status.Text=ex.Message;}};Controls.Add(login);var open=new OceanButton{Text="后台网址 / 密码",Location=new Point(440,694),Size=new Size(194,31)};open.Click+=(s,e)=>App.OpenHub(folder.Text,2);Controls.Add(open);FormClosing+=(s,e)=>{if(busy){e.Cancel=true;RequestStop(true);}};}
  void Line(string text){if(IsDisposed)return;BeginInvoke(new Action(()=>{string safe=fields.key.Text.Length>0?text.Replace(fields.key.Text,"[密钥已隐藏]"):text;var parts=safe.Split(new[]{'|'},3);if(parts.Length==3&&parts[0]=="STATUS"){int n;if(Int32.TryParse(parts[1],out n))bar.Value=Math.Max(bar.Value,Math.Max(0,Math.Min(100,n)));status.Text=parts[2];}else if(safe.StartsWith("ERROR|")){installFailure=safe.Substring(6);status.Text=installFailure;log.AppendText(installFailure+Environment.NewLine);}else{if(log.TextLength>15000)log.Clear();log.AppendText(safe+Environment.NewLine);}}));}
  internal void RequestStop(bool close){
    if(!busy)return;closeAfterStop|=close;
    try{if(cancelSignal.Length>0)File.WriteAllText(cancelSignal,"cancel",new UTF8Encoding(false));stop.Enabled=false;status.Text="正在停止安装；当前配置或系统组件写入完成后会退出。";}
    catch(Exception ex){status.Text="无法提交停止请求："+ex.Message;}
  }
  async Task Install(){
    if(busy)return;long id;
    if(qq.Checked&&owner.Text.Trim().Length>0&&(!Int64.TryParse(owner.Text.Trim(),out id)||id<=0||owner.Text.Trim().Length<5||owner.Text.Trim().Length>12)){status.Text="管理员QQ格式不正确，也可留空。";return;}
    string script=Path.Combine(App.Root,"工具/Install.ps1"),input=null,control=null;
    if(!File.Exists(script)){status.Text="请完整解压安装包后运行。";return;}
    try{
      folder.Text=App.InstallDirectory(folder.Text);
      using(var authorization=new InstallPasswordForm()){
        if(authorization.ShowDialog(this)!=DialogResult.OK){status.Text="已取消安装。";return;}
        control=App.InstallControlDirectory(folder.Text);cancelSignal=Path.Combine(control,"cancel.request");
        var data=InstallationDiscovery.Inspect(folder.Text).Installed?new Dictionary<string,object>():fields.Data(owner.Text,qq.Checked);data["installPassword"]=authorization.Password;
        input=App.PrivateInput(data,control);authorization.ClearPassword();data.Remove("installPassword");
      }
      busy=true;closeAfterStop=false;stop.Enabled=true;knownInstallations.Enabled=false;ScrollControlIntoView(stop);
      install.Enabled=browse.Enabled=folder.Enabled=fields.Enabled=owner.Enabled=qq.Enabled=settings.Enabled=login.Enabled=false;
      bar.Visible=true;bar.Value=0;installFailure="";status.Text="正在准备安装，检查目录与磁盘空间…";
      var result=await App.Run(script,"-SourceRoot "+App.Quote(App.Root)+" -TargetRoot "+App.Quote(folder.Text)+" -SettingsFile "+App.Quote(input)+" -CancelFile "+App.Quote(cancelSignal)+" -NoLaunch",Line,control);
      if(result.Item1==0){bar.Value=100;status.Text="安装完成。打开大肥鱼管理窗口，点击“一键启动”即可。";install.Text="再次安装 / 修复";if(!closeAfterStop)App.OpenHub(folder.Text,0);}
      else if(result.Item1==2){status.Text="安装已停止。未完成目录已保留，可重新安装。";install.Text="重新安装";}
      else{ShowInstallFailure(installFailure.Length>0?installFailure:"安装未完成，请查看日志后重试。",App.IsAppControlFailure(result.Item2));install.Text="重试安装";}
    }catch(Exception ex){ShowInstallFailure(ex.Message,App.IsAppControlFailure(ex));}
    finally{
      if(input!=null)try{File.Delete(input);}catch{}
      if(cancelSignal.Length>0)try{File.Delete(cancelSignal);}catch{}
      if(control!=null)try{Directory.Delete(control,false);}catch{}
      cancelSignal="";busy=false;stop.Enabled=false;
      install.Enabled=browse.Enabled=folder.Enabled=fields.Enabled=qq.Enabled=true;owner.Enabled=qq.Checked;
      settings.Enabled=login.Enabled=File.Exists(Path.Combine(folder.Text,"xiaoge-install.json"));
      RefreshInstallMode();
      if(closeAfterStop)Close();
    }
  }
  void ShowInstallFailure(string message,bool appControl){
    if(message.StartsWith("安装临时目录不可写",StringComparison.Ordinal)){
      status.Text="临时目录仍无法使用，具体失败步骤已显示，可复制给维护者。";
      log.AppendText(message+Environment.NewLine);
      if(!closeAfterStop)using(var details=new TempDirectoryHelpForm(message)){details.ShowDialog(this);}
      return;
    }
    if(!appControl&&!App.IsAppControlFailure(message)){status.Text=message;return;}
    status.Text="Windows 应用控制阻止了安装，请按提示检查智能应用控制设置后重新安装。";
    log.AppendText(AppControlHelpForm.Instructions+Environment.NewLine);
    if(!closeAfterStop)using(var help=new AppControlHelpForm()){help.ShowDialog(this);}
  }

}

class TempDirectoryHelpForm:Form {
  internal TempDirectoryHelpForm(string details){
    Text="安装临时目录诊断（v2）";ClientSize=new Size(720,430);StartPosition=FormStartPosition.CenterParent;Font=new Font("Microsoft YaHei UI",10);
    Controls.Add(new Label{Text="以下是实际失败步骤与错误码。请复制此信息，无需再次尝试管理员。",Location=new Point(18,18),Size=new Size(684,45)});
    Controls.Add(new TextBox{Text=details,Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Both,WordWrap=false,Location=new Point(18,68),Size=new Size(684,296)});
    var copy=new OceanButton{Text="复制错误详情",Location=new Point(438,381),Size=new Size(132,32)};copy.Click+=(s,e)=>{Clipboard.SetText(details);copy.Text="已复制";};Controls.Add(copy);
    var close=new OceanButton{Text="关闭",Location=new Point(582,381),Size=new Size(120,32)};close.Click+=(s,e)=>Close();Controls.Add(close);
  }
}
class SettingsForm:OceanForm {
  readonly string root;readonly bool preview;ModelPanel fields=new ModelPanel();CheckBox qq=new CheckBox();TextBox owner=new TextBox();Label status=new Label();Button save=new OceanButton(),test=new OceanButton();bool busy;
  internal SettingsForm(string path,bool screenshot){root=path.TrimEnd('\\');preview=screenshot;Text="大肥鱼完整版设置 · 模型与QQ";ClientSize=new Size(662,660);Font=new Font("Microsoft YaHei UI",10);StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;BackColor=Color.FromArgb(248,250,255);Controls.Add(new Label{Text="大肥鱼完整版设置",Font=new Font(Font.FontFamily,18,FontStyle.Bold),AutoSize=true,Location=new Point(26,18)});Controls.Add(new Label{Text="修改密钥、模型或QQ配置，无需重新安装。",AutoSize=true,Location=new Point(28,62)});fields.Location=new Point(28,105);Controls.Add(fields);qq.Text="启用 QQ（连接外部框架）";qq.AutoSize=true;qq.Location=new Point(138,347);qq.CheckedChanged+=(s,e)=>owner.Enabled=qq.Checked;Controls.Add(qq);Controls.Add(new Label{Text="管理员 QQ",AutoSize=true,Location=new Point(28,393)});owner.SetBounds(138,386,230,29);Controls.Add(owner);save.Text="保存设置";save.SetBounds(28,440,294,39);save.Click+=async(s,e)=>await Execute("save");Controls.Add(save);test.Text="测试API连接";test.SetBounds(340,440,294,39);test.Click+=async(s,e)=>await Execute("test");Controls.Add(test);status.Text="填写密钥后可先测试连接；密钥不会显示在日志中。";status.SetBounds(28,494,606,45);Controls.Add(status);AddButton("启动 / 登录QQ",28,551,()=>{if(!qq.Checked){status.Text="请先勾选启用QQ并保存设置。";return;}App.OpenQQ(root);});AddButton("登录AI账号",183,551,()=>App.OpenAI(root));AddButton("启动全部",338,551,()=>App.OpenHub(root,0,true));AddButton("安装目录",493,551,()=>App.OpenFolder(root));var backends=new OceanButton{Text="后台网址 / 登录密码（3100 与 5099）",Location=new Point(28,602),Size=new Size(606,34)};backends.Click+=(s,e)=>App.OpenHub(root,2);Controls.Add(backends);OceanTheme.Settings(this,fields,qq,owner,save,test,status);var gateway=new OceanButton{Text="连接QQ / 桥接设置"};gateway.Click+=(s,e)=>{if(!preview)App.Gateway(root);};OceanTheme.GatewayEntry(this,gateway);Shown+=async(s,e)=>{if(!preview)await LoadSettings();};FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};}
  internal bool IsSaving {get{return busy;}}
  void AddButton(string text,int x,int y,Action action){var button=new OceanButton{Text=text,Location=new Point(x,y),Size=new Size(141,33)};button.Click+=(s,e)=>{try{action();}catch(Exception ex){status.Text=ex.Message;}};Controls.Add(button);}
  void Busy(bool value){busy=value;fields.Enabled=qq.Enabled=save.Enabled=test.Enabled=!value;owner.Enabled=!value&&qq.Checked;}
  async Task LoadSettings(){Busy(true);try{var result=await App.Run(Path.Combine(root,"Manage-Settings.ps1"),"-Action read -Root "+App.Quote(root),null);if(result.Item1!=0)throw new Exception(result.Item2);var data=App.Object(result.Item2);fields.LoadData(data);qq.Checked=App.Flag(data,"qqEnabled");owner.Text=App.Value(data,"owner");}catch(Exception ex){status.Text=ex.Message;}finally{Busy(false);}}
  async Task Execute(string command){string input=null;Busy(true);status.Text=command=="save"?"正在保存配置…":"正在检查密钥与模型列表…";try{input=App.PrivateInput(fields.Data(owner.Text,qq.Checked));var result=await App.Run(Path.Combine(root,"Manage-Settings.ps1"),"-Action "+command+" -Root "+App.Quote(root)+" -SettingsFile "+App.Quote(input),null);if(result.Item1!=0)throw new Exception(result.Item2.Replace("ERROR|",""));var data=App.Object(result.Item2);if(command=="save"){fields.LoadData(data);status.Text=fields.Kind!="account"&&!App.Flag(data,"hasKey")?"配置已保存。请补充API密钥后再聊天；QQ可单独启动。":"设置已保存，新对话使用新模型；QQ桥接会尝试热切换。";}else status.Text=App.Value(data,"message");}catch(Exception ex){status.Text=fields.key.Text.Length>0?ex.Message.Replace(fields.key.Text,"[密钥已隐藏]"):ex.Message;}finally{if(input!=null)try{File.Delete(input);}catch{}Busy(false);}}
}

class LaunchForm:OceanForm {
  readonly string root;readonly bool preview;Label status=new Label();ProgressBar bar=new ProgressBar();Button launch=new OceanButton();Button petStart=new OceanButton(),petStop=new OceanButton();bool busy,stopping,petBusy;Task<bool> stopTask;
  internal bool IsStarting {get{return busy||stopping||petBusy;}}
  internal LaunchForm(string path,bool autoStart=true,bool screenshot=false){
    root=path;preview=screenshot;Text="启动与状态";ClientSize=new Size(700,650);Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(248,250,255);
    Controls.Add(new Label{Text="大肥鱼完整版",Font=new Font(Font.FontFamily,24,FontStyle.Bold),AutoSize=true,Location=new Point(28,28)});
    Controls.Add(new Label{Text="启动、修改设置、打开后台，都在这里。",AutoSize=true,ForeColor=Color.DimGray,Location=new Point(30,82)});
    launch.Text="一键启动";launch.Font=new Font(Font.FontFamily,13,FontStyle.Bold);launch.BackColor=Color.FromArgb(56,106,210);launch.ForeColor=Color.White;launch.SetBounds(28,130,634,52);launch.Click+=async(s,e)=>await StartServices();Controls.Add(launch);
    status.Text="点击一键启动，启动聊天、后台、桌宠和语音服务。QQ框架可随启动；首次请在“连接QQ”中配置。";status.SetBounds(28,200,634,90);Controls.Add(status);
    bar.SetBounds(28,310,634,12);Controls.Add(bar);
    petStart.Text="开启桌宠";petStart.SetBounds(28,340,309,40);petStart.Click+=async(s,e)=>await ControlPet("start");Controls.Add(petStart);
    petStop.Text="退出桌宠";petStop.SetBounds(353,340,309,40);petStop.Click+=async(s,e)=>await ControlPet("stop");Controls.Add(petStop);
    AddButton("模型与QQ设置",28,395,()=>App.OpenHub(root,1));
    AddButton("连接QQ / 桥接设置",28,350,()=>App.Gateway(root));
    AddButton("后台网址与密码",353,395,()=>App.OpenHub(root,2));
    AddButton("日志文件夹",28,450,()=>App.OpenFolder(Path.Combine(root,"logs")));
    AddButton("安装目录",353,450,()=>App.OpenFolder(root));
    var stopAll=new OceanButton{Text="关闭全部并退出",Location=new Point(28,505),Size=new Size(634,44)};stopAll.Click+=(s,e)=>{if(!preview){var host=TopLevelControl as Form;if(host!=null)host.Close();}};Controls.Add(stopAll);
    Controls.Add(new Label{Text="关闭窗口也会退出本套后台、桌宠、语音模型与聊天引擎。",AutoSize=true,ForeColor=Color.DimGray,Location=new Point(28,574)});
    var noticeLink=new LinkLabel{Text="版权与使用声明",AutoSize=true,Location=new Point(28,608)};
    noticeLink.LinkClicked+=(s,e)=>MessageBox.Show(this,ReleaseNotice.Text,"版权与使用声明",MessageBoxButtons.OK,MessageBoxIcon.Information);Controls.Add(noticeLink);
    OceanTheme.Launch(this,status,bar,launch,petStart,petStop);
    if(autoStart&&!preview)Shown+=async(s,e)=>await StartServices();
    FormClosing+=(s,e)=>{if(busy||petBusy)e.Cancel=true;};
  }
  void AddButton(string text,int x,int y,Action action){var button=new OceanButton{Text=text,Location=new Point(x,y),Size=new Size(309,40)};button.Click+=(s,e)=>{try{if(!preview)action();}catch(Exception ex){status.Text=ex.Message;}};Controls.Add(button);}
  async Task ControlPet(string action){
    if(busy||stopping||petBusy||preview)return;petBusy=true;launch.Enabled=petStart.Enabled=petStop.Enabled=false;status.Text=action=="start"?"正在开启桌宠…":"正在退出桌宠…";
    try{var script=Path.Combine(root,"Manage-Pet.ps1");if(!File.Exists(script))throw new Exception("缺少桌宠管理组件，请修复安装。");var result=await App.Run(script,"-Action "+action+" -Root "+App.Quote(root),line=>{});status.Text=result.Item1==0?(action=="start"?"桌宠已开启。":"桌宠已退出，QQ、鱼塘和语音后台继续运行。"):result.Item2;}
    catch(Exception ex){status.Text=ex.Message;}finally{petBusy=false;launch.Enabled=petStart.Enabled=petStop.Enabled=!busy&&!stopping;}
  }
  internal async Task StartServices(){
    if(busy||stopping||petBusy||preview)return;busy=true;launch.Enabled=petStart.Enabled=petStop.Enabled=false;bar.Visible=true;bar.Value=0;status.Text="正在检查并启动服务…";string failure="",frameworkNote="";
    try{
      string script=Path.Combine(root,"Start-Stack.ps1");if(!File.Exists(script))script=Path.Combine(root,"Start-All.ps1");
      if(!File.Exists(script))throw new Exception("启动文件不存在，请修复安装或确认安装目录。");
      string marker=Path.Combine(root,"runtime-control/stack.stopped");if(File.Exists(marker))File.Delete(marker);
      var result=await App.Run(script,Path.GetFileName(script)=="Start-Stack.ps1"?"-PreserveStopRequest":"",line=>{if(IsDisposed||stopping)return;BeginInvoke(new Action(()=>{if(stopping)return;
        var parts=line.Split(new[]{'|'},3);int n;
        if(parts.Length==3&&parts[0]=="STATUS"){status.Text=parts[2];if(Int32.TryParse(parts[1],out n)){bar.Value=Math.Max(bar.Value,Math.Max(0,Math.Min(100,n)));if(n==5&&!parts[2].StartsWith("正在"))frameworkNote=parts[2];}}
        else if(line.StartsWith("ERROR|")){failure=line.Substring(6);status.Text=failure;}
      }));});
      if(stopping)return;
      if(result.Item1==0){bar.Value=100;
        if(frameworkNote.Contains("未检测到")||frameworkNote.Contains("候选框架")||frameworkNote.Contains("未能随启动"))status.Text="大肥鱼服务已启动；QQ框架尚未就绪。\n请打开“连接QQ / 桥接设置”，按提示安装或选择入口。";
        else if(frameworkNote.Contains("已启动目录"))status.Text="已启动目录中的QQ框架与大肥鱼服务。\n首次请在框架中登录QQ，再检查接口与回复白名单。";
        else status.Text="服务启动检查完成。\n请在“连接QQ / 桥接设置”检查框架、接口与回复权限。";
      }
      else status.Text=failure.Length>0?failure:"启动未完成，请到后台页查看状态，或打开日志文件夹。";
    }catch(Exception ex){status.Text=ex.Message;}
    finally{busy=false;launch.Enabled=petStart.Enabled=petStop.Enabled=!stopping&&!petBusy;}
  }
  internal Task<bool> StopServices(){if(stopTask!=null&&!stopTask.IsCompleted)return stopTask;stopTask=StopCore();return stopTask;}
  async Task<bool> StopCore(){
    if(preview)return true;stopping=true;launch.Enabled=false;status.Text="正在关闭全部功能并卸载模型…";
    try{
      string script=Path.Combine(root,"Stop-All.ps1");if(!File.Exists(script))throw new Exception("缺少关闭组件，请安装组合修复包后再试。");
      string control=Path.Combine(root,"runtime-control");Directory.CreateDirectory(control);File.WriteAllText(Path.Combine(control,"stack.stopped"),"stop all");
      while(busy||petBusy)await Task.Delay(100);
      var result=await App.Run(script,"-Root "+App.Quote(root),line=>{if(IsDisposed)return;BeginInvoke(new Action(()=>{var parts=line.Split(new[]{'|'},3);if(parts.Length==3&&parts[0]=="STATUS")status.Text=parts[2];else if(line.StartsWith("ERROR|"))status.Text=line.Substring(6);}));});
      if(result.Item1!=0){if(result.Item2.Contains("ERROR|"))status.Text=result.Item2.Substring(result.Item2.LastIndexOf("ERROR|")+6).Trim();return false;}
      while(busy)await Task.Delay(100);
      status.Text="全部功能已关闭，模型已卸载。";return true;
    }catch(Exception ex){status.Text=ex.Message;return false;}
    finally{stopping=false;launch.Enabled=!busy;}
  }

}

class HubForm:OceanForm {
  readonly OceanTabs tabs=new OceanTabs();readonly LaunchForm launch;readonly SettingsForm settings;bool pendingStart,closingPending,closeAllowed;readonly bool preview;
  internal readonly string InstallationRoot;
  internal HubForm(string root,bool screenshot=false){
    InstallationRoot=root;preview=screenshot;Text="大肥鱼完整版";ClientSize=new Size(730,740);MinimumSize=new Size(746,779);StartPosition=FormStartPosition.CenterScreen;Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(248,250,255);
    tabs.Dock=DockStyle.Fill;Controls.Add(tabs);
    launch=new LaunchForm(root,false,preview);Embed("启动",launch);
    var closeManager=new OceanButton{Text="只关闭管理窗口（后台继续运行）",Location=new Point(28,650),Size=new Size(634,32)};closeManager.Click+=(s,e)=>{if(launch.IsStarting||(settings!=null&&settings.IsSaving)){MessageBox.Show(this,"请等待当前启动或保存完成。","大肥鱼");return;}closeAllowed=true;Close();};OceanTheme.AddCloseManager(launch,closeManager);
    if(preview||File.Exists(Path.Combine(root,"Manage-Settings.ps1"))){settings=new SettingsForm(root,preview);Embed("设置",settings);}
    else{
      var page=new OceanPage("设置"){BackColor=BackColor};tabs.TabPages.Add(page);
      page.Controls.Add(new Label{Text="模型、密钥与账号登录",AutoSize=true,Font=new Font(Font.FontFamily,18,FontStyle.Bold),Location=new Point(28,36)});
      page.Controls.Add(new Label{Text="这台电脑的模型设置由3100控制台管理。",AutoSize=true,ForeColor=Color.DimGray,Location=new Point(28,100)});
      var open=new OceanButton{Text="打开模型与账号设置",Location=new Point(28,154),Size=new Size(360,46)};open.Click+=(s,e)=>{try{App.OpenConsole(root);}catch(Exception ex){MessageBox.Show(this,ex.Message,"打开设置");}};page.Controls.Add(open);
    }
    Embed("后台与密码",new BackendsForm(root,preview));
    OceanTheme.Hub(this,tabs);
    Shown+=async(s,e)=>{if(pendingStart){pendingStart=false;await launch.StartServices();}};
    FormClosing+=async(s,e)=>{
      if(preview||closeAllowed)return;e.Cancel=true;if(closingPending)return;closingPending=true;
      try{while(settings!=null&&settings.IsSaving)await Task.Delay(100);if(await launch.StopServices()){closeAllowed=true;Close();}}
      finally{closingPending=false;}
    };
  }
  void Embed(string title,Form child){var page=new OceanPage(title){BackColor=BackColor};tabs.TabPages.Add(page);child.TopLevel=false;child.FormBorderStyle=FormBorderStyle.None;child.Dock=DockStyle.Fill;page.Controls.Add(child);child.Show();}
  internal void SelectPage(int index,bool start=false){tabs.SelectedIndex=Math.Max(0,Math.Min(tabs.TabPages.Count-1,index));if(start){if(Visible) {var task=launch.StartServices();}else pendingStart=true;}}
}
