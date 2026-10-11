const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const Handlebars=require('handlebars');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'scripts/main-prism.js'),'utf8');
const template=Handlebars.compile(fs.readFileSync(path.join(root,'templates/main.hbs'),'utf8'));
const cropTemplate=Handlebars.compile(fs.readFileSync(path.join(root,'templates/cropper-prism.hbs'),'utf8'));

function environment(){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://foundry.example/game',runScripts:'outside-only'}),w=dom.window;
  const settings=new Map(),values=new Map(),hooks=new Map(),updates=[],notifications=[];
  const fixture=[{id:'a1',name:'Vanguarda',favorite:true,source:'art/vanguarda.png',src:'tokens/vanguarda.webp',order:0,crop:{zoom:1,panX:0,panY:0}},{id:'a2',name:'Operação Eclipse',favorite:false,source:'art/eclipse.png',src:'tokens/eclipse.webp',order:1,crop:{zoom:1,panX:0,panY:0}},{id:'a3',name:'Aurora',favorite:true,source:'art/aurora.png',src:'tokens/aurora.webp',order:2,crop:{zoom:1,panX:0,panY:0}}];
  const actor={id:'actor1',name:'Angelus',isOwner:true,ownership:{player:3},state:{schemaVersion:5,gallery:fixture},getFlag(n,k){return k==='state'?this.state:null},async setFlag(n,k,v){this.state=v},testUserPermission(){return this.isOwner}};
  const other={...actor,id:'actor2',name:'Lyra',state:{schemaVersion:5,gallery:fixture.map(x=>({...x,id:'lyra-'+x.id}))}};
  const token={id:'t1',name:'Angelus principal',actor,isOwner:true,document:{texture:{src:'tokens/vanguarda.webp'},isOwner:true,canUserModify(){return true},async update(v){updates.push(v);this.texture.src=v['texture.src']}}};
  token.document.id=token.id;
  const token2={...token,id:'t2',name:'Angelus alternativo',document:{...token.document,texture:{src:'tokens/aurora.webp'}}};
  token2.document.id=token2.id;
  const token3={...token,id:'t3',name:'Lyra',actor:other,document:{...token.document,texture:{src:'tokens/vanguarda.webp'}}};
  token3.document.id=token3.id;
  const tokenMap=new Map([[token.id,token],[token2.id,token2],[token3.id,token3]]);
  const actorMap=new Map([[actor.id,actor],[other.id,other]]);
  class Application {
    constructor(options={}){this.options=options;this.rendered=false;this.element=w.document.createElement('section');this.element.className=this.constructor.DEFAULT_OPTIONS.classes.join(' ');this.pending=Promise.resolve();this.element.addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(target&&!target.disabled){const action=this.constructor.DEFAULT_OPTIONS.actions[target.dataset.action];if(action)this.action=Promise.resolve(action.call(this,e,target))}});}
    render(){this.rendered=true;w.document.body.append(this.element);this.pending=this.pending.then(async()=>{const c=await this._prepareContext();this.element.innerHTML='<header class=window-header><button type=button aria-label="Fechar janela">×</button></header>'+(this instanceof w.__wardrobe.TokenCropperApp?cropTemplate:template)(c);this.window={close:this.element.querySelector('[aria-label="Fechar janela"]')};this.window.close.addEventListener('click',()=>{this.action=this.close()});await this._onRender(c,{});});return this;}
    async _onRender(){}async close(){this.rendered=false;this.element.remove()}bringToFront(){}
  }
  w.foundry={applications:{api:{ApplicationV2:Application,HandlebarsApplicationMixin:cls=>cls,DialogV2:{async input(){return {value:'Renomeada'}},async confirm(){return w.__confirm===true}}}},utils:{randomID:()=>Math.random().toString(36).slice(2),escapeHTML:Handlebars.escapeExpression}};
  w.ui={notifications:Object.fromEntries(['info','warn','error'].map(k=>[k,msg=>notifications.push([k,msg])]))};
  w.game={user:{id:'player',isGM:false,character:actor,can:p=>p==='FILES_UPLOAD'},users:{contents:[]},actors:{get:id=>actorMap.get(id)},modules:new Map([['holosuite-token-wardrobe',{}]]),settings:{register(n,k,c){settings.set(k,c)},get(n,k){const user=w.game.user.id;return values.get(user+':'+k)??settings.get(k)?.default},async set(n,k,v){values.set(w.game.user.id+':'+k,v);settings.get(k)?.onChange?.(v);return v}}};
  w.canvas={tokens:{placeables:[token,token2,token3],controlled:[],get:id=>tokenMap.get(id)}};
  w.Hooks={once(n,fn){hooks.set(n,fn)},on(n,fn){hooks.set(n,fn)},callAll(n,...a){hooks.get(n)?.(...a)}};
  w.Image=class{constructor(){this.naturalWidth=512;this.naturalHeight=512}set src(v){this._src=v;queueMicrotask(()=>this.onload?.())}};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
  w.HTMLElement.prototype.setPointerCapture=()=>{};w.HTMLElement.prototype.releasePointerCapture=()=>{};
  w.eval(source+'\nglobalThis.__wardrobe={TokenWardrobeApp,TokenCropperApp,wardrobeApplications,getWardrobeTheme,applyWardrobePreferences,openCroppers,loadImage};');
  hooks.get('init')();
  const app=new w.__wardrobe.TokenWardrobeApp({actorId:actor.id,tokenId:token.id});
  const flush=async()=>{for(let i=0;i<3;i++){await app.action;await app.pending;await Promise.resolve()}};
  const click=async sel=>{const b=app.element.querySelector(sel);assert(b,sel);b.click();await flush()};
  return {dom,w,app,settings,values,actor,token,token2,updates,notifications,flush,click};
}

