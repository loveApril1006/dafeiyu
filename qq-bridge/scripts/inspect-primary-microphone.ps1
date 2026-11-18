$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PrimaryMicrophone {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IEnumerator {
  [PreserveSig]int EnumAudioEndpoints(int flow,uint state,out IntPtr devices);
  [PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
 }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
  [PreserveSig]int Activate(ref Guid id,uint context,IntPtr activation,out IntPtr result);
  [PreserveSig]int OpenPropertyStore(uint mode,out IntPtr properties);
  [PreserveSig]int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);
  [PreserveSig]int GetState(out uint state);
 }
 public static string Get(int role){IEnumerator e=(IEnumerator)new Enumerator();IDevice d;Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(1,role,out d));string id;Marshal.ThrowExceptionForHR(d.GetId(out id));Marshal.ReleaseComObject(d);Marshal.ReleaseComObject(e);return id;}
}
'@
$result=@()
foreach($role in @(0,1,2)){
  $id=[PrimaryMicrophone]::Get($role)
  $guid=$id.Substring($id.LastIndexOf('{'))
  $properties=Get-ItemProperty -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture\'+$guid+'\Properties')
  $name=$properties.'{a45c254e-df1c-4efd-8020-67d146a850e0},14'
  if(-not $name){$name=$properties.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'+' ('+$properties.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'+')'}
  $result+=[pscustomobject]@{role=@('Console','Multimedia','Communications')[$role];name=$name;id=$id}
}
$result|ConvertTo-Json -Depth 3
