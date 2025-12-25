// utils.js

// --- Sound System ---
export const SoundSys = {
    ctx: null,
    isMuted: false, // Internal state

    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    setMuted: function(bool) {
        this.isMuted = bool;
    },
    playTone: function(freq, type, duration, vol=0.1) {
        if (this.isMuted || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    click: function() { this.playTone(800, 'square', 0.05, 0.05); },
    blip: function() { this.playTone(1200, 'sine', 0.15, 0.1); },
    alert: function() { 
        this.playTone(1500, 'square', 0.1, 0.2); 
        setTimeout(() => this.playTone(1500, 'square', 0.1, 0.2), 150);
    }
};

// --- Themes ---
const Themes = {
    green: { main: '#33ff00', system: '#ffaa00', chat: '#00ccff', error: '#ff3333', radio: '#ff33cc' },
    amber: { main: '#ffb000', system: '#ffcc00', chat: '#ffb000', error: '#ff5500', radio: '#ff8800' },
    blue:  { main: '#0088ff', system: '#00aaff', chat: '#00ffff', error: '#ff3333', radio: '#cc00ff' },
    white: { main: '#e0e0e0', system: '#ffffff', chat: '#cccccc', error: '#ff3333', radio: '#ff00ff' },
    matrix: { main: '#00ff41', system: '#008f11', chat: '#003b00', error: '#ff3333', radio: '#00ff00' }
};

export function applyTheme(themeName) {
    const theme = Themes[themeName];
    if (!theme) return false;
    const r = document.documentElement;
    r.style.setProperty('--terminal-main', theme.main);
    r.style.setProperty('--terminal-glow', theme.main);
    r.style.setProperty('--system-color', theme.system);
    r.style.setProperty('--chat-color', theme.chat);
    r.style.setProperty('--error-color', theme.error);
    if(theme.radio) r.style.setProperty('--radio-color', theme.radio);
    return true;
}

// --- ASCII Logic ---
export async function fetchAscii(url) {
    const lowerUrl = url.toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/.test(lowerUrl);
    
    if (isImage) {
        return await convertImageToAscii(url);
    } else {
        // Try fetching as text
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network error: " + response.status);
        return await response.text();
    }
}

export function convertImageToAscii(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        
        img.onload = () => {
            const cols = 100; // Resolution
            const charAspect = 0.5; 
            const aspect = img.height / img.width;
            const rows = Math.floor(cols * aspect * charAspect);
            
            const canvas = document.createElement('canvas');
            canvas.width = cols;
            canvas.height = rows;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, 0, 0, cols, rows);
            
            try {
                const data = ctx.getImageData(0, 0, cols, rows).data;
                let ascii = "";
                const chars = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
                
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        const i = (y * cols + x) * 4;
                        const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
                        const charIdx = Math.floor((brightness / 255) * (chars.length - 1));
                        ascii += chars[charIdx];
                    }
                    ascii += "\n";
                }
                resolve(ascii);
            } catch (e) {
                reject(new Error("CORS blocked image data access. Try using an image host like Imgur."));
            }
        };
        
        img.onerror = () => reject(new Error("Failed to load image. Check URL."));
    });
}