test('Tema e movimento são preferências de usuário disponíveis para players',()=>{const e=environment();for(const key of ['theme','reducedMotion']){const s=e.settings.get(key);assert.equal(s.scope,'user');assert.equal(s.config,true);assert.notEqual(s.restricted,true)}assert.equal(e.settings.get('theme').default,'light');assert.deepEqual(Object.keys(e.settings.get('theme').choices),['light','dark']);e.dom.window.close()});
test('Tema claro/escuro atualiza galeria e editor sem recriar nem perder crop',async()=>{const e=environment();e.app.render();await e.flush();const crop=new e.w.__wardrobe.TokenCropperApp({actor:e.actor,token:e.token,source:'art/vanguarda.png',crop:{zoom:2,panX:15,panY:-20}});crop.render();await crop.pending;const canvas=crop.element.querySelector('canvas');await e.w.game.settings.set('holosuite-token-wardrobe','theme','dark');assert.equal(e.app.element.dataset.twlTheme,'dark');assert.equal(crop.element.dataset.twlTheme,'dark');assert.equal(crop.element.querySelector('canvas'),canvas);assert.equal(crop.crop.zoom,2);assert.equal(crop.crop.panX,15);await e.w.game.settings.set('holosuite-token-wardrobe','theme','light');assert.equal(crop.element.dataset.twlTheme,'light');await crop.close();assert(!e.w.__wardrobe.wardrobeApplications.has(crop));e.dom.window.close()});
test('Preferência de um jogador não substitui a de outro',async()=>{const e=environment();await e.w.game.settings.set('holosuite-token-wardrobe','theme','dark');e.w.game.user.id='player2';assert.equal(e.w.__wardrobe.getWardrobeTheme(),'light');await e.w.game.settings.set('holosuite-token-wardrobe','theme','light');e.w.game.user.id='player';assert.equal(e.w.__wardrobe.getWardrobeTheme(),'dark');e.dom.window.close()});
test('Troca pelo seletor salva configuração e movimento reduzido aplica aos apps',async()=>{const e=environment();e.app.render();await e.flush();const selector=e.app.element.querySelector('[data-role=theme-select]');selector.value='dark';selector.dispatchEvent(new e.w.Event('change'));await e.flush();assert.equal(e.w.__wardrobe.getWardrobeTheme(),'dark');assert.equal(e.app.element.dataset.twlTheme,'dark');await e.w.game.settings.set('holosuite-token-wardrobe','reducedMotion',true);assert.equal(e.app.element.dataset.twlReducedMotion,'true');await e.app.close();assert(!e.w.__wardrobe.wardrobeApplications.has(e.app));e.dom.window.close()});
test('Selecionar apenas mostra prévia; Aplicar altera somente texture.src',async()=>{const e=environment();e.app.render();await e.flush();await e.click('[data-action=selectImage][data-id=a2]');assert.equal(e.updates.length,0);assert.equal(e.app.element.querySelector('.twl-preview-body h2').textContent,'Operação Eclipse');await e.click('[data-action=switchImage]');assert.equal(e.updates.length,1);assert.deepEqual(Object.keys(e.updates[0]),['texture.src']);assert.equal(e.token.document.texture.src,'tokens/eclipse.webp');assert.equal(e.token2.document.texture.src,'tokens/aurora.webp');e.dom.window.close()});
test('Busca sem acentos, vazio e estado preservado após favorito',async()=>{const e=environment();e.app.render();await e.flush();let search=e.app.element.querySelector('[data-role=search]');search.value='operacao';search.dispatchEvent(new e.w.Event('input'));assert.equal(e.app.element.querySelectorAll('.twl-card:not([hidden])').length,1);await e.click('[data-action=toggleFavorite][data-id=a2]');assert.equal(e.app.element.querySelector('[data-role=search]').value,'operacao');assert.equal(e.app.element.querySelectorAll('.twl-card:not([hidden])').length,1);search=e.app.element.querySelector('[data-role=search]');search.value='inexistente';search.dispatchEvent(new e.w.Event('input'));assert.equal(e.app.element.querySelector('[data-role=search-empty]').hidden,false);await e.click('[data-action=clearSearch]');assert.equal(e.app.element.querySelectorAll('.twl-card:not([hidden])').length,3);e.dom.window.close()});
test('Favoritas e ordenação usam coleção real',async()=>{const e=environment();e.app.render();await e.flush();await e.click('[data-action=filterGallery][data-filter=favorites]');assert.equal(e.app.element.querySelectorAll('.twl-card').length,2);const sort=e.app.element.querySelector('[data-role=gallery-sort]');sort.value='name';sort.dispatchEvent(new e.w.Event('change'));await e.flush();assert.equal(e.app.element.querySelector('.twl-card-footer strong').textContent,'Aurora');e.dom.window.close()});
test('Biblioteca permanece visível sem token e Aplicar fica desabilitado',async()=>{const e=environment();e.w.canvas.tokens.placeables=[];e.w.canvas.tokens.get=()=>null;e.app.render();await e.flush();assert.equal(e.app.element.querySelectorAll('.twl-card').length,3);assert(e.app.element.querySelector('[data-action=switchImage]').disabled);assert.equal(e.app.element.querySelector('.twl-target strong').textContent,'Nenhum token na cena');e.dom.window.close()});
test('Trocar personagem limpa seleção/busca e respeita ownership',async()=>{const e=environment();e.app.query='vanguarda';e.app.render();await e.flush();const select=e.app.element.querySelector('[data-role=actor-select]');select.value='actor2';select.dispatchEvent(new e.w.Event('change'));await e.flush();assert.equal(e.app.actorId,'actor2');assert.equal(e.app.query,'');assert.equal(e.app.element.querySelector('.twl-character h2').textContent,'Lyra');e.actor.isOwner=false;e.actor.ownership.player=0;assert.equal(e.w.game.holosuiteTokenWardrobe.getGallery(e.actor.id).length,0);e.dom.window.close()});
test('Remover requer confirmação e mantém textura já aplicada',async()=>{const e=environment();e.app.render();await e.flush();await e.click('[data-action=removeImage]');assert.equal(e.actor.state.gallery.length,3);e.w.__confirm=true;await e.click('[data-action=removeImage]');assert.equal(e.actor.state.gallery.length,2);assert.equal(e.token.document.texture.src,'tokens/vanguarda.webp');assert.equal(e.updates.length,0);e.dom.window.close()});
test('Templates vazios e sem personagem compilam com controles seguros',async()=>{const e=environment();e.actor.state.gallery=[];e.app.render();await e.flush();assert.equal(e.app.element.querySelectorAll('.twl-card').length,0);assert.equal(e.app.element.querySelector('[data-role=search-empty]').hidden,false);assert.equal(e.app.element.querySelector('.twl-preview'),null);const html=template({hasActor:false,themeLight:true});assert(html.includes('Nenhum personagem disponível'));e.dom.window.close()});
test('Manifest aponta para arquivos presentes e tema não modifica processador/borda',()=>{const manifest=JSON.parse(fs.readFileSync(path.join(root,'module.json')));for(const file of [...manifest.esmodules,...manifest.styles,'templates/main.hbs','templates/cropper-prism.hbs','assets/fixed-border.png'])assert(fs.existsSync(path.join(root,file)),file);assert(source.includes('const SCHEMA_VERSION = 5;'));assert(source.includes('const OUTPUT_SIZE = 512;'));assert(source.includes('assets/fixed-border.png'));assert(!fs.readFileSync(path.join(root,'styles/token-wardrobe-prism.css'),'utf8').match(/(?:^|\})\s*(?:body|:root)\s*\{/));});


