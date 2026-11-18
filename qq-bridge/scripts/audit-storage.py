"""Read-only size inventory. Never follows Windows junctions or opens file data."""
from pathlib import Path
import argparse,collections,heapq,json,os,stat,time

def inventory(root):
 root=Path(root).resolve();totals=collections.defaultdict(lambda:{'bytes':0,'files':0,'uniqueBytes':0});largest=[];seen_links=set();errors=0;links=0;count=0
 stack=[root]
 while stack:
  directory=stack.pop()
  try:
   with os.scandir(directory) as entries:
    for entry in entries:
     try:
      info=entry.stat(follow_symlinks=False)
      if entry.is_symlink() or getattr(info,'st_file_attributes',0)&0x400:links+=1;continue
      if stat.S_ISDIR(info.st_mode):stack.append(Path(entry.path));continue
      if not stat.S_ISREG(info.st_mode):continue
      relative=Path(entry.path).relative_to(root);parts=relative.parts;size=info.st_size;count+=1;unique=size
      if info.st_nlink>1:
       identity=(info.st_dev,info.st_ino)
       if identity in seen_links:unique=0
       else:seen_links.add(identity)
      for key in ['.',parts[0],'/'.join(parts[:2]) if len(parts)>2 else parts[0]]:
       if key!='.' and key==parts[0] and len(parts)<=2:continue
       totals[key]['bytes']+=size;totals[key]['uniqueBytes']+=unique;totals[key]['files']+=1
      # Correct the single top-level aggregation when there is no second level.
      if len(parts)<=2:totals[parts[0]]['bytes']+=size;totals[parts[0]]['uniqueBytes']+=unique;totals[parts[0]]['files']+=1
      record=(size,str(relative))
      if len(largest)<45:heapq.heappush(largest,record)
      elif record>largest[0]:heapq.heapreplace(largest,record)
     except (OSError,ValueError):errors+=1
  except OSError:errors+=1
 return {'root':str(root),'at':time.time(),'files':count,'skippedReparsePoints':links,'unreadableEntries':errors,'sizeMethod':'logical file sizes; uniqueBytes deduplicates NTFS hardlinks, not compressed allocation','directories':[{'path':name,**value} for name,value in sorted(totals.items(),key=lambda r:r[1]['bytes'],reverse=True)],'largestFiles':[{'path':name,'bytes':size} for size,name in sorted(largest,reverse=True)]}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--root',default=str(Path(__file__).resolve().parents[2]));parser.add_argument('--output');args=parser.parse_args();report=inventory(args.root)
 if args.output:
  output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 top=[row for row in report['directories'] if row['path']=='.' or '/' not in row['path']][:20]
 print(json.dumps({'files':report['files'],'skippedReparsePoints':report['skippedReparsePoints'],'unreadableEntries':report['unreadableEntries'],'directories':[{'path':r['path'],'GiB':round(r['bytes']/1024**3,3),'uniqueGiB':round(r['uniqueBytes']/1024**3,3)} for r in top]},ensure_ascii=False))
