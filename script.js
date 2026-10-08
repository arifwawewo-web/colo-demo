// --- SOUND EFFECTS (Web Audio API, tanpa file eksternal) ---
const Sound = {
    enabled: true,
    ctx: null,

    getCtx() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
        }
        return this.ctx;
    },

    tone(freq, duration, type = 'sine', delay = 0, gain = 0.2) {
        if (!this.enabled) return;
        try {
            const ctx = this.getCtx();
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.connect(g);
            g.connect(ctx.destination);
            const startAt = ctx.currentTime + delay;
            g.gain.setValueAtTime(gain, startAt);
            g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
            osc.start(startAt);
            osc.stop(startAt + duration);
        } catch (e) { /* audio diblokir browser, abaikan */ }
    },

    correct() {
        this.tone(523.25, 0.15, 'triangle', 0);
        this.tone(783.99, 0.2, 'triangle', 0.12);
    },

    wrong() {
        this.tone(180, 0.3, 'sawtooth', 0, 0.15);
    },

    timeout() {
        this.tone(140, 0.4, 'sawtooth', 0, 0.15);
    },

    kingChange() {
        this.tone(392, 0.12, 'triangle', 0);
        this.tone(523.25, 0.12, 'triangle', 0.13);
        this.tone(659.25, 0.22, 'triangle', 0.26);
    },

    victory() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.25, 'triangle', i * 0.15));
    },

    toggle() {
        this.enabled = !this.enabled;
        const btn = document.getElementById('btn-sound');
        if (btn) btn.innerText = this.enabled ? '🔊' : '🔇';
    }
};

