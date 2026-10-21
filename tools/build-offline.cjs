// Generate a standalone offline file with exact script hashes; no dependencies.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const destination=path.resolve(process.argv[2]||path.join(root,'dist','课设智辅-v2-离线版.html'));
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[];
html=html.replace(/<script src="(assets\/[^"]+?)(?:\?[^\"]+)?" defer><\/script>/g,(_,asset)=>{scripts.push(fs.readFileSync(path.join(root,asset),'utf8').replace(/\r\n?/g,'\n').replace(/<\/script/gi,'<\\/script'));return '';});
if(scripts.length!==4)throw Error('Expected exactly four local application scripts');
html=html.replace(/<link rel="stylesheet" href="(assets\/[^\"]+?)(?:\?[^\"]+)?">/g,(_,asset)=>'<style>'+fs.readFileSync(path.join(root,asset),'utf8')+'</style>');
const hashes=scripts.map(code=>"'sha256-"+crypto.createHash('sha256').update(code).digest('base64')+"'");
html=html.replace("script-src 'self'","script-src "+hashes.join(' '));
html=html.replace('</body>',()=>scripts.map(code=>'<script>'+code+'</script>').join('\n')+'\n</body>');
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,html);
console.log('Offline file generated: '+destination);
