using System;
using System.IO;
using System.Linq;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Shared native UI skin. Business actions remain in Installer.cs.
static class OceanTheme {
  internal static readonly Color Ink=Color.FromArgb(25,59,122),Muted=Color.FromArgb(100,127,168),Blue=Color.FromArgb(32,108,255),Line=Color.FromArgb(192,222,255);
  internal static bool PreviewMode;
  static Image hero,footer,avatar;static Icon icon;
  static Image Load(string name){using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("Dafeiyu."+name)){if(stream==null)return null;using(var decoded=new Bitmap(stream))return new Bitmap(decoded);}}
  internal static Image Hero{get{return hero??(hero=Load("hero.png"));}}
  internal static Image Footer{get{return footer??(footer=Load("footer.png"));}}
  internal static Image Avatar{get{return avatar??(avatar=Load("app-icon.png"));}}
  internal static Icon AppIcon{get{if(icon==null)using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("Dafeiyu.app-icon.ico")){if(s!=null)icon=new Icon(s);}return icon;}}
  internal static Font Font(float size,bool bold=false){return new Font("Microsoft YaHei UI",size,bold?FontStyle.Bold:FontStyle.Regular);}
  internal static GraphicsPath Round(Rectangle r,int radius){var p=new GraphicsPath();int d=Math.Max(2,Math.Min(radius*2,Math.Min(r.Width,r.Height)));p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
  internal static void Picture(Control parent,Image image,int x,int y,int w,int h){if(image==null)return;parent.Controls.Add(new PictureBox{Image=image,SizeMode=PictureBoxSizeMode.Zoom,BackColor=Color.Transparent,Location=new Point(x,y),Size=new Size(w,h),TabStop=false});}
  internal static Label Label(Control parent,string text,int x,int y,int w,int h,float size=11,bool bold=false,Color? color=null){var l=new Label{Text=text,Location=new Point(x,y),Size=new Size(w,h),Font=Font(size,bold),ForeColor=color??Ink,BackColor=Color.Transparent,AutoEllipsis=false,UseMnemonic=false};parent.Controls.Add(l);return l;}
  internal static void Place(Control parent,Control control,int x,int y,int w,int h){parent.Controls.Add(control);control.SetBounds(x,y,w,h);control.Font=Font(11);control.ForeColor=Ink;if(control is TextBox)((TextBox)control).BorderStyle=BorderStyle.FixedSingle;}
  internal static void Input(Control parent,Control control,int x,int y,int w,int h){var shell=new OceanInput{Location=new Point(x,y),Size=new Size(w,h)};parent.Controls.Add(shell);shell.Controls.Add(control);control.Font=Font(11);control.ForeColor=Ink;control.BackColor=Color.White;var text=control as TextBox;if(text!=null)text.BorderStyle=BorderStyle.None;var combo=control as ComboBox;if(combo!=null){combo.FlatStyle=FlatStyle.Flat;combo.DrawMode=DrawMode.OwnerDrawFixed;combo.ItemHeight=25;combo.DrawItem+=(s,e)=>{e.DrawBackground();string value=e.Index>=0?Convert.ToString(combo.Items[e.Index]):combo.Text;TextRenderer.DrawText(e.Graphics,value,combo.Font,e.Bounds,combo.Enabled?Ink:Muted,TextFormatFlags.Left|TextFormatFlags.VerticalCenter);};}control.SetBounds(11,(h-control.PreferredSize.Height)/2,w-23,control.PreferredSize.Height);control.Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Top;control.Enter+=(s,e)=>{shell.Active=true;shell.Invalidate();};control.Leave+=(s,e)=>{shell.Active=false;shell.Invalidate();};shell.Click+=(s,e)=>control.Focus();}
  internal static OceanCanvas FindCanvas(Form form){var direct=form.Controls.OfType<OceanCanvas>().FirstOrDefault();if(direct!=null)return direct;var viewport=form.Controls.OfType<OceanViewport>().FirstOrDefault();return viewport==null?null:viewport.Content;}
  internal static OceanCanvas Canvas(Form form,int height,string title){form.SuspendLayout();form.Controls.Clear();form.Text=title;form.BackColor=Color.FromArgb(231,245,255);form.Font=Font(10.5f);form.ForeColor=Ink;form.Icon=AppIcon;form.AutoScaleMode=AutoScaleMode.None;form.AutoScroll=false;form.AutoScrollMinSize=Size.Empty;form.ClientSize=new Size(840,PreviewMode?height:Math.Min(height,Screen.FromControl(form).WorkingArea.Height-95));form.StartPosition=FormStartPosition.CenterScreen;var c=new OceanCanvas{Size=new Size(800,height)};var viewport=new OceanViewport(c){Dock=DockStyle.Fill,BackColor=form.BackColor};form.Controls.Add(viewport);form.ResumeLayout();return c;}
  internal static OceanCard Card(Control parent,int y,int h,string title,string glyph){var c=new OceanCard{Location=new Point(16,y),Size=new Size(768,h)};parent.Controls.Add(c);Badge(c,glyph,22,14,36);Label(c,title,72,17,650,32,15,true);return c;}
  internal static void Badge(Control parent,string glyph,int x,int y,int size){var b=new GlyphBadge{Glyph=glyph,Location=new Point(x,y),Size=new Size(size,size)};parent.Controls.Add(b);}
  internal static void Header(Control parent,string title,string subtitle){Picture(parent,Hero,520,12,264,198);Picture(parent,Avatar,30,64,68,68);Label(parent,title,112,66,390,62,29,true);Label(parent,subtitle,114,132,375,60,11.5f,false,Muted);Label(parent,"大肥鱼，陪你一起玩～",520,212,264,24,10.5f,true,Color.FromArgb(63,133,230));}
  internal static void Button(Button button,bool primary=false,string caption=null,string glyph=null){var ocean=button as OceanButton;if(ocean!=null){ocean.Primary=primary;ocean.Caption=caption??"";ocean.Glyph=glyph??Glyph(button.Text);ocean.Invalidate();}button.Font=Font(primary?17:12,true);button.Cursor=Cursors.Hand;button.UseVisualStyleBackColor=false;button.ForeColor=primary?Color.White:Ink;button.BackColor=Color.FromArgb(247,252,255);}
  internal static string Glyph(string text){if(text.Contains("退出")||text.Contains("关闭")||text.Contains("停止"))return "\uE7E8";if(text.Contains("设置"))return "\uE713";if(text.Contains("日志"))return "\uE8A5";if(text.Contains("目录")||text.Contains("选择"))return "\uE8B7";if(text.Contains("保存"))return "\uE74E";if(text.Contains("测试"))return "\uE71B";if(text.Contains("后台")||text.Contains("密码"))return "\uE968";if(text.Contains("桌宠"))return "\uE7F4";return "\uE768";}
  internal static void Model(ModelPanel m){m.Size=new Size(720,242);m.BackColor=Color.FromArgb(248,253,255);var labels=m.Controls.OfType<Label>().Where(l=>l.AutoSize).ToArray();int[] ys={10,59,108,157};for(int i=0;i<labels.Length&&i<4;i++){labels[i].SetBounds(10,ys[i],115,28);labels[i].ForeColor=Ink;labels[i].Font=Font(11);}
    Input(m,m.kind,132,0,572,38);Input(m,m.endpoint,132,49,572,38);Input(m,m.model,132,98,572,38);Input(m,m.key,132,147,480,38);var show=m.Controls.OfType<CheckBox>().First();show.Location=new Point(625,154);show.Font=Font(10);foreach(var label in m.Controls.OfType<Label>().Where(l=>!l.AutoSize)){label.SetBounds(132,194,572,44);label.Font=Font(10);label.ForeColor=Muted;}}
  internal static void Settings(Form form,ModelPanel fields,CheckBox qq,TextBox owner,Button save,Button test,Label status){
    var all=form.Controls.OfType<Button>().ToArray();var c=Canvas(form,1000,"大肥鱼 · 设置");Header(c,"大肥鱼设置","修改密钥、模型或 QQ 配置，无需重新安装。");
    var model=Card(c,242,310,"模型与 API 配置","\uE8F1");Model(fields);Place(model,fields,24,60,720,242);
    var q=Card(c,572,160,"QQ连接配置","\uE77B");Place(q,qq,30,61,435,28);qq.AutoSize=true;Label(q,"启用后可登录 QQ；管理员可稍后设置。",30,93,445,26,10,false,Muted);Label(q,"管理员 QQ",30,126,125,26,10);Input(q,owner,162,116,338,34);Picture(q,Footer,546,13,202,142);
    Place(c,save,18,744,370,58);Button(save,false,null,"\uE74E");Place(c,test,410,744,374,58);Button(test,true,null,"\uE71B");
    Place(c,status,30,820,742,48);status.ForeColor=Muted;int i=0;foreach(var b in all.Where(b=>b!=save&&b!=test&&!b.Text.StartsWith("后台网址 / 登录密码"))){Place(c,b,18+i*195,880,180,48);Button(b);i++;}
    var backend=all.FirstOrDefault(b=>b.Text.StartsWith("后台网址 / 登录密码"));if(backend!=null){Place(c,backend,18,946,766,40);Button(backend);} }
  internal static void Launch(Form form,Label status,ProgressBar bar,Button launch,Button petStart,Button petStop){
    var old=form.Controls.Cast<Control>().ToArray();var c=Canvas(form,916,"大肥鱼 · 启动");Header(c,"大肥鱼","启动、修改设置、打开后台，都在这里。");Place(c,launch,30,204,454,64);Button(launch,true,null,"\uE768");Place(c,status,30,288,742,46);status.ForeColor=Muted;Place(c,bar,30,329,742,8);bar.Visible=false;var qq=old.OfType<Button>().First(b=>b.Text=="连接QQ / 桥接设置");Place(c,qq,30,348,742,44);Button(qq,false,"填写OneBot接口，保存并连接QQ桥接");
    var buttons=new[]{petStart,petStop}.Concat(old.OfType<Button>().Where(b=>b!=launch&&b!=petStart&&b!=petStop&&b.Text!="连接QQ / 桥接设置"&&!b.Text.Contains("关闭全部"))).ToArray();string[] captions={"启动桌面宠物","关闭桌面宠物，后台继续运行","配置模型、QQ 登录等","打开管理后台","查看运行日志","打开程序目录"};
    for(int i=0;i<buttons.Length;i++){Place(c,buttons[i],30+(i%2)*383,425+(i/2)*87,359,72);Button(buttons[i],false,i<captions.Length?captions[i]:"");}
    var stop=old.OfType<Button>().First(b=>b.Text.Contains("关闭全部"));Place(c,stop,30,696,742,52);Button(stop,false,null,"\uE7E8");
    var note=new OceanCard{Location=new Point(30,804),Size=new Size(742,108)};c.Controls.Add(note);Picture(note,Footer,0,0,162,106);Label(note,"关闭主窗口会退出本套后台、桌宠、语音模型与聊天引擎。",166,9,554,20,9.5f,false,Muted);Label(note,ReleaseNotice.Copyright,166,32,554,18,9,false,Muted);Label(note,ReleaseNotice.Usage,166,54,554,18,9,false,Muted);var link=old.OfType<LinkLabel>().FirstOrDefault();if(link!=null){Place(note,link,166,77,554,22);link.Font=Font(9.5f);}
  }
  internal static void GatewayEntry(Form form,Button button){var c=FindCanvas(form);c.Height=1060;Place(c,button,18,1002,766,42);Button(button);}
  internal static void AddCloseManager(Form launch,Button button){var c=FindCanvas(launch);Place(c,button,30,760,742,32);Button(button);button.Font=Font(10);}
  internal static void Installer(Form form,TextBox folder,ComboBox known,Label mode,ModelPanel fields,CheckBox qq,TextBox owner,Button browse,Button install,Button stop,ProgressBar bar,Label status,TextBox log,Button settings,Button login){
    var old=form.Controls.OfType<Button>().ToArray();var c=Canvas(form,1250,"大肥鱼完整版安装 · 新安装 / 保留数据更新");Header(c,"安装大肥鱼","含聊天、QQ、桌宠与语音，按需开启各项功能。");
    var notice=Card(c,242,205,"版权与使用声明","\uE946");var text=new TextBox{Text=ReleaseNotice.Text.Replace("\n",Environment.NewLine),ReadOnly=true,Multiline=true,ScrollBars=ScrollBars.Vertical,BorderStyle=BorderStyle.None,BackColor=Color.FromArgb(248,253,255),ForeColor=Muted,Font=Font(10),Location=new Point(25,60),Size=new Size(718,126)};notice.Controls.Add(text);
    var location=Card(c,466,197,"安装位置","\uE8B7");Label(location,"安装位置",25,64,115,28);Input(location,folder,146,56,451,36);Place(location,browse,607,57,133,35);Button(browse);Label(location,"安装方式",25,109,115,28);Input(location,known,146,101,594,36);Place(location,mode,146,145,594,42);mode.Font=Font(10);mode.ForeColor=Color.FromArgb(28,133,119);
    var model=Card(c,682,310,"模型与 API 配置","\uE8F1");Model(fields);Place(model,fields,24,60,720,242);
    var q=Card(c,1011,116,"管理员 QQ","\uE77B");Label(q,"仅向管理员主动联系；可留空，安装后再在后台设置。",76,51,660,24,10,false,Muted);Label(q,"管理员 QQ",26,84,116,25,10);Input(q,owner,146,74,480,34);Picture(q,Footer,643,29,111,73);qq.Checked=true;
    Place(c,install,18,1135,510,54);Button(install,true,null,"\uE896");Place(c,stop,547,1135,237,54);Button(stop,false,null,"\uE711");Place(c,bar,20,1206,764,10);bar.Visible=false;Place(c,status,22,1230,756,48);status.Tag="install-status";status.ForeColor=Muted;
    // Put optional details after the primary flow; scrolling keeps smaller screens usable.
    c.Height=1454;if(PreviewMode)form.ClientSize=new Size(840,1454);
    Place(c,log,22,1290,756,62);log.BackColor=Color.FromArgb(248,253,255);log.Font=Font(9);int x=22;foreach(var b in old.Where(b=>b!=browse&&b!=install&&b!=stop)){Place(c,b,x,1370,244,42);Button(b);x+=256;}Frame(form,"大肥鱼完整版 · 安装 / 保留数据更新");
  }
  internal static void Backends(Form form){
    var old=form.Controls.Cast<Control>().ToArray();var c=Canvas(form,860,"大肥鱼 · 后台与密码");Header(c,"后台与密码","本机服务独立管理，登录凭据默认隐藏。");var card=new OceanCard{Location=new Point(16,242),Size=new Size(768,598)};c.Controls.Add(card);
    foreach(var control in old){if(control.Top<100)continue;card.Controls.Add(control);control.Location=new Point(control.Left+10,control.Top-84);if(control is Label)control.ForeColor=Muted;if(control is Button)Button((Button)control);}
  }
  internal static void Hub(Form form,OceanTabs tabs){form.Text="大肥鱼";form.Icon=AppIcon;form.BackColor=Color.FromArgb(229,245,255);form.ClientSize=new Size(840,Math.Min(974,Screen.FromControl(form).WorkingArea.Height-80));form.MinimumSize=new Size(830,700);form.Font=Font(11);tabs.BackColor=form.BackColor;Frame(form,"大肥鱼完整版");}
  [DllImport("user32.dll")]static extern bool ReleaseCapture();
  [DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr hwnd,int message,IntPtr wParam,IntPtr lParam);
  internal static void Frame(Form form,string title){var canvas=FindCanvas(form);var wanted=form.ClientSize;form.AutoScroll=false;form.AutoScrollMinSize=Size.Empty;form.FormBorderStyle=FormBorderStyle.None;form.ClientSize=new Size(Math.Max(840,wanted.Width),wanted.Height);form.Padding=new Padding(0,42,0,0);var themed=form as OceanForm;if(themed!=null)themed.RefreshChrome();if(canvas!=null){var scroll=form.Controls.OfType<OceanViewport>().FirstOrDefault();if(scroll==null){scroll=new OceanViewport(canvas){Dock=DockStyle.Fill,BackColor=form.BackColor};form.Controls.Add(scroll);}if(form is Installer){var install=canvas.Controls.OfType<OceanButton>().First(b=>b.Primary);var stop=canvas.Controls.OfType<Button>().First(b=>b.Text=="停止安装");var progress=canvas.Controls.OfType<ProgressBar>().First();var status=canvas.Controls.OfType<Label>().First(l=>Convert.ToString(l.Tag)=="install-status");var actions=new OceanCanvas{Dock=DockStyle.Bottom,Height=150};form.Controls.Add(actions);Place(actions,install,24,15,520,52);Place(actions,stop,561,15,245,52);Place(actions,progress,26,82,778,10);Place(actions,status,26,106,778,39);status.Font=Font(10);scroll.BringToFront();actions.SendToBack();}}
    var bar=new Panel{Location=new Point(0,0),Size=new Size(form.ClientSize.Width,42),Anchor=AnchorStyles.Left|AnchorStyles.Top|AnchorStyles.Right,BackColor=Color.FromArgb(216,237,255)};form.Controls.Add(bar);bar.BringToFront();Picture(bar,Avatar,12,6,27,27);var label=Label(bar,title,48,9,form.ClientSize.Width-212,27,10.5f,true);MouseEventHandler drag=(s,e)=>{if(e.Button==MouseButtons.Left){ReleaseCapture();SendMessage(form.Handle,0xA1,(IntPtr)2,IntPtr.Zero);}};bar.MouseDown+=drag;label.MouseDown+=drag;
    var min=new OceanButton{Text="—",Location=new Point(bar.Width-132,3),Size=new Size(42,34),Anchor=AnchorStyles.Right|AnchorStyles.Top};min.Click+=(s,e)=>form.WindowState=FormWindowState.Minimized;bar.Controls.Add(min);var max=new OceanButton{Text="□",Location=new Point(bar.Width-88,3),Size=new Size(42,34),Anchor=min.Anchor};max.Click+=(s,e)=>form.WindowState=form.WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;bar.Controls.Add(max);var close=new OceanButton{Text="×",Location=new Point(bar.Width-44,3),Size=new Size(42,34),Anchor=min.Anchor};close.Click+=(s,e)=>form.Close();bar.Controls.Add(close);foreach(var b in new[]{min,max,close}){b.Font=Font(13);b.Glyph="";b.Caption="";}
  }
}