const Game = {
    roasts: {
        kingWins: [
            "Tahta ini terlalu tinggi buatmu, ${target}!", 
            "Minggir kamu ${target}! Raja tak terkalahkan.", 
            "Cuma segitu kemampuanmu, ${target}?"
        ],
        chalWins: [
            "Raja baru telah tiba! Turun kamu ${target}!", 
            "Payah kamu ${target}, tahta ini milikku!", 
            "Rakyat bosan denganmu, ${target}!"
        ],
        audienceRoast: [
            "Penonton kecewa! ${k} dan ${c} sama-sama zonk!", 
            "Mending kalian berdua pulang aja!", 
            "Dewa pun geleng-geleng melihat ${k} dan ${c}."
        ]
    },

    db: [{ q: "Siapa kaisar pembangun Colosseum?", a: "Vespasianus", o: ["Nero", "Caesar", "Augustus"] }],
    
    state: { 
        players: [], 
        king: null, 
        queue: [], 
        scores: {}, 
        currentRound: 1, 
        maxRounds: 3, 
        duelCount: 0, 
        isLock: false, 
        answered: { king: false, chal: false },
        materi: null,
        kelas: null,
        semester: null,
        filteredQuestions: [],
        ansLet: null,
        dataLoaded: false,
        usedQuestions: [],
        timeLimit: 12,
        timeLeft: 12,
        timerId: null,
        isPaused: false,
        pausedButtons: []
    },

    // --- NAVIGATION ---
    switchScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
        if (id === 'screen-intro') this.playIntro();
    },

    playIntro() {
        setTimeout(() => document.getElementById('i1').style.opacity = "1", 1000);
        setTimeout(() => document.getElementById('i2').style.opacity = "1", 2500);
        setTimeout(() => document.getElementById('i3').style.opacity = "1", 4000);
        setTimeout(() => document.getElementById('gb').style.opacity = "1", 5500);
    },

    // --- DATA & SELECTION ---
    loadFromGSS() {
        const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSkQqLHfqQtnvAw5FB_Qfl7Gtg8G5w4KTkQWihrpHAakEDi42rFHYlW39AOM0DI1d2nvWfZ0BjRoPiE/pub?output=csv";
        fetch(url)
            .then(res => res.text())
            .then(csv => {
                const rows = csv.trim().split("\n").map(r => r.split(","));
                rows.shift(); // Remove header
                this.db = rows
                    .map(r => ({
                        kelas: (r[0] || "").trim(),
                        semester: (r[1] || "").trim(),
                        materi: (r[2] || "").trim(),
                        q: (r[3] || "").trim(),
                        a: (r[4] || "").trim(),
                        o: [r[5], r[6], r[7]].map(x => (x || "").trim())
                    }))
                    // Buang baris kosong/rusak (misal baris kosong di akhir sheet)
                    .filter(d => d.materi && d.kelas && d.semester && d.q && d.a);

                this.state.dataLoaded = true;
                this.enableLanjutButton();
                this.refreshFilterOptions();
                console.log("Soal berhasil dimuat:", this.db.length);
            })
            .catch(err => {
                console.error("Gagal ambil GSS:", err);
                const btn = document.getElementById('btn-lanjut');
                if (btn) btn.innerText = "⚠️ GAGAL MEMUAT SOAL";
                showAlert("ARENA BELUM SIAP", "Gagal mengambil soal. Cek koneksi internet, lalu muat ulang halaman (F5).");
            });
    },

    enableLanjutButton() {
        const btn = document.getElementById('btn-lanjut');
        if (btn) {
            btn.disabled = false;
            btn.innerText = "LANJUTKAN ⚔️";
        }
    },

    // --- FILTER DINAMIS: cuma tampilkan opsi yang beneran ada soalnya (rekomendasi #2) ---
    MATERI_ICONS: {
        'aqidah': { icon: '🕌', label: 'Aqidah' },
        'akhlaq': { icon: '✨', label: 'Akhlaq' },
        'quran': { icon: '📖', label: "Al-Qur'an" },
        "al-qur'an": { icon: '📖', label: "Al-Qur'an" },
        'fiqih': { icon: '⚖️', label: 'Fiqih' },
        'tarikh': { icon: '🏛️', label: 'Tarikh' }
    },

    // Ambil subset db sesuai pilihan dropdown SAAT INI, kecuali dimensi "excluding"
    // (dipakai supaya dropdown gak nge-filter dirinya sendiri)
    getFilteredDb(excluding) {
        const materiVal = document.getElementById('materi-select').value;
        const kelasVal = document.getElementById('kelas-select').value;
        const semesterVal = document.getElementById('semester-select').value;

        return this.db.filter(d => {
            if (excluding !== 'materi' && materiVal && d.materi.toLowerCase() !== materiVal.toLowerCase()) return false;
            if (excluding !== 'kelas' && kelasVal && String(d.kelas) !== kelasVal) return false;
            if (excluding !== 'semester' && semesterVal && String(d.semester) !== semesterVal) return false;
            return true;
        });
    },

    refreshFilterOptions() {
        if (!this.state.dataLoaded) return;
        this.populateMateriOptions();
        this.populateKelasOptions();
        this.populateSemesterOptions();
    },

    populateMateriOptions() {
        const select = document.getElementById('materi-select');
        const current = select.value;
        const pool = this.getFilteredDb('materi');

        // Dedupe case-insensitive, pertahankan casing yang pertama muncul
        const seen = {};
        pool.forEach(d => { const k = d.materi.toLowerCase(); if (!seen[k]) seen[k] = d.materi; });
        const distinct = Object.values(seen).sort();

        select.innerHTML = '<option value="">⚔️ Pilih Materi</option>' +
            distinct.map(m => {
                const meta = this.MATERI_ICONS[m.toLowerCase()] || { icon: '📚', label: m };
                return `<option value="${m}">${meta.icon} ${meta.label}</option>`;
            }).join('');

        if (distinct.includes(current)) select.value = current;
    },

    populateKelasOptions() {
        const select = document.getElementById('kelas-select');
        const current = select.value;
        const pool = this.getFilteredDb('kelas');
        const distinct = [...new Set(pool.map(d => String(d.kelas)))].sort((a, b) => Number(a) - Number(b));

        select.innerHTML = '<option value="">🎓 Pilih Kelas</option>' +
            distinct.map(k => `<option value="${k}">Kelas ${k}</option>`).join('');

        if (distinct.includes(current)) select.value = current;
    },

    populateSemesterOptions() {
        const select = document.getElementById('semester-select');
        const current = select.value;
        const pool = this.getFilteredDb('semester');
        const distinct = [...new Set(pool.map(d => String(d.semester)))].sort();

        select.innerHTML = '<option value="">📅 Pilih Semester</option>' +
            distinct.map(s => `<option value="${s}">Semester ${s}</option>`).join('');

        if (distinct.includes(current)) select.value = current;
    },

    // Begitu satu dropdown dipilih, dua dropdown lainnya ikut nge-refresh
    // supaya kombinasi yang gak punya soal gak bisa dipilih sama sekali
    bindFilterListeners() {
        const materiSelect = document.getElementById('materi-select');
        const kelasSelect = document.getElementById('kelas-select');
        const semesterSelect = document.getElementById('semester-select');

        materiSelect.addEventListener('change', () => {
            if (!this.state.dataLoaded) return;
            this.populateKelasOptions();
            this.populateSemesterOptions();
        });
        kelasSelect.addEventListener('change', () => {
            if (!this.state.dataLoaded) return;
            this.populateMateriOptions();
            this.populateSemesterOptions();
        });
        semesterSelect.addEventListener('change', () => {
            if (!this.state.dataLoaded) return;
            this.populateMateriOptions();
            this.populateKelasOptions();
        });
    },

    startSelection() {
        const input = document.getElementById('player-input').value;
        const list = [...new Set(input.split(/[,\n]/).map(s => s.trim()).filter(s => s))];
        
        if (list.length < 2) return alert("Minimal 2 Gladiator!");
        
        this.state.players = list;
        list.forEach(p => this.state.scores[p] = 0);
        this.switchScreen('screen-selection');

        const king = list[Math.floor(Math.random() * list.length)];
        const strip = document.getElementById('roulette-strip');
        
        // Animasi Roulette
        strip.innerHTML = Array(20).fill(list).flat()
            .map(n => `<div style="height:150px;line-height:150px;text-align:center;font-size:2rem;">${n}</div>`)
            .join('') + 
            `<div style="height:150px;line-height:150px;text-align:center;font-size:2.5rem;color:var(--gold);">${king}</div>`;
        
        setTimeout(() => strip.style.top = `-${(strip.children.length - 1) * 150}px`, 100);
        
        setTimeout(() => {
            this.state.king = king;
            this.state.queue = list.filter(p => p !== king).sort(() => Math.random() - 0.5);
            this.showBriefing();
        }, 4500);
    },

    showBriefing() {
        this.switchScreen('screen-briefing');
        document.getElementById('k-brief').innerText = this.state.king;
        document.getElementById('c-brief').innerText = this.state.queue[0];
        document.getElementById('queue-container').innerHTML = this.state.queue
            .map((name, i) => `<div style="background:#2c3e50; padding:8px; font-size:0.9rem;">#${i+1} ${name}</div>`)
            .join('');
    },

    enterArena() {
        this.switchScreen('screen-battle');
        this.loadMatch();
    },

    // --- GAMEPLAY ---
    loadMatch() {
        if (this.state.currentRound > this.state.maxRounds) return this.endGame();
        
        this.state.isLock = false;
        this.state.answered = { king: false, chal: false };
        
        document.getElementById('king-name').innerText = this.state.king;
        document.getElementById('chal-name').innerText = this.state.queue[0];
        document.getElementById('king-score').innerText = this.state.scores[this.state.king];
        document.getElementById('chal-score').innerText = this.state.scores[this.state.queue[0]];
        document.getElementById('round-info').innerText = `PUTARAN ${this.state.currentRound} - DUEL ${this.state.duelCount + 1}`;

        // Antrean berikutnya, sesuai urutan maju (rekomendasi #3)
        const nextList = document.getElementById('next-up-list');
        if (nextList) {
            const upcoming = this.state.queue.slice(1);
            if (upcoming.length === 0) {
                nextList.innerHTML = '<div class="next-up-chip">— Ini duel terakhir di antrean —</div>';
            } else {
                nextList.innerHTML = upcoming.map((name, i) => `
                    <div class="next-up-chip ${i === 0 ? 'next-up-soon' : ''}">
                        <span class="next-up-order">#${i + 1}</span> ${name}
                    </div>
                `).join('');
            }
        }

        // Progress keseluruhan (rekomendasi #4)
        const totalChallengers = this.state.queue.length;
        const totalDuels = this.state.maxRounds * totalChallengers;
        const duelIndexOverall = (this.state.currentRound - 1) * totalChallengers + this.state.duelCount + 1;
        const progressText = document.getElementById('progress-text');
        const progressBar = document.getElementById('progress-bar-inner');
        if (progressText) progressText.innerText = `Duel ${duelIndexOverall} / ${totalDuels}`;
        if (progressBar) progressBar.style.width = `${Math.min(100, ((duelIndexOverall - 1) / totalDuels) * 100)}%`;
        
        let pool = this.state.filteredQuestions;
        if (this.state.kelas) {
            pool = pool.filter(d => String(d.kelas) === String(this.state.kelas));
        }
        if (this.state.materi) {
            pool = pool.filter(d => d.materi === this.state.materi);
        }
        if (this.state.semester) {
            pool = pool.filter(d => String(d.semester) === String(this.state.semester));
        }

        if (pool.length === 0) {
            showAlert("ARENA KOSONG", "Para dewa belum menurunkan soal untuk pertarungan ini...");
            document.getElementById('opt-text').innerHTML = "";
            return;
        }

        // Hindari soal yang sudah keluar (rekomendasi #2). Kalau seluruh pool sudah
        // pernah dipakai, baru dianggap satu putaran penuh selesai dan direset.
        let freshPool = pool.filter(d => !this.state.usedQuestions.includes(d.q));
        if (freshPool.length === 0) {
            this.state.usedQuestions = [];
            freshPool = pool;
        }

        const qData = freshPool[Math.floor(Math.random() * freshPool.length)];
        this.state.usedQuestions.push(qData.q);

        const opts = [qData.a, ...qData.o].sort(() => Math.random() - 0.5);
        this.state.ansLet = String.fromCharCode(65 + opts.indexOf(qData.a));
        
        document.getElementById('q-text').innerText = qData.q;
        document.getElementById('opt-text').innerHTML = opts
            .map((o, i) => `<div><b>${String.fromCharCode(65+i)}.</b> ${o}</div>`)
            .join('');
        
        document.querySelectorAll('.pad-btn').forEach(b => {
            b.classList.remove('wrong', 'correct');
            b.disabled = false;
        });

        this.startTimer();
    },

    // --- TIMER (rekomendasi #1) ---
    startTimer() {
        this.clearTimer();
        this.state.isPaused = false;
        this.state.timeLeft = this.state.timeLimit;

        const bar = document.getElementById('timer-bar-inner');
        if (bar) {
            bar.style.transition = 'none';
            bar.style.width = '100%';
            bar.classList.remove('timer-warn', 'timer-danger');
            void bar.offsetWidth; // paksa reflow biar transisi berikutnya mulus
            bar.style.transition = 'width 1s linear, background-color 1s linear';
        }

        this.state.timerId = setInterval(() => this.timerTick(), 1000);
    },

    timerTick() {
        this.state.timeLeft--;
        this.updateTimerBar();

        if (this.state.timeLeft <= 0) {
            this.clearTimer();
            if (!this.state.isLock) {
                this.state.isLock = true;
                document.querySelectorAll('.pad-btn').forEach(b => b.disabled = true);
                Sound.timeout();
                this.showFeedback(null, null, false, null, true);
            }
        }
    },

    updateTimerBar() {
        const bar = document.getElementById('timer-bar-inner');
        if (!bar) return;
        const pct = Math.max(0, (this.state.timeLeft / this.state.timeLimit) * 100);
        bar.style.width = pct + '%';
        bar.classList.remove('timer-warn', 'timer-danger');
        if (this.state.timeLeft <= 3) bar.classList.add('timer-danger');
        else if (this.state.timeLeft <= 6) bar.classList.add('timer-warn');
    },

    clearTimer() {
        if (this.state.timerId) {
            clearInterval(this.state.timerId);
            this.state.timerId = null;
        }
    },

    // --- JEDA DARURAT (rekomendasi #4) ---
    togglePause() {
        if (this.state.isPaused) this.resumeTimer();
        else this.pauseTimer();
    },

    pauseTimer() {
        // Gak bisa jeda kalau timer emang lagi gak jalan (misal pas overlay hasil/roast muncul)
        if (this.state.isPaused || this.state.isLock || !this.state.timerId) return;

        this.state.isPaused = true;
        this.clearTimer();

        this.state.pausedButtons = [];
        document.querySelectorAll('.pad-btn').forEach(b => {
            if (!b.disabled) {
                b.disabled = true;
                this.state.pausedButtons.push(b);
            }
        });

        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.classList.remove('hidden');
        const btn = document.getElementById('btn-pause');
        if (btn) btn.innerText = '▶️ LANJUTKAN';
    },

    resumeTimer() {
        if (!this.state.isPaused) return;
        this.state.isPaused = false;

        (this.state.pausedButtons || []).forEach(b => b.disabled = false);
        this.state.pausedButtons = [];

        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.classList.add('hidden');
        const btn = document.getElementById('btn-pause');
        if (btn) btn.innerText = '⏸ JEDA';

        this.state.timerId = setInterval(() => this.timerTick(), 1000);
    },

    submit(side, choice, btn) {
        if (this.state.answered[side] || this.state.isLock) return;
        
        if (choice === this.state.ansLet) {
            this.state.isLock = true;
            this.clearTimer();
            btn.classList.add('correct');
            Sound.correct();
            const winner = side === 'king' ? this.state.king : this.state.queue[0];
            const loser = side === 'king' ? this.state.queue[0] : this.state.king;
            this.state.scores[winner] += 10;
            this.showFeedback(winner, loser, true, side);
        } else {
            this.state.answered[side] = true;
            btn.classList.add('wrong');
            btn.disabled = true;
            Sound.wrong();
            if (this.state.answered.king && this.state.answered.chal) {
                this.clearTimer();
                this.showFeedback(null, null, false);
            }
        }
    },

    showFeedback(winner, loser, isCorrect, side, isTimeout) {
        this.clearTimer();
        const overlay = document.getElementById('result-overlay');
        overlay.classList.remove('hidden');
        let title = "", roast = "";
        
        if (isCorrect) {
            title = side === 'king' ? "RAJA BERTAHAN!" : "TAHTA DIREBUT!";
            const rList = side === 'king' ? this.roasts.kingWins : this.roasts.chalWins;
            roast = rList[Math.floor(Math.random() * rList.length)].replace('${target}', loser);
            if (side === 'chal') Sound.kingChange();
        } else if (isTimeout) {
            title = "WAKTU HABIS!";
            roast = this.roasts.audienceRoast[Math.floor(Math.random() * this.roasts.audienceRoast.length)]
                .replace('${k}', this.state.king).replace('${c}', this.state.queue[0]);
        } else {
            title = "SEMUA SALAH!";
            roast = this.roasts.audienceRoast[Math.floor(Math.random() * this.roasts.audienceRoast.length)]
                .replace('${k}', this.state.king).replace('${c}', this.state.queue[0]);
        }
        
        overlay.innerHTML = `<h1 style="font-size:4rem; font-family:'Cinzel'; color:white;">${title}</h1><div class="roast-text">"${roast}"</div>`;
        
        setTimeout(() => {
            overlay.classList.add('hidden');
            if (isCorrect && side === 'chal') {
                const oldKing = this.state.king;
                this.state.king = this.state.queue.shift();
                this.state.queue.push(oldKing);
            } else {
                this.state.queue.push(this.state.queue.shift());
            }
            
            this.state.duelCount++;
            if (this.state.duelCount >= this.state.queue.length) {
                this.state.duelCount = 0;
                this.state.currentRound++;
            }
            this.loadMatch();
        }, 3500);
    },

    endGame() {
        this.clearTimer();
        Sound.victory();
        this.spawnConfetti();
        const overlay = document.getElementById('result-overlay');
        const sorted = Object.entries(this.state.scores).sort((a,b) => b[1] - a[1]);
        
        const getTitle = (i, s) => {
            if(s === 0) return "TAWANAN ARENA ⛓️";
            if(i === 0) return "KAISAR ARENA 👑"; 
            if(i === 1) return "GLADIATOR ULUNG ⚔️"; 
            if(i === 2) return "PRAJURIT TANGGUH 🛡️"; 
            return "RAKYAT JELATA 📯";
        };

        const getCls = (i) => i===0 ? 'rank-1' : i===1 ? 'rank-2' : i===2 ? 'rank-3' : 'rank-none';
        
        let res = `<h1 class="brand-title" style="font-size:3rem;">HASIL AKHIR</h1>`;
        sorted.forEach(([n, s], i) => {
            res += `<div class="medal-box ${getCls(i)}"><span>${getTitle(i, s)}: ${n}</span><span>${s} PT</span></div>`;
        });
        
        overlay.innerHTML = `
            <div style="overflow-y:auto; width:100%; display:flex; flex-direction:column; align-items:center;">${res}</div>
            <button onclick="location.reload()" class="btn-action" style="width:auto; margin-top:20px;">MAIN LAGI 🏛️</button>
        `;
        overlay.classList.remove('hidden');
    },

    // --- CONFETTI (rekomendasi #3) ---
    spawnConfetti(count = 90) {
        let container = document.getElementById('confetti-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'confetti-container';
            document.body.appendChild(container);
        }
        container.innerHTML = ''; // buang sisa confetti game sebelumnya kalau ada

        const colors = ['#ffcf40', '#ff4d4d', '#27ae60', '#3498db', '#ffffff', '#b8860b'];
        for (let i = 0; i < count; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = (Math.random() * 100) + 'vw';
            piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            piece.style.width = (6 + Math.random() * 6) + 'px';
            piece.style.height = (10 + Math.random() * 8) + 'px';
            piece.style.animationDuration = (2.5 + Math.random() * 2) + 's';
            piece.style.animationDelay = (Math.random() * 1.2) + 's';
            container.appendChild(piece);
        }

        // Bersihkan DOM otomatis setelah animasi selesai biar gak numpuk
        setTimeout(() => { container.innerHTML = ''; }, 5500);
    }
};