test('Aplicar atualiza Em uso sem reconstruir DOM nem perder busca e rolagem, antes da textura local sincronizar',async()=>{
  const e=environment();e.app.render();await e.flush();await e.click('[data-action=selectImage][data-id=a2]');
  const search=e.app.element.querySelector('[data-role=search]');search.value='operacao';search.dispatchEvent(new e.w.Event('input'));
  const scroll=e.app.element.querySelector('.twl-gallery-scroll');scroll.scrollTop=87;scroll.dispatchEvent(new e.w.Event('scroll'));
  e.token.document.update=async v=>{e.updates.push(v)};
  await e.click('[data-action=switchImage]');
  assert.equal(e.token.document.texture.src,'tokens/vanguarda.webp');
  assert.equal(e.app.element.querySelector('[data-role=search]'),search);
  assert.equal(scroll.scrollTop,87);assert.equal(e.app.scrollTop,87);
  assert.equal(e.app.element.querySelectorAll('.twl-active-badge:not([hidden])').length,1);
  assert.equal(e.app.element.querySelector('.is-active').dataset.src,'tokens/eclipse.webp');
  assert.equal(e.app.element.querySelector('[data-role=selection-status]').textContent,'Em uso neste token');
  assert(e.app.element.querySelector('[data-action=switchImage]').disabled);
  e.app.render();await e.flush();assert.equal(e.app.element.querySelector('.is-active').dataset.src,'tokens/eclipse.webp');
  e.token.document.texture.src='tokens/eclipse.webp';e.w.Hooks.callAll('updateToken',e.token.document,{texture:{src:'tokens/eclipse.webp'}});
  assert.equal(e.app.confirmedTextures.size,0);
  e.dom.window.close();
});