// No system frame or sunken client edge should remain around a themed page.
// Windows 11 can add a compositor border even to a borderless top-level Form.
class OceanForm:Form {
  [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref uint value,int size);
  internal OceanForm(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.ResizeRedraw,true);}
  protected override CreateParams CreateParams{get{var value=base.CreateParams;if(FormBorderStyle==FormBorderStyle.None){value.Style&=~0x00C40000;value.ExStyle&=~0x00020301;value.ClassStyle&=~0x00020000;}return value;}}
  internal void RefreshChrome(){if(FormBorderStyle!=FormBorderStyle.None||!IsHandleCreated)return;UpdateStyles();if(!TopLevel)return;try{uint border=0xFFFFFFFE,light=0;DwmSetWindowAttribute(Handle,34,ref border,4);DwmSetWindowAttribute(Handle,20,ref light,4);}catch(DllNotFoundException){}catch(EntryPointNotFoundException){}}
  protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);RefreshChrome();}
  protected override void OnShown(EventArgs e){base.OnShown(e);RefreshChrome();}
  protected override void OnActivated(EventArgs e){base.OnActivated(e);RefreshChrome();}
}

// The pages remain normal embedded Forms. Only the native tab chrome is replaced.
class OceanPage:Panel {internal OceanPage(string title){Text=title;AccessibleName=title;Padding=Padding.Empty;Margin=Padding.Empty;DoubleBuffered=true;}}
class OceanTabs:Panel {
  readonly Panel navigation=new Panel{Dock=DockStyle.Top,Height=62,BackColor=Color.FromArgb(229,245,255)};
  readonly Panel content=new Panel{Dock=DockStyle.Fill,BackColor=Color.FromArgb(229,245,255)};
  readonly System.Collections.Generic.List<OceanButton> buttons=new System.Collections.Generic.List<OceanButton>();
  internal readonly PageCollection TabPages;int selectedIndex=-1;
  internal int TabCount{get{return TabPages.Count;}}
  internal int SelectedIndex{get{return selectedIndex;}set{if(value<0||value>=TabCount)return;selectedIndex=value;for(int i=0;i<TabCount;i++){TabPages[i].Visible=i==value;buttons[i].Selected=i==value;buttons[i].AccessibleDescription=i==value?"当前页面":"切换页面";buttons[i].Invalidate();}TabPages[value].BringToFront();}}
  internal OceanTabs(){DoubleBuffered=true;TabPages=new PageCollection(this);Controls.Add(content);Controls.Add(navigation);content.BringToFront();navigation.Resize+=(s,e)=>ResizeButtons();}
  void AddPage(OceanPage page){page.Dock=DockStyle.Fill;content.Controls.Add(page);var button=new OceanButton{Text=page.Text,Navigation=true,AccessibleName=page.Text,AccessibleRole=AccessibleRole.PageTab,TabStop=true};button.Glyph=buttons.Count==0?"\uE80F":buttons.Count==1?"\uE713":"\uE968";button.Click+=(s,e)=>SelectedIndex=TabPages.IndexOf(page);buttons.Add(button);navigation.Controls.Add(button);ResizeButtons();SelectedIndex=selectedIndex<0?0:selectedIndex;}
  void ResizeButtons(){if(buttons.Count==0)return;int width=Math.Max(1,(navigation.ClientSize.Width-24)/buttons.Count);for(int i=0;i<buttons.Count;i++)buttons[i].SetBounds(8+i*width,7,width-6,48);}
  protected override bool ProcessCmdKey(ref Message msg,Keys keyData){if((keyData== (Keys.Control|Keys.Tab)||keyData==(Keys.Control|Keys.Shift|Keys.Tab))&&TabCount>0){int step=(keyData&Keys.Shift)==Keys.Shift?-1:1;SelectedIndex=(SelectedIndex+TabCount+step)%TabCount;buttons[SelectedIndex].Focus();return true;}return base.ProcessCmdKey(ref msg,keyData);}
  internal sealed class PageCollection:System.Collections.ObjectModel.Collection<OceanPage>{readonly OceanTabs owner;internal PageCollection(OceanTabs tabs){owner=tabs;}protected override void InsertItem(int index,OceanPage item){if(index!=Count)throw new InvalidOperationException("Pages must be appended in navigation order.");base.InsertItem(index,item);owner.AddPage(item);}}
}

