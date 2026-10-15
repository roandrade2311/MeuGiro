import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cfg=window.MEUGIRO_CONFIG||{};
const auth=document.getElementById('auth'),content=document.getElementById('appContent'),nav=document.querySelector('nav');
const msg=document.getElementById('authMessage'),status=document.getElementById('syncStatus');
let client=null,user=null,role='entregador',owner=null,loaded=false,dirty=false,saving=false;
const setStatus=t=>{status.textContent=t};
function gate(logged){auth.classList.toggle('hidden',logged);content.classList.toggle('hidden',!logged);nav.classList.toggle('hidden',!logged)}
function lockReadOnly(readOnly){window.MG_READ_ONLY=readOnly;document.querySelectorAll('nav button[data-tab="add"],nav button[data-tab="settings"],#home button,#history button.btn.danger,#entries button,#payments button,#restore').forEach(el=>{if(readOnly)el.classList.add('hidden');else el.classList.remove('hidden')});document.querySelectorAll('#history button').forEach(b=>{if(b.textContent==='Exportar CSV'||b.textContent==='Baixar backup JSON')b.classList.remove('hidden')});}
function validData(data){return data&&typeof data==='object'&&data.settings&&Array.isArray(data.days)&&Array.isArray(data.payments)}
async function load(){loaded=false;const id=owner||user.id;const {data,error}=await client.from('finance_data').select('data').eq('owner_id',id).maybeSingle();if(error)throw error;
if(data&&validData(data.data)){window.MG_APP.set(data.data)}else if(role==='entregador'){
 const old=localStorage.getItem('motolucro-v1');if(old){try{let previous=JSON.parse(old);if(validData(previous)&&confirm('Encontramos dados antigos do MotoLucro neste celular. Deseja importá-los para sua conta MeuGiro?')){window.MG_APP.set(previous);dirty=true}}catch{}}
 if(!dirty)window.MG_APP.set({settings:{rent:0,period:'weekly',target:3000},days:[],payments:[]});
}else window.MG_APP.set({settings:{rent:0,period:'weekly',target:3000},days:[],payments:[]});
loaded=true;window.MG_APP.render();if(dirty)await save();else setStatus('Dados sincronizados.');}
async function save(){if(!client||!user||role!=='entregador'||!loaded)return;if(saving){dirty=true;return}dirty=true;saving=true;setStatus('Salvando na nuvem…');try{const {error}=await client.from('finance_data').upsert({owner_id:user.id,data:window.MG_APP.get(),updated_at:new Date().toISOString()},{onConflict:'owner_id'});if(error)throw error;dirty=false;setStatus('Salvo na nuvem ✓')}catch(e){setStatus('Falha ao sincronizar: '+e.message+' — exporte um backup antes de sair.')}finally{saving=false;if(dirty&&navigator.onLine){setTimeout(()=>{if(!saving&&dirty)save()},1500)}}}
window.addEventListener('meugiro:changed',()=>{if(loaded&&role==='entregador'){dirty=true;save()}});
async function initialize(session){user=session?.user||null;loaded=false;if(!user){gate(false);return}try{
 const {data:profile,error:pErr}=await client.from('profiles').select('role').eq('id',user.id).single();if(pErr)throw pErr;role=profile.role;
 if(role==='admin'){const {data:access,error:aErr}=await client.from('admin_access').select('owner_id').eq('admin_id',user.id).limit(1);if(aErr)throw aErr;owner=access?.[0]?.owner_id||null;if(!owner)throw Error('Nenhum entregador autorizou este administrador.');}else{owner=user.id;}
 document.getElementById('userEmail').textContent=user.email||'';document.getElementById('userRole').textContent=role==='admin'?'Administrador — somente leitura':'Entregador — seus dados';gate(true);lockReadOnly(role==='admin');await load();
}catch(e){gate(false);msg.textContent='Não foi possível abrir sua conta: '+e.message;}}
if(!cfg.supabaseUrl||!cfg.supabaseAnonKey){gate(false);msg.textContent='O administrador precisa configurar o Supabase no arquivo config.js antes do primeiro acesso.';}else{
 client=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();msg.textContent='Entrando…';const email=document.getElementById('loginEmail').value.trim(),password=document.getElementById('loginPassword').value;const {data,error}=await client.auth.signInWithPassword({email,password});document.getElementById('loginPassword').value='';if(error){msg.textContent='Não foi possível entrar. Confira e-mail, senha e confirmação de conta.';return}msg.textContent='';await initialize(data.session)});
 document.getElementById('resetPassword').onclick=async()=>{const email=document.getElementById('loginEmail').value.trim();if(!email){msg.textContent='Digite seu e-mail primeiro.';return}const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});msg.textContent=error?'Não foi possível enviar o e-mail de recuperação.':'Se a conta existir, você receberá instruções por e-mail.'};
 document.getElementById('logoutBtn').onclick=async()=>{if(dirty&&!confirm('Pode haver dados ainda não sincronizados. Deseja sair?'))return;await client.auth.signOut();user=null;owner=null;loaded=false;window.MG_APP.set({settings:{rent:0,period:'weekly',target:3000},days:[],payments:[]});gate(false)};
 const {data}=await client.auth.getSession();await initialize(data.session);
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){user=null;gate(false)}else if(event==='PASSWORD_RECOVERY'){msg.textContent='Para alterar sua senha, use o painel de autenticação do Supabase ou solicite ajuda ao administrador.'}});
}

// Impede novos lançamentos sem conexão: esta versão não oferece fila offline.
for(const formId of ['dayForm','settingsForm','paymentForm']){
 const form=document.getElementById(formId);
 form.addEventListener('submit',event=>{if(!navigator.onLine){event.preventDefault();event.stopImmediatePropagation();alert('Sem internet. Conecte-se antes de salvar para evitar perda de dados.')}},true);
}
window.addEventListener('offline',()=>setStatus('Sem conexão: não registre novos dados até voltar a internet.'));
window.addEventListener('online',()=>{if(dirty)save();else if(user)setStatus('Conexão restabelecida.')});
