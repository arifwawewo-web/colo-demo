/* Colosseum PAI — Demo Online V1
   Multiplayer memakai PeerJS sebagai kanal P2P signaling/data.
   Host memegang state permainan; peserta hanya mengirim jawaban.
*/

const DEMO_QUESTIONS = [
  {materi:'Aqidah',kelas:'5',semester:'1',q:'Rukun iman yang pertama adalah iman kepada...',a:'Allah',o:['Malaikat','Kitab','Rasul']},
  {materi:'Aqidah',kelas:'5',semester:'1',q:'Malaikat yang bertugas menyampaikan wahyu adalah...',a:'Jibril',o:['Mikail','Israfil','Izrail']},
  {materi:'Akhlaq',kelas:'5',semester:'1',q:'Sikap berkata sesuai kenyataan disebut...',a:'Jujur',o:['Sombong','Dengki','Lalai']},
  {materi:'Al-Qur\'an',kelas:'5',semester:'1',q:'Surah Al-Ikhlas menjelaskan tentang...',a:'Keesaan Allah',o:['Hukum waris','Kisah perang','Tata cara haji']},
  {materi:'Fiqih',kelas:'5',semester:'1',q:'Shalat wajib dalam sehari semalam berjumlah...',a:'5 waktu',o:['3 waktu','4 waktu','6 waktu']},
  {materi:'Tarikh',kelas:'5',semester:'1',q:'Nabi Muhammad ﷺ hijrah dari Makkah menuju...',a:'Madinah',o:['Thaif','Syam','Yaman']},
  {materi:'Aqidah',kelas:'5',semester:'1',q:'Kitab yang diturunkan kepada Nabi Musa a.s. adalah...',a:'Taurat',o:['Zabur','Injil','Al-Qur\'an']},
  {materi:'Akhlaq',kelas:'5',semester:'1',q:'Menghormati orang tua merupakan contoh akhlak...',a:'Terpuji',o:['Tercela','Mubah','Makruh']}
];

const $ = id => document.getElementById(id);
const screens = ['screen-intro','screen-role','screen-host-setup','screen-host-lobby','screen-player-join','screen-player-lobby','screen-roulette','screen-briefing','screen-battle','screen-player-answer'];

const Sound = {
  enabled:true, ctx:null,
  get(){if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return null; this.ctx=new AC()} return this.ctx},
  tone(freq,duration,type='sine',delay=0,gain=.12){if(!this.enabled)return;try{const c=this.get();if(!c)return;const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;o.connect(g);g.connect(c.destination);const t=c.currentTime+delay;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.start(t);o.stop(t+duration)}catch(e){}},
  correct(){this.tone(523,.15,'triangle');this.tone(784,.2,'triangle',.12)}, wrong(){this.tone(180,.3,'sawtooth',0,.1)}, victory(){[523,659,784,1046].forEach((f,i)=>this.tone(f,.22,'triangle',i*.12))}, kingChange(){[392,523,659].forEach((f,i)=>this.tone(f,.13,'triangle',i*.12))}
};