// Page scrolling is contained here; embedded forms no longer acquire their own
// native vertical/horizontal frames when the available height changes.
class OceanViewport:Panel,IMessageFilter {
  internal readonly OceanCanvas Content;readonly OceanScrollThumb scrollbar;int position;bool arranging;
  internal int ScrollPosition{get{return position;}}
  internal int MaximumScroll{get{return Math.Max(0,Content.Height-ClientSize.Height);}}
  internal bool ScrollbarVisible{get{return scrollbar.Visible;}}
  internal OceanViewport(OceanCanvas canvas){DoubleBuffered=true;AutoScroll=false;TabStop=false;Content=canvas;scrollbar=new OceanScrollThumb(this);Controls.Add(Content);Controls.Add(scrollbar);Content.SizeChanged+=(s,e)=>Arrange();Watch(Content);}
  void Watch(Control control){if(control is ButtonBase||control is TextBoxBase||control is ComboBox||control is LinkLabel)control.Enter+=(s,e)=>EnsureVisible(control);control.ControlAdded+=(s,e)=>Watch(e.Control);foreach(Control child in control.Controls)Watch(child);}
  internal void EnsureVisible(Control control){if(!Visible||!control.Visible||!Content.Contains(control))return;var bounds=Content.RectangleToClient(control.RectangleToScreen(control.ClientRectangle));if(bounds.Top<position+12)ScrollTo(bounds.Top-12);else if(bounds.Bottom>position+ClientSize.Height-12)ScrollTo(bounds.Bottom-ClientSize.Height+12);}
  internal void ScrollTo(int value){int next=Math.Max(0,Math.Min(MaximumScroll,value));if(next==position)return;position=next;Arrange();}
  internal void ScrollBy(int delta){ScrollTo(position+delta);}
  void Arrange(){if(arranging||IsDisposed)return;arranging=true;try{position=Math.Max(0,Math.Min(MaximumScroll,position));bool overflow=MaximumScroll>0;int available=ClientSize.Width-(overflow?18:0);Content.Location=new Point(Math.Max(0,(available-Content.Width)/2),-position);scrollbar.Visible=overflow;scrollbar.SetBounds(Math.Max(0,ClientSize.Width-14),8,12,Math.Max(1,ClientSize.Height-16));scrollbar.BringToFront();scrollbar.Invalidate();}finally{arranging=false;}}
  protected override void OnResize(EventArgs e){base.OnResize(e);if(Content!=null)Arrange();}
  protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);Application.AddMessageFilter(this);Arrange();}
  protected override void OnHandleDestroyed(EventArgs e){Application.RemoveMessageFilter(this);base.OnHandleDestroyed(e);}
  public bool PreFilterMessage(ref Message message){if(message.Msg!=0x20A||!Visible||MaximumScroll==0)return false;var target=Control.FromChildHandle(message.HWnd);if(target==null||target.TopLevelControl!=TopLevelControl||!ClientRectangle.Contains(PointToClient(Cursor.Position)))return false;var text=target as TextBox;if(text!=null&&text.Multiline&&text.ScrollBars!=ScrollBars.None)return false;var combo=target as ComboBox;if(combo!=null&&combo.DroppedDown)return false;int delta=(short)((message.WParam.ToInt64()>>16)&0xffff);ScrollBy(-delta*Math.Max(1,SystemInformation.MouseWheelScrollLines)*22/120);return true;}
  protected override void OnMouseWheel(MouseEventArgs e){ScrollBy(-e.Delta*Math.Max(1,SystemInformation.MouseWheelScrollLines)*22/120);}
  protected override bool ProcessCmdKey(ref Message msg,Keys keys){Control active=FindForm()==null?null:FindForm().ActiveControl;while(active is ContainerControl&&((ContainerControl)active).ActiveControl!=null)active=((ContainerControl)active).ActiveControl;if(!(active is TextBoxBase)&&!(active is ComboBox)){if(keys==Keys.PageDown){ScrollBy(Math.Max(50,ClientSize.Height-50));return true;}if(keys==Keys.PageUp){ScrollBy(-Math.Max(50,ClientSize.Height-50));return true;}}return base.ProcessCmdKey(ref msg,keys);}
}
class OceanScrollThumb:Control {
  readonly OceanViewport owner;bool dragging,hover;int grab;
  internal OceanScrollThumb(OceanViewport viewport){owner=viewport;SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);TabStop=false;AccessibleRole=AccessibleRole.ScrollBar;AccessibleName="页面滚动";Cursor=Cursors.Hand;}
  Rectangle Thumb{get{int height=Math.Min(Height,Math.Max(38,(int)((long)Height*owner.ClientSize.Height/Math.Max(1,owner.Content.Height))));int top=owner.MaximumScroll==0?0:(int)((long)(Height-height)*owner.ScrollPosition/owner.MaximumScroll);return new Rectangle(3,top,6,height);}}
  protected override void OnPaintBackground(PaintEventArgs e){e.Graphics.Clear(owner.BackColor);}
  protected override void OnPaint(PaintEventArgs e){var r=Thumb;if(r.Width<=0||r.Height<=0)return;e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;if(hover||dragging)using(var track=OceanTheme.Round(new Rectangle(3,0,6,Height),3))using(var fill=new SolidBrush(Color.FromArgb(218,236,252)))e.Graphics.FillPath(fill,track);using(var shape=OceanTheme.Round(r,3))using(var fill=new SolidBrush(dragging?Color.FromArgb(75,139,226):hover?Color.FromArgb(122,173,236):Color.FromArgb(166,201,241)))e.Graphics.FillPath(fill,shape);}
  protected override void OnMouseDown(MouseEventArgs e){base.OnMouseDown(e);if(e.Button!=MouseButtons.Left)return;var thumb=Thumb;if(thumb.Contains(e.Location)){dragging=true;grab=e.Y-thumb.Y;Capture=true;Invalidate();}else owner.ScrollBy((e.Y<thumb.Y?-1:1)*Math.Max(50,owner.ClientSize.Height-50));}
  protected override void OnMouseMove(MouseEventArgs e){base.OnMouseMove(e);if(dragging){var thumb=Thumb;int travel=Height-thumb.Height;owner.ScrollTo(travel<=0?0:(int)((long)Math.Max(0,Math.Min(travel,e.Y-grab))*owner.MaximumScroll/travel));}}
  protected override void OnMouseUp(MouseEventArgs e){base.OnMouseUp(e);dragging=false;Capture=false;Invalidate();}
  protected override void OnMouseCaptureChanged(EventArgs e){base.OnMouseCaptureChanged(e);if(!Capture){dragging=false;Invalidate();}}
  protected override void OnMouseEnter(EventArgs e){base.OnMouseEnter(e);hover=true;Invalidate();}
  protected override void OnMouseLeave(EventArgs e){base.OnMouseLeave(e);hover=false;Invalidate();}
  protected override void OnMouseWheel(MouseEventArgs e){owner.ScrollBy(-e.Delta*Math.Max(1,SystemInformation.MouseWheelScrollLines)*22/120);}
}