test('Mudanças externas de textura atualizam todos os Wardrobes do destino, sem afetar outro token',async()=>{
  const e=environment();const second=new e.w.__wardrobe.TokenWardrobeApp({actorId:e.actor.id,tokenId:e.token.id});
  e.app.render();second.render();await e.flush();await second.pending;
  e.token.document.texture.src='tokens/aurora.webp';e.w.Hooks.callAll('updateToken',e.token.document,{'texture.src':'tokens/aurora.webp'});
  for(const app of [e.app,second])assert.equal(app.element.querySelector('.is-active').dataset.src,'tokens/aurora.webp');
  const select=e.app.element.querySelector('[data-role=token-select]');select.value=e.token2.id;select.dispatchEvent(new e.w.Event('change'));await e.flush();
  e.token.document.texture.src='tokens/eclipse.webp';e.w.Hooks.callAll('updateToken',e.token.document,{texture:{src:'tokens/eclipse.webp'}});
  assert.equal(e.app.element.querySelector('.is-active').dataset.src,'tokens/aurora.webp');
  assert.equal(second.element.querySelector('.is-active').dataset.src,'tokens/eclipse.webp');
  e.dom.window.close();
});

test('Falha ao aplicar mantém Em uso anterior e libera nova tentativa',async()=>{
  const e=environment();e.app.render();await e.flush();await e.click('[data-action=selectImage][data-id=a2]');
  e.token.document.update=async()=>{throw new Error('Teste de falha de atualização')};e.w.console.error=()=>{};
  await e.click('[data-action=switchImage]');
  assert.equal(e.app.element.querySelector('.is-active').dataset.src,'tokens/vanguarda.webp');
  assert.equal(e.app.element.querySelector('[data-role=selection-status]').textContent,'Prévia · ainda não aplicada');
  assert(!e.app.element.querySelector('[data-action=switchImage]').disabled);assert.equal(e.app.confirmedTextures.size,0);
  assert.equal(e.notifications.at(-1)[0],'error');e.dom.window.close();
});