const App = {
  mode:null, peer:null, roomCode:null, hostConn:null, connections:new Map(),
  hostState:{players:[],king:null,queue:[],scores:{},round:1,maxRounds:2,duelIndex:0,question:null,options:[],answerLetter:null,timeLeft:12,answered:{king:false,chal:false},timer:null,locked:false,materi:'Aqidah',kelas:'5',semester:'1',phase:'lobby',paused:false},
  player:{name:'',role:null},
  roasts:{kingWins:['Gladiator ${target}, tahta ini bukan untukmu! Raja masih terlalu kuat.','${target}, latihan lagi! Kau belum pantas merebut mahkota Raja.','Cuma begitu kemampuanmu, ${target}? Raja masih berdiri tegak!'],chalWins:['Raja ${target}, turun dari tahta! Mahkota sekarang milikku!','Payah sekali, ${target}! Tahta ini sudah berpindah tangan.','Raja ${target}, rakyat memilih pemenang baru!'],audience:['DEWA KECEWA! ${k} dan ${c} sama-sama membuat duel ini memalukan.','Apa yang kalian lakukan, ${k} dan ${c}? Dewa sampai geleng-geleng kepala!','Duel macam apa ini? ${k} dan ${c} sama-sama mengecewakan para dewa!']},

  init(){
    this.bind();
    setTimeout(()=>{['i1','i2','i3'].forEach((id,i)=>setTimeout(() => $(id).style.opacity=1,1000+i*1500));setTimeout(()=>$('intro-actions').style.opacity=1,5500)},300);
  },
  show(id){screens.forEach(s=>$(s).classList.add('hidden'));$(id).classList.remove('hidden')},
  bind(){
    $('btn-open').onclick=()=>this.show('screen-role'); $('btn-quick-demo').onclick=()=>this.quickDemo();
    $('choose-host').onclick=()=>{this.mode='host';this.show('screen-host-setup')}; $('choose-player').onclick=()=>{this.mode='player';this.show('screen-player-join')};
    $('back-role-1').onclick=()=>this.show('screen-role'); $('back-role-2').onclick=()=>this.show('screen-role');
    $('create-room').onclick=()=>this.createRoom(); $('join-room').onclick=()=>this.joinRoom(); $('copy-room').onclick=()=>navigator.clipboard?.writeText(this.roomCode);
    $('close-room').onclick=()=>this.resetToRole(); $('solo-demo').onclick=()=>this.quickDemo(); $('start-online-game').onclick=()=>this.startOnlineGame(); $('btn-start-duel').onclick=()=>this.hostStartDuel();
    $('btn-sound').onclick=()=>{Sound.enabled=!Sound.enabled;$('btn-sound').innerText=Sound.enabled?'🔊':'🔇'};
    $('demo-king-win').onclick=()=>this.demoRoast('king'); $('demo-chal-win').onclick=()=>this.demoRoast('chal'); $('demo-god').onclick=()=>this.demoRoast('god');
    $('close-alert').onclick=()=>this.closeAlert(); $('btn-pause').onclick=()=>this.togglePause();
    document.querySelectorAll('.answer-grid button').forEach(b=>b.onclick=()=>this.playerAnswer(b.dataset.answer));
  },
  quickDemo(){
    this.mode='host'; this.roomCode='DEMO01'; this.hostState.players=['Budi','Siti','Andi','Rina']; this.hostState.scores=Object.fromEntries(this.hostState.players.map(n=>[n,0])); this.hostState.king='Budi'; this.hostState.queue=['Siti','Andi','Rina']; this.hostState.maxRounds=2; this.hostState.phase='lobby'; this.hostState.demo=true; this.renderLobby(); this.show('screen-host-lobby');
  },
  createRoom(){
    const name=($('host-name').value||'Narasumber').trim();
    this.hostState.materi=$('materi-select').value;this.hostState.kelas=$('kelas-select').value;this.hostState.semester=$('semester-select').value;this.hostState.maxRounds=Number($('ronde-select').value)||2;
    const code=this.makeCode();this.roomCode=code;
    this.peer=new Peer('pai-'+code,{debug:1});
    this.peer.on('open',()=>{this.renderLobby();this.show('screen-host-lobby')});
    this.peer.on('connection',conn=>this.handleHostConnection(conn));
    this.peer.on('error',e=>this.alert('KONEKSI HOST',e.type==='unavailable-id'?'Kode room bentrok. Klik buat room lagi.':e.message||'Koneksi PeerJS bermasalah.'));
    this.hostState.hostName=name;
  },
  makeCode(){return 'PAI'+Math.random().toString(36).slice(2,5).toUpperCase()},
  handleHostConnection(conn){
    conn.on('open',()=>{this.connections.set(conn.peer,conn);conn.on('data',m=>this.handleHostMessage(conn,m));conn.on('close',()=>{this.removePlayer(conn.peer)});conn.send({type:'hello',room:this.roomCode})});
  },
  handleHostMessage(conn,m){
    if(!m||!m.type)return;
    if(m.type==='join'){
      const name=(m.name||'Gladiator').trim().slice(0,30); if(this.hostState.players.includes(name)){conn.send({type:'error',message:'Nama sudah dipakai.'});return}
      this.hostState.players.push(name);this.hostState.scores[name]=0;conn.playerName=name;this.broadcastLobby();this.sendTo(conn,{type:'joined',name,room:this.roomCode});
    }
    if(m.type==='answer' && this.mode==='host') this.receiveAnswer(m.name,m.answer);
  },
  removePlayer(peer){const c=this.connections.get(peer);if(c?.playerName){this.hostState.players=this.hostState.players.filter(n=>n!==c.playerName);delete this.hostState.scores[c.playerName];this.broadcastLobby()}this.connections.delete(peer)},
  broadcast(msg){this.connections.forEach(c=>{try{c.send(msg)}catch(e){}})},
  sendTo(conn,msg){try{conn.send(msg)}catch(e){}},
  broadcastLobby(){this.renderLobby();this.broadcast({type:'lobby',players:this.hostState.players})},
  renderLobby(){
    $('host-room-code').textContent=this.roomCode;$('host-count').textContent=this.hostState.players.length;
    $('host-player-list').innerHTML=this.hostState.players.length?this.hostState.players.map(n=>`<div class="player-chip"><span class="dot">●</span> ${this.esc(n)}</div>`).join(''):'<div class="demo-note">Belum ada peserta. Bagikan kode room.</div>';
  },
  joinRoom(){
    const code=($('join-code').value||'').trim().toUpperCase();const name=($('player-name').value||'').trim();if(!/^PAI[A-Z0-9]{3}$/.test(code)){this.setJoinStatus('Kode room tidak valid.');return}if(!name){this.setJoinStatus('Nama harus diisi.');return}
    this.player.name=name;this.roomCode=code;this.setJoinStatus('Menghubungkan ke room...');
    this.peer=new Peer();this.peer.on('open',()=>{this.hostConn=this.peer.connect('pai-'+code,{reliable:true});this.hostConn.on('open',()=>{this.hostConn.send({type:'join',name});this.show('screen-player-lobby');$('player-room-code').textContent=code;$('player-welcome').textContent=name})});
    this.peer.on('error',e=>this.setJoinStatus('Gagal terhubung: '+(e.message||e.type)));
    this.peer.on('connection',()=>{});
    this.waitForHost();
  },
  waitForHost(){
    const check=setInterval(()=>{if(this.hostConn){clearInterval(check);this.hostConn.on('data',m=>this.handlePlayerMessage(m));this.hostConn.on('close',()=>this.setJoinStatus('Room ditutup oleh host.'))}},100)
  },
  handlePlayerMessage(m){
    if(!m)return;
    if(m.type==='error'){this.setJoinStatus(m.message);return}
    if(m.type==='joined'){this.show('screen-player-lobby');return}
    if(m.type==='lobby'){this.updatePlayerLobby(m.players);return}
    if(m.type==='roulette'){this.showPlayerRoulette(m);return}
    if(m.type==='briefing'){this.showPlayerBriefing(m);return}
    if(m.type==='battle'){this.showPlayerBattle(m);return}
    if(m.type==='timer'){this.playerTimer(m.time);return}
    if(m.type==='feedback'){this.showPlayerFeedback(m);return}
    if(m.type==='final'){this.showPlayerFinal(m);return}
    if(m.type==='paused'){$('player-role-status').textContent='PERTANDINGAN DIJEDA';return}
  },
  updatePlayerLobby(players){$('player-role-status').textContent=players.includes(this.player.name)?`ONLINE • ${players.length} GLADIATOR • Kamu akan masuk antrean duel`:'MENUNGGU';},
  showPlayerBattle(m){
    $('player-room-small').textContent=this.roomCode;$('player-current-name').textContent=this.player.name;
    const isKing=m.king===this.player.name;
    const isChal=m.chal===this.player.name;
    const active=isKing||isChal;
    this.player.role=isKing?'king':isChal?'chal':'spectator';
    $('player-role-icon').textContent=isKing?'👑':isChal?'⚔️':'👥';
    $('player-role-title').textContent=isKing?'RAJA':isChal?'PENANTANG':'MENUNGGU GILIRAN';
    $('player-question-mini').textContent=active
      ? 'DUEL AKTIF — Soal ada di layar utama. Jawab dari perangkatmu.'
      : 'SEDANG MENUNGGU GILIRAN MELAWAN RAJA';
    document.querySelectorAll('.answer-grid button').forEach(b=>{b.disabled=!active;b.classList.remove('selected')});
    $('player-answer-status').textContent=active?'Pilih jawaban A, B, C, atau D.':'SEDANG MENUNGGU GILIRAN MELAWAN RAJA';
    this.show('screen-player-answer');
  },
  playerTimer(t){$('player-time').textContent=Math.max(0,t);if(this.player.role) document.querySelector('.player-timer').style.borderColor=t<=3?'var(--blood)':'var(--gold)'},
  playerAnswer(answer){if(!this.hostConn||!['king','chal'].includes(this.player.role))return;document.querySelectorAll('.answer-grid button').forEach(b=>b.disabled=true);$('player-answer-status').textContent='Jawaban terkirim: '+answer;this.hostConn.send({type:'answer',name:this.player.name,answer})},
  showPlayerFeedback(m){
    $('player-answer-status').textContent=m.title+(m.winner?` • ${m.winner}`:'');
    document.querySelectorAll('.answer-grid button').forEach(b=>b.disabled=true);
    const overlay=$('result-overlay');
    if(!overlay)return;
    const winnerLine=m.winner?`<div class="feedback-winner">🏆 PEMENANG: ${this.esc(m.winner)}</div>`:'';
    overlay.innerHTML=`<div class="feedback-kicker">${this.esc(m.kicker||'⚔️ HASIL DUEL')}</div><h1 style="font-size:clamp(2.2rem,7vw,4rem);font-family:'Cinzel';color:white;margin:0">${this.esc(m.title||'HASIL PERTARUNGAN')}</h1>${winnerLine}<div class="roast-text">"${this.esc(m.roast||'Pertarungan selesai!')}"</div>`;
    overlay.classList.remove('hidden');
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer=setTimeout(()=>overlay.classList.add('hidden'),2700);
  },
  showPlayerFinal(m){this.renderFinalRanking(m.sorted||[]);this.show('screen-final');},
  showPlayerRoulette(m){this.renderRoulette(m.players||[],m.king);$('roulette-result').textContent='MENGACAK TAKDIR...';this.show('screen-roulette');setTimeout(()=>{$('roulette-result').textContent='👑 RAJA TERPILIH: '+(m.king||'-')},Math.max(1200,m.duration||5200));},
  showPlayerBriefing(m){this.renderBriefing(m.king,m.queue);$('brief-status').textContent='Menunggu host menekan MULAI DUEL...';$('btn-start-duel').classList.add('hidden');this.show('screen-briefing');},
  startOnlineGame(){
    if(this.hostState.players.length<2){this.alert('PESERTA BELUM CUKUP','Masukkan minimal 2 guru. Untuk uji tampilan gunakan DEMO SENDIRI.');return}
    this.hostState.king=this.hostState.players[Math.floor(Math.random()*this.hostState.players.length)];
    this.hostState.queue=this.hostState.players.filter(n=>n!==this.hostState.king);
    this.hostState.scores=Object.fromEntries(this.hostState.players.map(n=>[n,0]));
    this.hostState.round=1;this.hostState.duelIndex=0;this.hostState.phase='roulette';
    this.showRoulette();
  },
  showRoulette(){
    const s=this.hostState;this.renderRoulette(s.players,s.king);$('roulette-result').textContent='MENGACAK TAKDIR...';this.show('screen-roulette');
    this.broadcast({type:'roulette',players:s.players,king:s.king,duration:5200});
    Sound.kingChange();
    setTimeout(()=>{Sound.victory();$('roulette-result').textContent='👑 RAJA TERPILIH: '+s.king;},4700);
    setTimeout(()=>this.showBriefing(),5600);
  },
  renderRoulette(players,winner){
    const strip=$('roulette-strip');
    if(!strip || !players.length)return;
    const names=[];
    for(let i=0;i<6;i++) names.push(...players);
    strip.innerHTML=names.map(n=>`<span>${this.esc(n)}</span>`).join('');
    strip.style.transition='none';
    strip.style.transform='translateX(0)';
    void strip.offsetWidth;
    const winnerIndex=Math.max(0,players.indexOf(winner||this.hostState.king));
    // Targetkan kemunculan ketiga dari nama pemenang tepat di bawah jarum tengah.
    const targetIndex=(players.length*2)+winnerIndex;
    const itemWidth=190;
    const stageWidth=strip.parentElement.clientWidth || 900;
    const shift=(stageWidth/2)-((targetIndex+0.5)*itemWidth);
    strip.style.transition='transform 5s cubic-bezier(.08,.72,.12,1)';
    strip.style.transform=`translateX(${shift}px)`;
  },
  showBriefing(){
    const s=this.hostState;s.phase='briefing';this.renderBriefing(s.king,s.queue);$('brief-status').textContent='Raja telah dipilih. Periksa antrean sebelum duel dimulai.';$('btn-start-duel').classList.remove('hidden');this.show('screen-briefing');this.broadcast({type:'briefing',king:s.king,queue:s.queue});
  },
  renderBriefing(king,queue){
    $('brief-king').textContent=king||'-';$('brief-chal').textContent=queue?.[0]||'-';$('brief-queue').innerHTML=(queue||[]).map((n,i)=>`<div class="brief-chip ${i===0?'active':''}"><b>#${i+1}</b><span>${this.esc(n)}</span>${i===0?'<em>DUEL PERTAMA</em>':''}</div>`).join('')||'<div class="demo-note">Tidak ada antrean.</div>';
  },
  hostStartDuel(){if(this.mode!=='host'||this.hostState.phase!=='briefing')return;$('btn-start-duel').disabled=true;$('brief-status').textContent='GERBANG DIBUKA — DUEL DIMULAI!';this.hostState.phase='battle';this.beginDuel();},
  beginDuel(){
    const s=this.hostState;
    $('demo-controls')?.classList.toggle('hidden', !s.demo);if(s.round>s.maxRounds)return this.finishGame();
    if(!s.queue.length)return this.finishGame();
    s.locked=false;s.answered={king:false,chal:false};
    // HANYA satu Penantang aktif pada setiap duel: orang pertama di antrean.
    // Semua pemain lain tetap penonton/antrean dan tidak dapat mengirim jawaban.
    s.chal=s.queue[0];s.duelIndex++;
    const pool=DEMO_QUESTIONS.filter(q=>q.materi===s.materi&&q.kelas===s.kelas&&q.semester===s.semester);const source=pool.length?pool:DEMO_QUESTIONS;const q=source[Math.floor(Math.random()*source.length)];
    const opts=[q.a,...q.o].sort(()=>Math.random()-.5);s.question=q;s.options=opts;s.answerLetter=String.fromCharCode(65+opts.indexOf(q.a));s.timeLeft=12;
    this.renderArena();this.broadcast({type:'battle',king:s.king,chal:s.chal,round:s.round,duel:s.duelIndex,question:q.q,options:opts});this.show('screen-battle');this.startHostTimer();
  },
  renderArena(){const s=this.hostState;$('king-name').textContent=s.king;$('chal-name').textContent=s.chal;$('king-score').textContent=s.scores[s.king]||0;$('chal-score').textContent=s.scores[s.chal]||0;$('round-info').textContent=`PUTARAN ${s.round} - DUEL ${s.duelIndex}`;$('q-text').textContent=s.question.q;$('opt-text').innerHTML=s.options.map((o,i)=>`<div><b>${String.fromCharCode(65+i)}.</b> ${this.esc(o)}</div>`).join('');$('arena-status').textContent=`DUEL AKTIF: ${s.king} 👑 VS ${s.chal} ⚔️ — Peserta lain menunggu antrean.`;const total=s.maxRounds*s.queue.length; $('progress-text').textContent=`Duel ${s.duelIndex} / ${total}`;$('progress-bar-inner').style.width=Math.min(100,((s.duelIndex-1)/total)*100)+'%';$('next-up-list').innerHTML=s.queue.slice(1).map((n,i)=>`<div class="next-up-chip ${i===0?'next-up-soon':''}"><span style="color:var(--gold);font-weight:bold">#${i+1}</span> ${this.esc(n)}</div>`).join('')||'<div class="next-up-chip">— Duel terakhir di antrean —</div>';}
  ,
  startHostTimer(){clearInterval(this.hostState.timer);this.hostState.timer=setInterval(()=>{if(this.hostState.locked)return;this.hostState.timeLeft--;this.updateArenaTimer();this.broadcast({type:'timer',time:this.hostState.timeLeft});if(this.hostState.timeLeft<=0){clearInterval(this.hostState.timer);this.hostState.locked=true;this.finishDuel(null,'DEWA KECEWA!')}},1000);this.updateArenaTimer()},
  updateArenaTimer(){const t=this.hostState.timeLeft;$('timer-bar-inner').style.width=(t/12*100)+'%';$('timer-bar-inner').classList.toggle('timer-warn',t<=6&&t>3);$('timer-bar-inner').classList.toggle('timer-danger',t<=3)},
  receiveAnswer(name,answer){const s=this.hostState;if(s.locked)return;const side=name===s.king?'king':name===s.chal?'chal':null;if(!side||s.answered[side])return;if(answer===s.answerLetter){s.locked=true;clearInterval(s.timer);s.scores[name]=(s.scores[name]||0)+10;Sound.correct();const loser=side==='king'?s.chal:s.king;this.finishDuel(side==='king'?s.king:s.chal,side==='king'?'RAJA BERTAHAN!':'TAHTA DIREBUT!',loser,side)}else{s.answered[side]=true;Sound.wrong();if(s.answered.king&&s.answered.chal){s.locked=true;clearInterval(s.timer);this.finishDuel(null,'DEWA KECEWA!')}}},
  finishDuel(winner,title,loser,side){const s=this.hostState;let roast,kicker;if(winner){const list=side==='king'?this.roasts.kingWins:this.roasts.chalWins;roast=list[Math.floor(Math.random()*list.length)].replaceAll('${target}',loser);kicker=side==='king'?`👑 RAJA ${winner} MEROSTING ⚔️ GLADIATOR ${loser}`:`⚔️ GLADIATOR ${winner} MEROSTING 👑 RAJA ${loser}`}else{roast=this.roasts.audience[Math.floor(Math.random()*this.roasts.audience.length)].replaceAll('${k}',s.king).replaceAll('${c}',s.chal);kicker=`⚡ DEWA KECEWA DENGAN DUEL 👑 ${s.king} VS ⚔️ ${s.chal}`}this.showResult(title,roast,kicker,winner);this.broadcast({type:'feedback',title,roast,winner,kicker});setTimeout(()=>{if(side==='chal'){
        // Penantang menang: ia naik menjadi Raja, Raja lama masuk ke belakang antrean.
        const oldKing=s.king;
        const newKing=s.queue.shift();
        s.king=newKing;
        s.queue.push(oldKing);
        Sound.kingChange();
      }else{
        // Raja menang: Raja tetap, Penantang aktif dipindah ke belakang antrean.
        const defeatedChallenger=s.queue.shift();
        s.queue.push(defeatedChallenger);
      }if(s.duelIndex%s.queue.length===0)s.round++;this.beginDuel()},2800)},
  demoRoast(type){
    const s=this.hostState;
    if(this.mode!=='host'||!s.demo||s.phase!=='battle')return;
    clearInterval(s.timer); s.locked=true;
    if(type==='king'){s.scores[s.king]=(s.scores[s.king]||0)+10;this.finishDuel(s.king,'RAJA BERTAHAN!',s.chal,'king');}
    else if(type==='chal'){s.scores[s.chal]=(s.scores[s.chal]||0)+10;this.finishDuel(s.chal,'TAHTA DIREBUT!',s.king,'chal');}
    else{this.finishDuel(null,'DEWA KECEWA!',null,null);}
  },
  showResult(title,roast,kicker,winner){const overlay=$('result-overlay');if(!overlay)return;clearTimeout(this.resultTimer);overlay.classList.remove('hidden');overlay.style.display='flex';overlay.style.visibility='visible';overlay.style.opacity='1';overlay.style.zIndex='99999';overlay.innerHTML=`<div class="feedback-kicker">${this.esc(kicker||'⚔️ HASIL DUEL')}</div><div class="feedback-title">${this.esc(title)}</div>${winner?`<div class="feedback-winner">🏆 PEMENANG: ${this.esc(winner)}</div>`:''}<div class="roast-label">🔥 ROASTING</div><div class="roast-text">“${this.esc(roast||'Duel ini membuat para dewa kecewa!')}”</div>`;this.resultTimer=setTimeout(()=>{overlay.classList.add('hidden');overlay.style.display='none'},5000)},
  finishGame(){
    const s=this.hostState;
    clearInterval(s.timer);
    s.timer=null;
    s.phase='final';
    Sound.victory();
    const sorted=Object.entries(s.scores).sort((a,b)=>b[1]-a[1]);
    const winner=sorted[0]?.[0]||'';
    this.renderFinalRanking(sorted);
    this.show('screen-final');
    this.broadcast({type:'final',winner,sorted});
    this.confetti();
  },
  renderFinalRanking(sorted){
    const titles=['KAISAR ARENA 👑','GLADIATOR ULUNG ⚔️','PRAJURIT TANGGUH 🛡️','PEJUANG ARENA 🔥','GLADIATOR BERANI 🗡️'];
    let html='<h1 class="brand-title" style="font-size:3rem">HASIL AKHIR</h1><p class="subtitle">PERINGKAT & GELAR PARA GLADIATOR</p><div class="final-ranking-list">';
    sorted.forEach(([n,score],i)=>{
      const cls=i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'rank-none';
      html+=`<div class="medal-box ${cls}"><span><b>#${i+1}</b> ${titles[i]||'GLADIATOR'} — ${this.esc(n)}</span><span>${score} PT</span></div>`;
    });
    html+='</div><button class="btn-action" id="return-role" style="width:min(500px,90vw)">KEMBALI KE PILIHAN HOST / PESERTA</button>';
    $('final-content').innerHTML=html;
    $('return-role').onclick=()=>this.resetToRole();
  },
  showFinalRanking(sorted,host=true){this.renderFinalRanking(sorted);this.show('screen-final');},
  resetToRole(){
    clearInterval(this.hostState.timer);this.connections.forEach(c=>{try{c.close()}catch(e){}});this.connections.clear();try{this.peer?.destroy()}catch(e){}
    this.mode=null;this.peer=null;this.hostConn=null;this.roomCode=null;this.hostState={players:[],king:null,queue:[],scores:{},round:1,maxRounds:2,duelIndex:0,question:null,options:[],answerLetter:null,timeLeft:12,answered:{king:false,chal:false},timer:null,locked:false,materi:'Aqidah',kelas:'5',semester:'1',phase:'lobby',paused:false};
    $('result-overlay').classList.add('hidden');$('pause-overlay')?.classList.add('hidden');$('screen-final')?.classList.add('hidden');$('demo-controls')?.classList.add('hidden');$('btn-start-duel').disabled=false;$('btn-start-duel').classList.remove('hidden');this.show('screen-role');
  },
  togglePause(){if(!this.hostState.timer)return;this.hostState.paused=!this.hostState.paused;if(this.hostState.paused){clearInterval(this.hostState.timer);$('pause-overlay').classList.remove('hidden');$('btn-pause').textContent='▶️ LANJUTKAN';this.broadcast({type:'paused'})}else{$('pause-overlay').classList.add('hidden');$('btn-pause').textContent='⏸ JEDA';this.startHostTimer()}},
  setJoinStatus(t){$('join-status').textContent=t},
  alert(title,msg){$('alert-title').textContent=title;$('alert-message').textContent=msg;$('alert-overlay').classList.add('show')},closeAlert(){$('alert-overlay').classList.remove('show')},
  confetti(){const c=$('confetti-container');c.innerHTML='';const colors=['#ffcf40','#ff4d4d','#27ae60','#3498db','#fff'];for(let i=0;i<70;i++){const p=document.createElement('div');p.className='confetti-piece';p.style.left=Math.random()*100+'vw';p.style.background=colors[Math.floor(Math.random()*colors.length)];p.style.width=6+Math.random()*6+'px';p.style.height=10+Math.random()*8+'px';p.style.animationDuration=2.5+Math.random()*2+'s';c.appendChild(p)}setTimeout(()=>c.innerHTML='',5500)},
  esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
};

window.addEventListener('load',()=>App.init());