class OceanCanvas:Panel {
  internal OceanCanvas(){DoubleBuffered=true;BackColor=Color.FromArgb(237,249,255);}
  protected override void OnPaintBackground(PaintEventArgs e){var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;using(var b=new LinearGradientBrush(ClientRectangle,Color.FromArgb(244,252,255),Color.FromArgb(212,238,255),90))g.FillRectangle(b,ClientRectangle);
    for(int i=0;i<26;i++){int x=(i*139+17)%Math.Max(1,Width),y=(i*197+37)%Math.Max(1,Height),r=6+(i%4)*3;using(var pen=new Pen(Color.FromArgb(65,94,177,255),2))g.DrawEllipse(pen,x,y,r*2,r*2);}
    using(var p=new GraphicsPath()){p.AddBezier(0,Height-45,180,Height-100,350,Height+15,Width,Height-72);p.AddLine(Width,Height-72,Width,Height);p.AddLine(Width,Height,0,Height);p.CloseFigure();using(var b=new SolidBrush(Color.FromArgb(105,170,217,255)))g.FillPath(b,p);}
  }
}
class OceanCard:Panel {
  internal OceanCard(){DoubleBuffered=true;BackColor=Color.Transparent;}
  protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var shape=OceanTheme.Round(new Rectangle(1,1,Width-3,Height-3),20)){using(var b=new LinearGradientBrush(ClientRectangle,Color.White,Color.FromArgb(244,251,255),90))e.Graphics.FillPath(b,shape);using(var p=new Pen(OceanTheme.Line,1.2f))e.Graphics.DrawPath(p,shape);}base.OnPaint(e);}
}
class OceanInput:Panel {internal bool Active;internal OceanInput(){DoubleBuffered=true;BackColor=Color.Transparent;}protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=OceanTheme.Round(new Rectangle(1,1,Width-3,Height-3),7)){e.Graphics.FillPath(Brushes.White,p);using(var pen=new Pen(Active?OceanTheme.Blue:OceanTheme.Line,Active?1.7f:1.1f))e.Graphics.DrawPath(pen,p);}base.OnPaint(e);}}
class GlyphBadge:Control {
 internal string Glyph;internal GlyphBadge(){SetStyle(ControlStyles.SupportsTransparentBackColor|ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);BackColor=Color.Transparent;}
 protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var b=new SolidBrush(Color.FromArgb(222,240,255)))e.Graphics.FillEllipse(b,0,0,Width-1,Height-1);using(var f=new Font("Segoe MDL2 Assets",Width*0.42f))TextRenderer.DrawText(e.Graphics,Glyph,f,ClientRectangle,OceanTheme.Blue,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);}
}
class OceanButtonContent {
 internal Rectangle Icon,Badge,Title,Subtitle,Arrow;internal float FontSize;internal bool Tile;
}
class OceanButton:Button {
 internal bool Primary,Navigation,Selected;internal string Caption="",Glyph="";bool hover;
 internal OceanButton(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor,true);FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;UseVisualStyleBackColor=false;BackColor=Color.Transparent;MouseEnter+=(s,e)=>{hover=true;Invalidate();};MouseLeave+=(s,e)=>{hover=false;Invalidate();};}
 // Also called by OnPaint: WM_PRINT and some Windows button states skip the
 // background pass. Corners must still receive the actual parent background.
 protected override void OnPaintBackground(PaintEventArgs e){if(Parent==null){e.Graphics.Clear(Color.FromArgb(237,249,255));return;}var state=e.Graphics.Save();try{e.Graphics.TranslateTransform(-Left,-Top);var clip=e.ClipRectangle;clip.Offset(Left,Top);using(var background=new PaintEventArgs(e.Graphics,clip)){InvokePaintBackground(Parent,background);InvokePaint(Parent,background);}}finally{e.Graphics.Restore(state);}}
 internal OceanButtonContent ContentLayout(Graphics graphics){var result=new OceanButtonContent{Tile=!Navigation&&Caption.Length>0&&Height>=60};int padding=Width<100?8:18;if(result.Tile){int badge=Math.Min(48,Height-24),top=(Height-45)/2;result.Badge=new Rectangle(padding,(Height-badge)/2,badge,badge);result.Icon=new Rectangle(padding+(badge-28)/2,(Height-28)/2,28,28);result.Arrow=new Rectangle(Width-padding-12,(Height-12)/2,12,12);int x=result.Badge.Right+14,width=Math.Max(1,result.Arrow.Left-12-x);result.Title=new Rectangle(x,top,width,24);result.Subtitle=new Rectangle(x,top+26,width,19);result.FontSize=12;return result;}
   int icon=Glyph.Length==0?0:Height<40?18:24,gap=icon==0?0:12,available=Math.Max(1,Width-padding*2-icon-gap);float size=Navigation?13:Font.Size;int textWidth;for(;;){using(var font=OceanTheme.Font(size,Navigation?Selected:true))textWidth=TextRenderer.MeasureText(graphics,Text,font,new Size(Int32.MaxValue,Math.Max(1,Height)),TextFormatFlags.NoPadding|TextFormatFlags.SingleLine).Width;if(textWidth<=available||size<=10)break;size=Math.Max(10,size-0.5f);}textWidth=Math.Min(available,textWidth);int group=icon+gap+textWidth,start=(Width-group)/2;result.Icon=new Rectangle(start,(Height-icon)/2,icon,icon);result.Title=new Rectangle(start+icon+gap,0,textWidth,Height);result.FontSize=size;return result;
 }
 protected override void OnPaint(PaintEventArgs e){OnPaintBackground(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;var r=new Rectangle(1,1,Width-3,Height-3);if(r.Width<=0||r.Height<=0)return;using(var shape=OceanTheme.Round(r,Height>55?20:13)){Color top=Primary?Color.FromArgb(61,181,255):Color.White,bottom=Primary?Color.FromArgb(28,94,249):Color.FromArgb(235,246,255);if(hover&&!Primary)bottom=Color.FromArgb(216,237,255);if(!Enabled){top=Color.FromArgb(233,240,248);bottom=Color.FromArgb(222,232,245);}if(Navigation){if(Selected||hover||Focused)using(var b=new SolidBrush(Selected?Color.White:Color.FromArgb(241,250,255)))g.FillPath(b,shape);}else{using(var b=new LinearGradientBrush(r,top,bottom,80))g.FillPath(b,shape);using(var p=new Pen(Primary?Color.FromArgb(113,201,255):OceanTheme.Line,1.1f))g.DrawPath(p,shape);}}
   var layout=ContentLayout(g);Color ink=!Enabled?Color.FromArgb(145,161,183):Navigation?(Selected?OceanTheme.Blue:OceanTheme.Muted):Primary?Color.White:OceanTheme.Ink;
   if(layout.Tile)using(var fill=new SolidBrush(Color.FromArgb(220,235,255)))g.FillEllipse(fill,layout.Badge);
   const TextFormatFlags flags=TextFormatFlags.NoPadding|TextFormatFlags.SingleLine|TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis;
   if(Glyph.Length>0)using(var font=new Font("Segoe MDL2 Assets",layout.Tile?20:Height<40?12:17))TextRenderer.DrawText(g,Glyph,font,layout.Icon,Navigation?ink:Primary?Color.White:OceanTheme.Blue,flags|TextFormatFlags.HorizontalCenter);
   using(var font=OceanTheme.Font(layout.FontSize,Navigation?Selected:true))TextRenderer.DrawText(g,Text,font,layout.Title,ink,flags|TextFormatFlags.Left);
   if(layout.Tile){using(var font=OceanTheme.Font(9.5f))TextRenderer.DrawText(g,Caption,font,layout.Subtitle,OceanTheme.Muted,flags|TextFormatFlags.Left);int x=layout.Arrow.Left+3,y=layout.Arrow.Top+1;using(var pen=new Pen(Color.FromArgb(106,156,235),2))g.DrawLines(pen,new[]{new Point(x,y),new Point(x+5,y+5),new Point(x,y+10)});}
   if(!Navigation&&Focused&&ShowFocusCues)using(var focus=OceanTheme.Round(new Rectangle(5,5,Width-11,Height-11),Height>55?17:10))using(var pen=new Pen(Primary?Color.FromArgb(205,235,255):Color.FromArgb(118,179,255),1.5f))g.DrawPath(pen,focus);
 }
}