test('Seleção durante aplicação não marca a nova prévia como Em uso nem permite requisição duplicada',async()=>{
  const e=environment();e.app.render();await e.flush();await e.click('[data-action=selectImage][data-id=a2]');
  let finish;const applied=new Promise(resolve=>{finish=resolve});e.token.document.update=async v=>{await applied;e.token.document.texture.src=v['texture.src']};
  e.app.element.querySelector('[data-action=switchImage]').click();const request=e.app.action;
  for(let i=0;i<8;i++)await Promise.resolve();
  e.app.element.querySelector('[data-action=selectImage][data-id=a3]').click();await e.app.action;await e.app.pending;
  assert(e.app.element.querySelector('[data-action=switchImage]').disabled);
  finish();await request;await e.flush();
  assert.equal(e.app.element.querySelector('.is-active').dataset.src,'tokens/eclipse.webp');
  assert.equal(e.app.element.querySelector('[data-role=selection-status]').textContent,'Prévia · ainda não aplicada');
  assert(!e.app.element.querySelector('[data-action=switchImage]').disabled);e.dom.window.close();
});


async function openEditor(e,id='a1'){
  await e.click('[data-action=selectImage][data-id='+id+']');await e.click('[data-action=editCrop]');
  const crop=[...e.w.__wardrobe.wardrobeApplications].find(app=>app instanceof e.w.__wardrobe.TokenCropperApp);
  assert(crop);await crop.pending;await crop.pendingImageLoad;return crop;
}
function installUpload(e,upload=async()=>({path:'tokens/updated.webp'})){
  e.w.FilePicker={upload};
  e.w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new e.w.Blob(['image'],{type:'image/webp'}))};
}

test('Cancelar durante carregamento aborta imagem e preserva DOM, busca, rolagem e biblioteca',async()=>{
  const e=environment();e.app.render();await e.flush();const source=e.app.element.querySelector('[data-role=search]');source.value='vanguarda';source.dispatchEvent(new e.w.Event('input'));
  const scroll=e.app.element.querySelector('.twl-gallery-scroll');scroll.scrollTop=54;scroll.dispatchEvent(new e.w.Event('scroll'));const previous=JSON.stringify(e.actor.state);
  const requests=[];e.w.Image=class{set src(v){requests.push(v)}};
  const crop=new e.w.__wardrobe.TokenCropperApp({actor:e.actor,token:e.token,source:'https://images.example/slow.png',returnApp:e.app});crop.render();await crop.pending;
  assert.equal(crop.imageState,'loading');assert(crop.element.querySelector('[data-action=saveCrop]').disabled);assert(!crop.element.querySelector('[data-action=cancelCrop]').disabled);
  crop.element.querySelector('[data-action=cancelCrop]').click();await crop.action;await crop.pendingImageLoad;
  assert(!crop.rendered);assert(crop.loadController.signal.aborted);assert(requests.includes(''));assert(e.app.rendered);
  assert.equal(e.app.element.querySelector('[data-role=search]'),source);assert.equal(scroll.scrollTop,54);assert.equal(JSON.stringify(e.actor.state),previous);assert.equal(e.updates.length,0);e.dom.window.close();
});

test('X nativo fecha durante carregamento sem reabrir janela nem emitir erro tardio',async()=>{
  const e=environment();e.w.Image=class{set src(v){}};
  const crop=new e.w.__wardrobe.TokenCropperApp({actor:e.actor,token:e.token,source:'art/vanguarda.png'});crop.render();await crop.pending;
  crop.window.close.click();await crop.closePending;await crop.pendingImageLoad;
  assert(!crop.rendered);assert(!e.app.rendered);assert.equal(e.notifications.length,0);assert(!e.w.__wardrobe.wardrobeApplications.has(crop));e.dom.window.close();
});

