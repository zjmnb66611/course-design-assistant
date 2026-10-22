// Generate a standalone offline file with exact script hashes; no dependencies.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const destination=path.resolve(process.argv[2]||path.join(root,'dist','活动智策-v3-离线版.html'));
const entry=process.argv[3]||'index.html';
if(!['index.html','agent.html'].includes(entry))throw Error('仅支持工作台与独立助手入口');
let html=fs.readFileSync(path.join(root,entry),'utf8');
const scripts=[];
html=html.replace(/<script src="(assets\/[^"]+?)(?:\?[^\"]+)?" defer><\/script>/g,(_,asset)=>{scripts.push(fs.readFileSync(path.join(root,asset),'utf8').replace(/\r\n?/g,'\n').replace(/<\/script/gi,'<\\/script'));return '';});
if(scripts.length!==5)throw Error('Expected exactly five local application scripts');
html=html.replace(/<link rel="stylesheet" href="(assets\/[^\"]+?)(?:\?[^\"]+)?">/g,(_,asset)=>'<style>'+fs.readFileSync(path.join(root,asset),'utf8')+'</style>');
const hashes=scripts.map(code=>"'sha256-"+crypto.createHash('sha256').update(code).digest('base64')+"'");
html=html.replace("script-src 'self'","script-src "+hashes.join(' '));
html=html.replace('</body>',()=>scripts.map(code=>'<script>'+code+'</script>').join('\n')+'\n</body>');
// 下载接入包也可离线使用；独立助手入口在单文件内打开相同工作流。
html=html.replaceAll('href="agent.html"','href="#agent" data-action="openAgent"');
for(const [asset,mime] of [['assets/activity-agent-package.zip','application/zip'],['assets/activity-tutorial.webm','video/webm'],['assets/activity-tutorial-poster.jpg','image/jpeg']]){
  const data='data:'+mime+';base64,'+fs.readFileSync(path.join(root,asset)).toString('base64');
  html=html.split(asset).join(data);
}
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,html);
console.log('Offline file generated: '+destination);
