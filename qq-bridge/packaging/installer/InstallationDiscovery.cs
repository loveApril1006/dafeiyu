using System;using System.IO;using System.Linq;using System.Collections.Generic;using Microsoft.Win32;using System.Runtime.InteropServices;
internal sealed class ExistingInstallation {
 internal string Root,Edition,Error="";internal int Version;internal bool Installed,NonEmpty,Resume;
 public override string ToString(){return Root+"  · "+(Version>0?"v"+Version:"旧版")+" / "+Edition;}
}
internal static class InstallationDiscovery {
 internal static ExistingInstallation Inspect(string input){
  var result=new ExistingInstallation{Root=input,Edition="full"};
  try{
   string root=App.InstallDirectory(input);result.Root=root;bool marker=File.Exists(Path.Combine(root,"xiaoge-install.json"));
   bool legacy=new[]{"full-release.json","voice-release.json","basic-release.json","Start-All.ps1"}.Any(n=>File.Exists(Path.Combine(root,n)));
   bool core=File.Exists(Path.Combine(root,"qq-bridge/config.json"));
   if(marker){var meta=App.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"xiaoge-install.json")));result.Edition=App.Value(meta,"edition","full");int v;Int32.TryParse(App.Value(meta,"version"),out v);result.Version=v;}
   if((marker||legacy)&&core&&(marker||!File.Exists(Path.Combine(root,".xiaoge-installing")))){result.Installed=true;result.Resume=File.Exists(Path.Combine(root,".xiaoge-updating"));}
   else if(marker)result.Error="检测到旧安装标记，但核心配置不完整；请先备份修复，未按新安装覆盖。";
   result.NonEmpty=Directory.Exists(root)&&Directory.EnumerateFileSystemEntries(root).Any();
   if(!result.Installed&&result.Error.Length==0&&result.NonEmpty&&!File.Exists(Path.Combine(root,".xiaoge-installing")))result.Error="此目录已有文件，无法确认是大肥鱼；请选择原安装目录或空文件夹。";
  }catch{result.Error="目录或安装信息无法读取，请选择可访问的实际安装目录。";}
  return result;
 }
 internal static List<ExistingInstallation> Discover(){
  var roots=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  try{using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Xiaoge\Installations")){if(key!=null)foreach(string name in key.GetSubKeyNames())using(var child=key.OpenSubKey(name)){var root=child==null?null:child.GetValue("Root") as string;if(!String.IsNullOrWhiteSpace(root))roots.Add(root);}}}catch{}
  foreach(var drive in DriveInfo.GetDrives())try{if(drive.IsReady&&drive.DriveType==DriveType.Fixed)foreach(string folder in new[]{"DafeiyuFull","大肥鱼","XiaogeFull","Xiaoge","小鸽子","ai","ai\\XiaogeFull"})roots.Add(Path.Combine(drive.RootDirectory.FullName,folder));}catch{}
  string local=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);roots.Add(Path.Combine(local,"DafeiyuFull"));roots.Add(Path.Combine(local,"XiaogeFull"));roots.Add(Path.Combine(local,"Xiaoge"));
  object shell=null;try{
   var type=Type.GetTypeFromProgID("WScript.Shell");shell=Activator.CreateInstance(type);
   foreach(string folder in new[]{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.Programs)}){
    if(!Directory.Exists(folder))continue;
    foreach(string file in Directory.EnumerateFiles(folder,"*.lnk").Where(n=>Path.GetFileName(n).Contains("大肥鱼")||Path.GetFileName(n).Contains("小鸽子"))){
     object link=null;try{link=type.InvokeMember("CreateShortcut",System.Reflection.BindingFlags.InvokeMethod,null,shell,new object[]{file});var target=Convert.ToString(link.GetType().InvokeMember("TargetPath",System.Reflection.BindingFlags.GetProperty,null,link,null));if(!String.IsNullOrWhiteSpace(target)&&Path.IsPathRooted(target))roots.Add(Path.GetDirectoryName(target));}catch{}finally{if(link!=null&&Marshal.IsComObject(link))Marshal.FinalReleaseComObject(link);}
    }
   }
  }catch{}finally{if(shell!=null&&Marshal.IsComObject(shell))Marshal.FinalReleaseComObject(shell);}
  return roots.Select(Inspect).Where(r=>r.Installed&&r.Error.Length==0).GroupBy(r=>r.Root,StringComparer.OrdinalIgnoreCase).Select(g=>g.First()).OrderBy(r=>r.Root).ToList();
 }
}