test('Erro de imagem permanece recuperável; retry e troca de original mantêm identidade da entrada',async()=>{
  const e=environment();e.app.render();await e.flush();const Image=e.w.Image;
  e.w.Image=class{set src(v){queueMicrotask(()=>v.includes('art/')?this.onerror?.():this.onload?.())}};e.w.console.warn=()=>{};
  await e.click('[data-action=editCrop]');const crop=[...e.w.__wardrobe.wardrobeApplications].find(x=>x instanceof e.w.__wardrobe.TokenCropperApp);await crop.pending;await crop.pendingImageLoad;
  assert(crop.rendered);assert.equal(crop.imageState,'error');assert(crop.element.querySelector('[data-action=saveCrop]').disabled);assert(!crop.element.querySelector('[data-action=retryImage]').hidden);
  assert.match(crop.element.querySelector('[data-role=image-status]').textContent,/Não foi possível carregar/);
  e.w.Image=Image;crop.element.querySelector('[data-action=retryImage]').click();await crop.action;
  assert.equal(crop.imageState,'ready');assert(!crop.element.querySelector('[data-action=saveCrop]').disabled);
  const input=crop.element.querySelector('[data-role=replacement-source]');input.value='https://images.example/new.png';crop.element.querySelector('[data-action=replaceSource]').click();await crop.action;
  assert.equal(crop.source,'https://images.example/new.png');assert.equal(crop.entryId,'a1');assert.equal(e.actor.state.gallery[0].source,'art/vanguarda.png');assert.equal(crop.imageState,'ready');await crop.close();e.dom.window.close();
});

test('Reenquadrar usa a original e salva na mesma entrada, preservando favorito, ordem e textura do token',async()=>{
  const e=environment();e.app.render();await e.flush();const crop=await openEditor(e);assert.equal(crop.source,'art/vanguarda.png');assert.equal(crop.returnApp,e.app);
  const zoom=crop.element.querySelector('[data-role=zoom]');zoom.value='2';zoom.dispatchEvent(new e.w.Event('input'));
  const name=crop.element.querySelector('[data-role=crop-name]');name.value='Vanguarda revisada';name.dispatchEvent(new e.w.Event('input'));
  installUpload(e);crop.element.querySelector('[data-action=saveCrop]').click();await crop.action;await e.flush();
  assert.equal(e.actor.state.gallery.length,3);const entry=e.actor.state.gallery.find(x=>x.id==='a1');assert.equal(entry.name,'Vanguarda revisada');assert.equal(entry.favorite,true);assert.equal(entry.order,0);assert.equal(entry.crop.zoom,2);assert.match(entry.src,/tokens\/updated.webp/);assert.equal(entry.source,'art/vanguarda.png');
  assert(!crop.rendered);assert.equal(e.token.document.texture.src,'tokens/vanguarda.webp');assert.equal(e.updates.length,0);assert.equal(e.app.selectedId,'a1');assert.match(e.app.element.querySelector('.twl-preview-stage img').src,/updated.webp/);e.dom.window.close();
});

test('Falha de upload mantém editor e recorte para nova tentativa',async()=>{
  const e=environment();e.app.render();await e.flush();const crop=await openEditor(e);crop.crop.zoom=2;const previous=JSON.stringify(e.actor.state);
  installUpload(e,async()=>{throw new Error('upload failed')});e.w.console.error=()=>{};
  crop.element.querySelector('[data-action=saveCrop]').click();await crop.action;
  assert(crop.rendered);assert.equal(crop.crop.zoom,2);assert.equal(crop.savePending,false);assert(!crop.element.querySelector('[data-action=saveCrop]').disabled);assert(!crop.window.close.disabled);assert.equal(JSON.stringify(e.actor.state),previous);await crop.close();e.dom.window.close();
});

test('Salvar bloqueia cancelar e X até terminar, com um único upload e fechamento',async()=>{
  const e=environment();e.app.render();await e.flush();const crop=await openEditor(e);
  let finish;const uploading=new Promise(resolve=>{finish=resolve});let uploads=0;installUpload(e,async()=>{uploads++;await uploading;return {path:'tokens/updated.webp'}});
  crop.element.querySelector('[data-action=saveCrop]').click();const action=crop.action;for(let i=0;i<10;i++)await Promise.resolve();
  assert(crop.savePending);assert(crop.element.querySelector('[data-action=cancelCrop]').disabled);assert(crop.window.close.disabled);await crop.close();assert(crop.rendered);
  crop.element.querySelector('[data-action=saveCrop]').click();finish();await action;assert.equal(uploads,1);assert(!crop.rendered);e.dom.window.close();
});

test('Reabrir a mesma aparência foca o editor atual; entradas diferentes têm IDs únicos',async()=>{
  const e=environment();e.app.render();await e.flush();const crop=await openEditor(e);crop.crop.zoom=2;
  await e.click('[data-action=editCrop]');assert.equal(e.w.__wardrobe.openCroppers.size,1);assert.equal(crop.crop.zoom,2);
  await e.click('[data-action=selectImage][data-id=a2]');await e.click('[data-action=editCrop]');const other=[...e.w.__wardrobe.openCroppers.values()].find(x=>x!==crop);await other.pending;await other.pendingImageLoad;assert.notEqual(crop.options.id,other.options.id);
  await crop.close();await other.close();assert.equal(e.w.__wardrobe.openCroppers.size,0);e.dom.window.close();
});

