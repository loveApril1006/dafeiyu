// Only static explanatory copy is collapsed. Controls, live status and errors stay visible.
export function compactJSXHelp(source) {
  return source.replace(/<h1>(共享记忆|自检与用量|观看日报|人格与兴趣)<\/h1>/g,'<h2>$1</h2>').replace(/<p className="muted">([^<{]{70,})<\/p>/g, (original,text) => {
    if (!text.trim()) return original;
    return '<details className="studio-help"><summary>使用说明</summary>' + original + '</details>';
  });
}