// --- GLOBAL HELPERS ---
function getKelasDariURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("kelas");
}

function cekSoalTersedia() {
    let pool = Game.db;
    if (Game.state.kelas) {
        pool = pool.filter(d => String(d.kelas).trim() === String(Game.state.kelas).trim());
    }
    if (Game.state.materi) {
        pool = pool.filter(d => d.materi.toLowerCase().trim() === Game.state.materi.toLowerCase().trim());
    }
    if (Game.state.semester) {
        pool = pool.filter(d => String(d.semester).trim() === String(Game.state.semester).trim());
    }
    return pool.length > 0;
}

function pilihFilter() {
    if (!Game.state.dataLoaded) {
        showAlert("ARENA BELUM SIAP", "Soal masih dimuat dari langit, tunggu sebentar ya...");
        return;
    }

    const materi = document.getElementById('materi-select').value;
    const kelas = document.getElementById('kelas-select').value;
    const semester = document.getElementById('semester-select').value;

    if (!materi || !kelas || !semester) {
        showAlert("PERINTAH TIDAK LENGKAP", "Gladiator harus memilih materi, kelas, dan semester sebelum bertarung!");
        return;
    }

    if (Game.db.length === 0) {
        showAlert("ARENA BELUM SIAP", "Para dewa masih menyiapkan soal...");
        return;
    }

    const pool = Game.db.filter(d => {
        return String(d.kelas).trim() === kelas &&
               String(d.semester).trim() === semester &&
               d.materi.toLowerCase().trim() === materi.toLowerCase();
    });

    if (pool.length === 0) {
        showAlert("TAKDIR MENOLAKMU", `Tidak ada soal untuk ${materi} - Kelas ${kelas} Semester ${semester}`);
        return;
    }

    Game.state.filteredQuestions = pool;
    Game.state.materi = materi;
    Game.state.kelas = kelas;
    Game.state.semester = semester;

    const rondeVal = parseInt(document.getElementById('ronde-select').value, 10);
    Game.state.maxRounds = (!isNaN(rondeVal) && rondeVal > 0) ? rondeVal : 3;
    Game.state.usedQuestions = [];

    Game.switchScreen('screen-input');
}

function masukArenaCek() {
    Game.enterArena();
}

function showAlert(title, message) {
    const overlay = document.getElementById('alert-overlay');
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    overlay.classList.add('show');
}

function closeAlert() {
    document.getElementById('alert-overlay').classList.remove('show');
}

// --- INITIALIZE ---
window.onload = () => {
    Game.playIntro();
    Game.bindFilterListeners();
    const kelas = getKelasDariURL();
    if (kelas) {
        Game.state.kelas = kelas;
        const kelasSelect = document.getElementById('kelas-select');
        if (kelasSelect) kelasSelect.value = kelas;
        console.log("Kelas terpilih dari URL:", kelas);
    }
    Game.loadFromGSS();
};

// Shortcut spasi buat jeda darurat (opsional, gak ganggu tap di TV)
document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    const battleScreen = document.getElementById('screen-battle');
    if (battleScreen && !battleScreen.classList.contains('hidden')) {
        e.preventDefault();
        Game.togglePause();
    }
});