test('Re-render preserva nome e recorte, reutiliza imagens já carregadas',async()=>{
  const e=environment();e.app.render();await e.flush();const crop=await openEditor(e);const image=crop.sourceImage;
  const name=crop.element.querySelector('[data-role=crop-name]');name.value='Nome em edição';name.dispatchEvent(new e.w.Event('input'));crop.crop.zoom=2;
  crop.render();await crop.pending;assert.equal(crop.sourceImage,image);assert.equal(crop.crop.zoom,2);assert.equal(crop.element.querySelector('[data-role=crop-name]').value,'Nome em edição');assert.equal(crop.imageState,'ready');await crop.close();e.dom.window.close();
});

test('Carregamento tem prazo e suporta abortar sem aguardar resposta remota',async()=>{
  const e=environment();e.w.Image=class{set src(v){}};
  await assert.rejects(e.w.__wardrobe.loadImage('https://images.example/slow.png',{timeoutMs:10}),/TW_IMAGE_LOAD_TIMEOUT/);
  const controller=new e.w.AbortController();const request=e.w.__wardrobe.loadImage('https://images.example/slow.png',{signal:controller.signal});controller.abort();await assert.rejects(request,/TW_IMAGE_LOAD_ABORTED/);e.dom.window.close();
});


test('Arrasto respeita escala da imagem quadrada em área de preview retangular',async()=>{
  const e=environment();e.app.render();await e.flush();const crop=await openEditor(e);crop.crop.zoom=2;
  const canvas=crop.element.querySelector('[data-role=crop-canvas]');canvas.getBoundingClientRect=()=>({width:600,height:300});
  canvas.dispatchEvent(new e.w.MouseEvent('pointerdown',{clientX:100,clientY:100}));canvas.dispatchEvent(new e.w.MouseEvent('pointermove',{clientX:130,clientY:130}));
  assert(Math.abs(crop.crop.panX-51.2)<0.0001);assert(Math.abs(crop.crop.panY-51.2)<0.0001);
  await crop.close();e.dom.window.close();
});

test('Falha ao fechar permite tentar novamente e não remove registro de editor aberto',async()=>{
  const e=environment();e.w.Image=class{set src(v){}};
  const crop=new e.w.__wardrobe.TokenCropperApp({actor:e.actor,token:e.token,source:'art/vanguarda.png'});crop.render();await crop.pending;
  const Base=e.w.foundry.applications.api.ApplicationV2,close=Base.prototype.close;let attempt=0;Base.prototype.close=async function(options){if(attempt++===0)throw new Error('temporary close failure');return close.call(this,options)};
  await assert.rejects(crop.close(),/temporary close failure/);assert(crop.rendered);assert.equal(crop.closed,false);assert.equal(crop.closePending,null);assert(e.w.__wardrobe.wardrobeApplications.has(crop));assert.equal(crop.imageState,'error');
  await crop.close();assert(!crop.rendered);e.dom.window.close();
});

test('Preparar uma nova imagem cria só uma entrada e não modifica aparências existentes',async()=>{
  const e=environment();e.app.render();await e.flush();const appearance=({id,name,favorite,source,src,order,crop})=>({id,name,favorite,source,src,order,crop});const previous=JSON.stringify(e.actor.state.gallery.map(appearance));
  const crop=new e.w.__wardrobe.TokenCropperApp({actor:e.actor,token:e.token,source:'https://images.example/new.png',name:'Nova',returnApp:e.app});crop.render();await crop.pending;await crop.pendingImageLoad;installUpload(e);
  crop.element.querySelector('[data-action=saveCrop]').click();await crop.action;await e.flush();assert.equal(e.actor.state.gallery.length,4);assert.equal(JSON.stringify(e.actor.state.gallery.slice(0,3).map(appearance)),previous);assert.equal(e.actor.state.gallery[3].name,'Nova');assert.equal(e.token.document.texture.src,'tokens/vanguarda.webp');assert(!crop.rendered);e.dom.window.close();
});
